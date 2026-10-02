import * as THREE from "three";
import { BONE_SUFFIXES, FINGER_DEFS, HAND_SIDES, FINGER_JOINT_LABELS, FINGER_JOINT_KEYS, FINGER_JOINT_KEY_SET, ALL_JOINT_KEYS, LABEL_LOOKUP, OVERVIEW_GROUPS, IK_CHAINS, IK_LIMB_KEYS, SHOULDER_ASSIST_MAX_ANGLE, ROOT_FOLLOW_LERP_T_DEFAULT, SPINE_CCD_DAMPING_DEFAULT, SPINE_IK_CHAIN, LOOKAT_CONFIG, FINGER_IK_CHAINS, FINGER_IDS, FINGER_IK_PREFIX } from "../rig/definitions.js";
import { D, R, clampNum } from "../math/angles.js";
import { sampleTrajectoryFromPoints } from "../motion/trajectory.js";
import { solveTwoBoneIK } from "../ik/two-bone.js";

// Live host getters preserve shared rig and playback coordination.
export function createTrajectoryEditor(context){
const _EMPTY_OVERRIDE_LIMBS = [];

const _EMPTY_OVERRIDE_KEYS = new Set();

const _tpRootPos = new THREE.Vector3();

const _tpTargetPos = new THREE.Vector3();

const _tpPoleA = new THREE.Vector3();

const _tpPoleB = new THREE.Vector3();

const _tpPolePos = new THREE.Vector3();

function buildTrajMarkers(){
  for (const limb of IK_LIMB_KEYS){
    const lineMat = new THREE.LineBasicMaterial({ color:0x9944ff, transparent:true, opacity:0.75, depthTest:false });
    const line = new THREE.Line(new THREE.BufferGeometry(), lineMat);
    line.renderOrder = 996;
    line.visible = false;
    context.scene.add(line);
    context.trajLine[limb] = line;
  }
}

function createTrajPointAt(limb, worldPos){
  const geo = new THREE.SphereGeometry(0.026, 12, 12);
  const mat = new THREE.MeshBasicMaterial({ color:0x9944ff, transparent:true, opacity:0.9, depthTest:false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 998;
  mesh.position.copy(worldPos);
  mesh.visible = (limb === context.trajActiveLimb);
  mesh.userData.pickType = "trajPoint";
  mesh.userData.limb = limb;
  mesh.userData.index = context.trajPointMeshes[limb].length;
  context.scene.add(mesh);
  context.trajPointMeshes[limb].push(mesh);
  return mesh;
}

function addTrajPoint(limb){
  const targetMesh = context.ikTargetMeshes[limb];
  if (!targetMesh) return;
  createTrajPointAt(limb, targetMesh.position);
  updateTrajVisual(limb);
  renderTrajPointList();
  context.scheduleAutoSave();
}

function generateShapeTrajPoints(limb, shapeType, n, radius, plane, opts = {}){
  const targetMesh = context.ikTargetMeshes[limb];
  if (!targetMesh){ alert("找不到「" + limb + "」的 IK 目標球，請先到「手腳 IK」分頁開啟該肢體 IK"); return; }
  if (context.trajPointMeshes[limb].length > 0){
    const ok = confirm("這會清除「" + limb + "」目前已有的 " + context.trajPointMeshes[limb].length + " 個控制點，改成產生的形狀，確定要繼續嗎？");
    if (!ok) return;
  }
  clearTrajPoints(limb); // 內部已含 updateTrajVisual/renderTrajPointList/scheduleAutoSave，但下面還會再重繪一次沒關係

  const center = targetMesh.position.clone();
  const [axisA, axisB] = context.TRAJ_SHAPE_PLANE_AXES[plane] || context.TRAJ_SHAPE_PLANE_AXES.xz;
  // 短半徑只對橢圓形有意義；其餘形狀一律 rY = rX = radius，避免呼叫端不小心傳入不相干的 radiusY
  // （例如殘留的舊欄位值）把圓形/多邊形/星形拉成歪斜的橢圓。
  const radiusY = (shapeType === "ellipse" && typeof opts.radiusY === "number" && opts.radiusY > 0) ? opts.radiusY : radius;
  const innerRatio = clampNum(opts.innerRatio ?? 0.5, 0.1, 0.9);

  // 星形：n 是「角數」，實際頂點數是 2n（外角/內凹交替），跟圓形/橢圓形/多邊形統一用
  // 「單一迴圈依角度算頂點」的寫法，只是星形多了「奇偶頂點半徑不同」這個變化。
  const vertCount = (shapeType === "star") ? Math.round(clampNum(n, 3, 24)) * 2 : Math.round(clampNum(n, 3, 48));

  for (let i = 0; i < vertCount; i++){
    // -90度(即 -PI/2)偏移只是讓第一個點落在「正上方/正前方」，視覺上比較直覺，純美觀不影響形狀本身
    const angle = (i / vertCount) * Math.PI * 2 - Math.PI / 2;
    let rX = radius, rY = radiusY;
    if (shapeType === "star" && i % 2 === 1){ rX *= innerRatio; rY *= innerRatio; } // 奇數索引＝內凹頂點
    const offset = axisA.clone().multiplyScalar(Math.cos(angle) * rX)
      .add(axisB.clone().multiplyScalar(Math.sin(angle) * rY));
    createTrajPointAt(limb, center.clone().add(offset));
  }

  // 一律用折線＋封閉路徑：圓形/橢圓形點數夠多時折線本身就非常接近圓/橢圓，且能保證所有生成點都
  // 精確落在圓周/橢圓周上；正多邊形、星形的「直邊」更是形狀定義本身。曲線模式（Catmull-Rom）為了
  // 平滑，實際路徑會些微偏離控制點，反而讓形狀不夠「正」，所以形狀產生器一律不用曲線模式。
  context.TRAJ_MODE[limb] = "line";
  context.TRAJ_CLOSED[limb] = true;

  const modeSel = document.getElementById("trajModeSelect");
  if (modeSel && limb === context.trajActiveLimb) modeSel.value = "line";

  updateTrajVisual(limb);
  renderTrajPointList();
  context.scheduleAutoSave();
  context.pushHistory();
}

function removeTrajPoint(limb, idx){
  const arr = context.trajPointMeshes[limb];
  if (!arr[idx]) return;
  if (context.selectedIK && context.selectedIK.limb === limb && context.selectedIK.role === "trajPoint" && context.selectedIK.index === idx){
    context.deselectJoint();
  }
  context.scene.remove(arr[idx]);
  arr[idx].geometry.dispose();
  arr[idx].material.dispose();
  arr.splice(idx, 1);
  arr.forEach((m, i) => { m.userData.index = i; });
  updateTrajVisual(limb);
  renderTrajPointList();
  context.scheduleAutoSave();
}

function clearTrajPoints(limb){
  if (context.selectedIK && context.selectedIK.limb === limb && context.selectedIK.role === "trajPoint") context.deselectJoint();
  for (const m of context.trajPointMeshes[limb]){ context.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  context.trajPointMeshes[limb] = [];
  updateTrajVisual(limb);
  renderTrajPointList();
  context.scheduleAutoSave();
}

function updateTrajVisual(limb){
  const line = context.trajLine[limb];
  if (!line) return;
  const pts = context.trajPointMeshes[limb].map(m => m.position.clone());
  if (pts.length < 2){
    line.visible = false;
  } else {
    let linePts;
    const closed = context.TRAJ_CLOSED[limb] && pts.length >= 3; // 封閉至少需要3點才有意義，2點封閉只是來回抖動
    if (context.TRAJ_MODE[limb] === "curve" && pts.length >= 3){
      const curve = new THREE.CatmullRomCurve3(pts, closed);
      linePts = curve.getPoints(Math.max(20, pts.length * 10));
    } else {
      linePts = closed ? [...pts, pts[0]] : pts; // 折線封閉：預覽線多畫一段回到起點
    }
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(linePts);
    line.visible = (limb === context.trajActiveLimb);
  }
  updateTrajActiveVisibility();
}

function updateTrajActiveVisibility(){
  for (const limb of IK_LIMB_KEYS){
    const on = (limb === context.trajActiveLimb);
    for (const m of context.trajPointMeshes[limb]) m.visible = on;
    if (context.trajLine[limb]) context.trajLine[limb].visible = on && context.trajPointMeshes[limb].length >= 2;
  }
}

function setTrajActiveLimb(limb){
  context.trajActiveLimb = limb;
  updateTrajLimbButtons();
  updateTrajActiveVisibility();
  const modeSel = document.getElementById("trajModeSelect");
  if (modeSel) modeSel.value = context.TRAJ_MODE[limb];
  updateTrajClosedChkState();
  renderTrajPointList();
}

function updateTrajClosedChkState(){
  const chk = document.getElementById("trajClosedChk");
  if (!chk) return;
  const pts = context.trajPointMeshes[context.trajActiveLimb];
  const enoughPoints = !!pts && pts.length >= 3;
  chk.disabled = !enoughPoints;
  chk.checked = enoughPoints && context.TRAJ_CLOSED[context.trajActiveLimb];
}

function updateTrajLimbButtons(){
  for (const limb of IK_LIMB_KEYS){
    const btn = document.getElementById("trajLimbBtn_" + limb);
    if (btn) btn.classList.toggle("active", limb === context.trajActiveLimb);
  }
}

function renderTrajPointList(){
  const host = document.getElementById("trajPointList");
  if (!host) return;
  host.innerHTML = "";
  const pts = context.trajPointMeshes[context.trajActiveLimb];
  updateTrajClosedChkState();
  if (!pts || pts.length === 0){
    // 動態建立空清單提示文字，不依賴靜態 #trajPointEmpty 節點——
    // 該節點一旦在非空清單時被 host.innerHTML="" 清掉就永久脫離DOM，
    // 之後 getElementById 會一直回傳 null，導致清單卡死不再更新（已修正的舊bug）。
    const empty = document.createElement("span");
    empty.id = "trajPointEmpty";
    empty.textContent = "尚未新增控制點——先拖橘色目標球到位，再按「+ 新增控制點」";
    host.appendChild(empty);
    return;
  }
  pts.forEach((m, i) => {
    const chip = document.createElement("div");
    chip.className = "trajChip";
    if (context.selectedIK && context.selectedIK.limb === context.trajActiveLimb && context.selectedIK.role === "trajPoint" && context.selectedIK.index === i){
      chip.classList.add("active");
    }
    const sel = document.createElement("button");
    sel.className = "sel";
    sel.textContent = `P${i + 1}`;
    sel.onclick = () => context.selectIKMarker(context.trajActiveLimb, "trajPoint", i);
    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "×";
    del.onclick = (ev) => { ev.stopPropagation(); removeTrajPoint(context.trajActiveLimb, i); };
    chip.appendChild(sel);
    chip.appendChild(del);
    host.appendChild(chip);
  });
}

function sampleTrajectory(limb, t){
  const pts = context.trajPointMeshes[limb].map(m => m.position.clone());
  return sampleTrajectoryFromPoints(context.TRAJ_MODE[limb], pts, t, context.TRAJ_CLOSED[limb]);
}

function generateKeyframesFromTrajectory(limb){
  const pts = context.trajPointMeshes[limb];
  const chain = IK_CHAINS[limb];
  if (pts.length < 2){ alert("至少需要 2 個控制點才能生成軌跡拍點"); return; }
  if (!context.ikEnabled[limb]){ alert("請先到「手腳 IK」分頁開啟「" + chain.label + "」的 IK，再生成軌跡拍點"); return; }
  const rootBone = context.bones[chain.root], midBone = context.bones[chain.mid], endBone = context.bones[chain.end];
  if (!rootBone || !midBone || !endBone) return;

  const n = Math.round(clampNum(context.trajSampleCount, 2, 20));
  const trajId = "traj_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
  const mode = context.TRAJ_MODE[limb];
  const closed = context.TRAJ_CLOSED[limb] && pts.length >= 3;

  // 生成當下：以此刻 root 骨骼世界座標為原點，把所有控制點/pole換算成「相對root」的偏移量，
  // 這個原點只在生成當下取一次（見文件描述），之後每個取樣點都疊加在這個固定原點上。
  const rootPos = new THREE.Vector3(); rootBone.getWorldPosition(rootPos);
  const relPoints = pts.map(m => { const v = m.position.clone().sub(rootPos); return { x:v.x, y:v.y, z:v.z }; });
  const poleAbs = context.ikPoleMeshes[limb].position.clone();
  const poleRel = poleAbs.clone().sub(rootPos);
  const poleRelObj = { x:poleRel.x, y:poleRel.y, z:poleRel.z };

  for (let i = 0; i < n; i++){
    const t = i / (n - 1);
    const localOffset = sampleTrajectoryFromPoints(mode, relPoints, t, closed);
    const worldPos = rootPos.clone().add(localOffset);
    context.ikTargetMeshes[limb].position.copy(worldPos);

    context.solveRootFollowForLimb(limb);
    if (context.shoulderAssistEnabled) context.solveShoulderAssist(limb);
    solveTwoBoneIK(rootBone, midBone, endBone, context.ikTargetMeshes[limb].position, context.ikPoleMeshes[limb].position);
    context.syncTargetFromBone(chain.root);
    context.syncTargetFromBone(chain.mid);
    if (limb === "rLeg" || limb === "lLeg") context.applyFootLock(limb);
    context.applyEffectorOrientation(limb);

    context.addKeyframe();
    const kf = context.keyframes[context.keyframes.length - 1];
    kf.traj = kf.traj || {};
    kf.traj[limb] = { id: trajId, mode, points: relPoints, pole: poleRelObj, t, closed };
  }
  context.renderKeyframeChips();
  context.scheduleAutoSave();
}

function bindTrajUI(){
  for (const limb of IK_LIMB_KEYS){
    const btn = document.getElementById("trajLimbBtn_" + limb);
    if (btn) btn.onclick = () => setTrajActiveLimb(limb);
  }
  updateTrajLimbButtons();

  const modeSel = document.getElementById("trajModeSelect");
  if (modeSel){
    modeSel.value = context.TRAJ_MODE[context.trajActiveLimb];
    modeSel.onchange = (e) => {
      context.TRAJ_MODE[context.trajActiveLimb] = e.target.value;
      updateTrajVisual(context.trajActiveLimb);
      context.scheduleAutoSave();
    };
  }

  const closedChk = document.getElementById("trajClosedChk");
  if (closedChk){
    closedChk.onchange = (e) => {
      context.TRAJ_CLOSED[context.trajActiveLimb] = e.target.checked;
      updateTrajVisual(context.trajActiveLimb);
      context.scheduleAutoSave();
    };
  }

  const addBtn = document.getElementById("trajAddPointBtn");
  if (addBtn) addBtn.onclick = () => addTrajPoint(context.trajActiveLimb);

  const clearBtn = document.getElementById("trajClearPointsBtn");
  if (clearBtn) clearBtn.onclick = () => clearTrajPoints(context.trajActiveLimb);

  const sampleSlider = document.getElementById("trajSampleSlider");
  const sampleVal = document.getElementById("trajSampleVal");
  if (sampleSlider){
    sampleSlider.value = String(context.trajSampleCount);
    sampleSlider.oninput = (e) => {
      context.trajSampleCount = parseInt(e.target.value, 10);
      if (sampleVal) sampleVal.textContent = String(context.trajSampleCount);
    };
  }
  if (sampleVal) sampleVal.textContent = String(context.trajSampleCount);

  const genBtn = document.getElementById("trajGenerateBtn");
  if (genBtn) genBtn.onclick = () => { generateKeyframesFromTrajectory(context.trajActiveLimb); context.pushHistory(); };

  bindTrajShapeGenUI();
  renderTrajPointList();
}

function bindTrajShapeGenUI(){
  const typeSel = document.getElementById("trajShapeTypeSelect");
  const sidesInput = document.getElementById("trajShapeSidesInput");
  const sidesLabel = document.getElementById("trajShapeSidesLabel");
  const radiusInput = document.getElementById("trajShapeRadiusInput");
  const radiusLabel = document.getElementById("trajShapeRadiusLabel");
  const radiusYInput = document.getElementById("trajShapeRadiusYInput");
  const radiusYLabel = document.getElementById("trajShapeRadiusYLabel");
  const innerRatioInput = document.getElementById("trajShapeInnerRatioInput");
  const innerRatioLabel = document.getElementById("trajShapeInnerRatioLabel");
  const planeSel = document.getElementById("trajShapePlaneSelect");
  const genShapeBtn = document.getElementById("trajGenShapeBtn");
  if (!typeSel || !sidesInput || !genShapeBtn) return;

  // 依形狀類型切換：點數/邊數欄位的標籤與合理範圍、半徑欄位的標籤、要顯示哪些額外欄位
  // （橢圓形要顯示短半徑；星形要顯示內凹比例；圓形/多邊形都不需要，維持隱藏）。
  function syncFieldsForType(){
    const type = typeSel.value;
    radiusYLabel.style.display = (type === "ellipse") ? "" : "none";
    radiusYInput.style.display = (type === "ellipse") ? "" : "none";
    innerRatioLabel.style.display = (type === "star") ? "" : "none";
    innerRatioInput.style.display = (type === "star") ? "" : "none";
    radiusLabel.textContent = (type === "ellipse") ? "長半徑(公尺)" : "半徑(公尺)";

    if (type === "circle" || type === "ellipse"){
      sidesLabel.textContent = "點數";
      sidesInput.min = "8"; sidesInput.max = "48";
      if (parseInt(sidesInput.value, 10) < 8) sidesInput.value = "20";
    } else if (type === "star"){
      sidesLabel.textContent = "角數";
      sidesInput.min = "3"; sidesInput.max = "12";
      if (parseInt(sidesInput.value, 10) > 12) sidesInput.value = "5";
    } else { // polygon
      sidesLabel.textContent = "邊數";
      sidesInput.min = "3"; sidesInput.max = "12";
      if (parseInt(sidesInput.value, 10) > 12) sidesInput.value = "5";
    }
  }
  typeSel.onchange = syncFieldsForType;
  syncFieldsForType();

  genShapeBtn.onclick = () => {
    const shapeType = typeSel.value;
    const n = parseInt(sidesInput.value, 10) || (shapeType === "star" ? 5 : (shapeType === "polygon" ? 5 : 20));
    const radius = parseFloat(radiusInput.value) || 0.15;
    const plane = planeSel.value;
    // 短半徑（radiusY）只有橢圓形才有意義；圓形/多邊形/星形一律不傳，讓 rX/rY 都等於 radius，
    // 避免隱藏欄位裡殘留的舊數值（例如上次用橢圓形留下的 0.08）污染到其他形狀，
    // 造成「明明選圓形/星形，卻被拉成橢圓、放大後越來越狹長」的問題。
    const opts = {
      radiusY: (shapeType === "ellipse") ? (parseFloat(radiusYInput.value) || radius) : radius,
      innerRatio: parseFloat(innerRatioInput.value) || 0.5,
    };
    generateShapeTrajPoints(context.trajActiveLimb, shapeType, n, radius, plane, opts);
  };
}

function collectTrajOverrideKeys(frameA, frameB){
  if (!frameA.traj || !frameB.traj) return { overrideLimbs: _EMPTY_OVERRIDE_LIMBS, overrideKeys: _EMPTY_OVERRIDE_KEYS };
  const overrideLimbs = [];
  const overrideKeys = new Set();
  for (const limb of IK_LIMB_KEYS){
    const a = frameA.traj[limb], b = frameB.traj[limb];
    if (a && b && a.id === b.id){
      overrideLimbs.push(limb);
      const chain = IK_CHAINS[limb];
      overrideKeys.add(chain.root);
      overrideKeys.add(chain.mid);
    }
  }
  return { overrideLimbs, overrideKeys };
}

function applyTrajOverridesDuringPlayback(limbs, frameA, frameB, et){
  const eClamped = clampNum(et, 0, 1); // 取樣進度用clamp過的et，避免overshoot easing把curT甩出[0,1]產生怪座標
  for (const limb of limbs){
    const chain = IK_CHAINS[limb];
    const rootBone = context.bones[chain.root], midBone = context.bones[chain.mid], endBone = context.bones[chain.end];
    if (!rootBone || !midBone || !endBone) continue;
    const trajA = frameA.traj[limb], trajB = frameB.traj[limb];
    const curT = trajA.t + (trajB.t - trajA.t) * eClamped;
    const mode = trajA.mode;

    // 關鍵：這裡讀到的必須是「本幀剛套用完軀幹FK/身體位置之後」的最新世界座標，
    // 呼叫端已在此之前手動跑過 model.updateMatrixWorld(true)，見 updateKeyframePlayback。
    const rootPos = _tpRootPos; rootBone.getWorldPosition(rootPos);
    const localOffset = sampleTrajectoryFromPoints(mode, trajA.points, curT, !!trajA.closed); // 內部自行配置，屬低頻呼叫（每肢體每幀一次）不特別處理；舊資料沒有closed欄位時預設false
    const targetPos = _tpTargetPos.copy(rootPos).add(localOffset);

    const poleA = _tpPoleA.set(trajA.pole.x, trajA.pole.y, trajA.pole.z);
    const poleB = _tpPoleB.set(trajB.pole.x, trajB.pole.y, trajB.pole.z);
    const poleLocal = poleA.lerp(poleB, eClamped);
    const polePos = _tpPolePos.copy(rootPos).add(poleLocal);

    solveTwoBoneIK(rootBone, midBone, endBone, targetPos, polePos);
  }
}
return { buildTrajMarkers, createTrajPointAt, addTrajPoint, generateShapeTrajPoints, removeTrajPoint, clearTrajPoints, updateTrajVisual, updateTrajActiveVisibility, setTrajActiveLimb, updateTrajClosedChkState, updateTrajLimbButtons, renderTrajPointList, sampleTrajectory, generateKeyframesFromTrajectory, bindTrajUI, bindTrajShapeGenUI, collectTrajOverrideKeys, applyTrajOverridesDuringPlayback };
}
