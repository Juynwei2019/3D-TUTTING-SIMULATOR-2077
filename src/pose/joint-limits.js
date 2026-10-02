import * as THREE from "three";
import { D, R } from "../math/angles.js";
import { eulerToQuat } from "../math/quaternions.js";

export function createJointLimiter(getLimits) {
  // 單一軸的夾緊：未啟用直接放行；min/max填反時自動互換，避免使用者填錯直接把角度鎖死在同一個值。
  function clampAxisValue(v, axisLimit){
    if (!axisLimit || !axisLimit.enabled) return v;
    let lo = axisLimit.min, hi = axisLimit.max;
    if (lo > hi){ const t = lo; lo = hi; hi = t; }
    return Math.min(hi, Math.max(lo, v));
  }

  // ==== Swing-Twist + 橢圓錐限制（球窩關節專用：肩／髖）====
  // 背景：獨立矩形夾限（上面的 clampAxisValue／逐軸各自 min~max）對球窩關節在極端姿勢下
  // 只是近似值——它允許「多軸同時貼近各自極限」的角落姿勢（例如 X=90°、Z=90° 同時發生），
  // 但真實肩／髖關節的可動範圍其實比較接近一個橢圓錐，兩軸同時拉到極限時骨骼、韌帶會互相卡住，
  // 實際上到不了那個角落。
  //
  // 做法：把關節相對 rest pose 的旋轉四元數分解成
  //   twist：繞骨骼長軸的自轉（對應肩／髖的內旋／外旋），沿用 y 軸的 min/max 獨立夾限；
  //   swing：垂直於骨骼長軸的擺動（對應前後／左右抬起），用 x／z 的 min/max 組成橢圓錐夾限，
  //          即 (swingX/limX)²+(swingZ/limZ)² ≤ 1，而不是各自獨立的矩形，
  //          這樣就不會再出現「兩軸同時拉滿」的不可能姿勢。
  // 夾完再組合回四元數、換算回 [x,y,z] 角度寫回 target/current，
  // 對外呼叫端（滑桿、IK、動作生成、關鍵影格…）完全不用改，介面上的三個數字意義不變，
  // 只是「合法範圍」從矩形變成橢圓錐。
  //
  // ⚠️ 骨骼長軸假設為本地 +Y（Mixamo 標準骨架命名慣例：骨骼局部 +Y 指向子關節），
  // 沒有針對 Xbot.glb 逐骨骼實測校正。如果套用後肩／髖轉起來視覺上「歪掉」
  // （例如 Y 滑桿變成在做抬手而不是內外旋），就是這個假設在該骨骼上不成立，
  // 到下面 SWING_TWIST_AXIS_OVERRIDES 填入該骨骼實際的長軸方向即可，不用改其他邏輯。
  // 目前只套用在 rArm/lArm（上臂＝肩關節）、rUpLeg/lUpLeg（大腿＝髖關節）；
  // 手肘/膝蓋是絞鏈關節、手指/脊椎/頭頸也不是球窩關節，維持原本矩形夾限即可，行為不變。
  const SWING_TWIST_JOINTS = new Set(["rArm","lArm","rUpLeg","lUpLeg"]);
  const SWING_TWIST_AXIS_OVERRIDES = {
    // key: new THREE.Vector3(x,y,z)　→　若某骨骼長軸其實不是本地 +Y，在這裡覆寫即可，會自動 normalize。
    // 範例：rArm: new THREE.Vector3(1,0,0)
  };
  const _stDefaultTwistAxis = new THREE.Vector3(0,1,0);
  function getTwistAxis(key){
    return (SWING_TWIST_AXIS_OVERRIDES[key] || _stDefaultTwistAxis).clone().normalize();
  }

  // ---- 共用暫存物件（避免每次呼叫都 new，熱路徑友善）----
  const _stQuat = new THREE.Quaternion();
  const _stTwist = new THREE.Quaternion();
  const _stSwing = new THREE.Quaternion();
  const _stAxisVec = new THREE.Vector3();
  const _stU = new THREE.Vector3();
  const _stV = new THREE.Vector3();
  const _stRVec = new THREE.Vector3();
  const _stRefX = new THREE.Vector3(1,0,0);
  const _stRefY = new THREE.Vector3(0,1,0);
  const _stEuler = new THREE.Euler();

  // 找出跟 twistAxis 垂直、互相正交的兩個單位向量 u,v，當作「擺動平面」的座標基底。
  function perpBasis(twistAxis, outU, outV){
    const ref = Math.abs(twistAxis.x) < 0.9 ? _stRefX : _stRefY; // 挑一個跟 twistAxis 不平行的參考向量
    outU.crossVectors(twistAxis, ref).normalize();
    outV.crossVectors(twistAxis, outU).normalize();
  }

  // 對單一球窩關節的 [x,y,z]（角度）做 Swing-Twist 分解＋橢圓錐/範圍夾限，回傳新的 [x,y,z]（角度）。
  // 三軸都沒啟用限制時直接原樣放行，跟舊版 clampAxisValue 行為一致，不會多做四元數轉換。
  function clampSwingTwistJoint(key, xyzDeg){
    const lim = getLimits()[key];
    if (!lim.x.enabled && !lim.y.enabled && !lim.z.enabled) return xyzDeg;

    const twistAxis = getTwistAxis(key);
    eulerToQuat(xyzDeg, _stQuat); // 相對 rest pose 的四元數，寫進共用暫存

    // ---- 分解：twist（繞 twistAxis 的自轉）+ swing（垂直分量）----
    const dot = _stQuat.x*twistAxis.x + _stQuat.y*twistAxis.y + _stQuat.z*twistAxis.z;
    _stTwist.set(twistAxis.x*dot, twistAxis.y*dot, twistAxis.z*dot, _stQuat.w).normalize();
    _stSwing.copy(_stQuat).multiply(_stTwist.clone().invert()); // swing = q * twist⁻¹　（q = swing * twist）

    // ---- twist 夾限：沿用 y 軸 min/max，語意＝內旋／外旋角度 ----
    let twistRad = 2 * Math.atan2(dot, _stQuat.w); // atan2 對縮放不敏感，用未正規化的 dot/w 就足夠
    if (lim.y.enabled){
      twistRad = Math.min(D(lim.y.max), Math.max(D(lim.y.min), twistRad));
    }
    _stTwist.setFromAxisAngle(twistAxis, twistRad);

    // ---- swing 夾限：x/z 的 min/max 組成橢圓錐（兩軸都啟用時），單軸啟用時退化成單純範圍夾限 ----
    const xEnabled = lim.x.enabled, zEnabled = lim.z.enabled;
    if (xEnabled || zEnabled){
      perpBasis(twistAxis, _stU, _stV);
      const swingW = Math.min(1, Math.max(-1, _stSwing.w));
      const theta = 2 * Math.acos(swingW); // swing 的總擺動角（弧度）
      let sx = 0, sz = 0;
      if (theta > 1e-6){
        _stAxisVec.set(_stSwing.x, _stSwing.y, _stSwing.z).normalize();
        sx = theta * _stAxisVec.dot(_stU);
        sz = theta * _stAxisVec.dot(_stV);
      }
      if (xEnabled && zEnabled){
        const limX = D(sx >= 0 ? lim.x.max : Math.abs(lim.x.min));
        const limZ = D(sz >= 0 ? lim.z.max : Math.abs(lim.z.min));
        if (limX > 1e-6 && limZ > 1e-6){
          const nx = sx/limX, nz = sz/limZ, r2 = nx*nx + nz*nz;
          if (r2 > 1){ const s = 1/Math.sqrt(r2); sx *= s; sz *= s; }
        }
      } else if (xEnabled){
        const limX = D(sx >= 0 ? lim.x.max : Math.abs(lim.x.min));
        sx = sx >= 0 ? Math.min(sx, limX) : Math.max(sx, -limX);
      } else { // zEnabled only
        const limZ = D(sz >= 0 ? lim.z.max : Math.abs(lim.z.min));
        sz = sz >= 0 ? Math.min(sz, limZ) : Math.max(sz, -limZ);
      }
      // 用夾完的 (sx,sz) 反推回 swing 四元數：旋轉向量 r = sx*u + sz*v，長度＝角度、方向＝軸
      _stRVec.copy(_stU).multiplyScalar(sx).add(_stV.clone().multiplyScalar(sz));
      const newTheta = _stRVec.length();
      if (newTheta > 1e-9){
        _stRVec.multiplyScalar(1/newTheta);
        _stSwing.setFromAxisAngle(_stRVec, newTheta);
      } else {
        _stSwing.identity();
      }
    }
    // x、z 都沒啟用時 swing 完全不動，維持原本自由擺動（跟舊版矩形夾限「未啟用即放行」一致）。

    // ---- 組合回單一四元數，換算回 [x,y,z] 角度 ----
    _stQuat.copy(_stSwing).multiply(_stTwist); // q = swing * twist
    _stEuler.setFromQuaternion(_stQuat, "XYZ");
    return [
      Math.round(R(_stEuler.x)*10)/10,
      Math.round(R(_stEuler.y)*10)/10,
      Math.round(R(_stEuler.z)*10)/10
    ];
  }

  // 對外主要入口：傳入 jointKey + [x,y,z] 角度陣列，回傳夾緊後的新陣列（不修改傳入的原陣列）。
  // 沒有設定限制的 key（例如手指、下半身）直接原樣放行，完全不影響既有行為。
  // rArm/lArm/rUpLeg/lUpLeg（球窩關節）走 Swing-Twist + 橢圓錐限制，其餘關節維持原本矩形夾限。
  function clampJointAngles(key, xyz){
    const lim = getLimits()[key];
    if (!lim) return xyz;
    if (SWING_TWIST_JOINTS.has(key)){
      return clampSwingTwistJoint(key, xyz);
    }
    return [
      clampAxisValue(xyz[0], lim.x),
      clampAxisValue(xyz[1], lim.y),
      clampAxisValue(xyz[2], lim.z)
    ];
  }


  return { clampJointAngles };
}
