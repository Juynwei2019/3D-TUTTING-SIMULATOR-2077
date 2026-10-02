import * as THREE from "three";


// 形狀資料模型：每種形狀各自一份參數，切換形狀不會互相覆蓋，調過的尺寸換回來還在。
const GRAB_SHAPE_DEFAULTS = {
  box:      { w: 0.32, h: 0.32, d: 0.24 },
  sphere:   { r: 0.18 },
  cylinder: { r: 0.14, h: 0.34 },
};

// Geometry 直接用真實尺寸建構（不是 unit geometry + scale），
// 因為非等比例 scale 對球體這類形狀會讓外觀失真（球變橢球）。
function buildGrabShapeGeometry(shapeType, params){
  if (shapeType === "sphere")   return new THREE.SphereGeometry(params.r, 24, 16);
  if (shapeType === "cylinder") return new THREE.CylinderGeometry(params.r, params.r, params.h, 24);
  return new THREE.BoxGeometry(params.w, params.h, params.d);
}

// ---- 貼合演算法（GRAB_SHAPE_CLOSEST_POINT，依 grabShapeType 分派）----
// 輸入/輸出都是「箱子本地座標系」下的點，箱子中心＝原點，三種都是精確解。

// 長方體：AABB clamp；點在箱內時額外判斷「離哪一面最近」推出去
function grabClosestPointBox(p, params){
  const hw = params.w / 2, hh = params.h / 2, hd = params.d / 2;
  const inside = Math.abs(p.x) <= hw && Math.abs(p.y) <= hh && Math.abs(p.z) <= hd;
  if (!inside){
    return new THREE.Vector3(
      THREE.MathUtils.clamp(p.x, -hw, hw),
      THREE.MathUtils.clamp(p.y, -hh, hh),
      THREE.MathUtils.clamp(p.z, -hd, hd)
    );
  }
  const dx = hw - Math.abs(p.x), dy = hh - Math.abs(p.y), dz = hd - Math.abs(p.z);
  const out = p.clone();
  if (dx <= dy && dx <= dz) out.x = (p.x < 0 ? -1 : 1) * hw;
  else if (dy <= dx && dy <= dz) out.y = (p.y < 0 ? -1 : 1) * hh;
  else out.z = (p.z < 0 ? -1 : 1) * hd;
  return out;
}

// 球體：球心到點的方向乘半徑，每個方向都對稱不用判斷內外
function grabClosestPointSphere(p, params){
  const len = p.length();
  if (len < 1e-6) return new THREE.Vector3(params.r, 0, 0);
  return p.clone().multiplyScalar(params.r / len);
}

// 圓柱：對 Y 軸旋轉對稱。外部點「徑向 clamp 到 r、高度 clamp 到 ±halfH」剛好是精確解
// （含端蓋邊緣那圈轉角也對）；內部點才需要判斷推去側面還是端蓋。
function grabClosestPointCylinder(p, params){
  const r = params.r, hh = params.h / 2;
  const radial = Math.hypot(p.x, p.z);
  const insideRadial = radial <= r;
  const insideHeight = Math.abs(p.y) <= hh;
  if (insideRadial && insideHeight){
    const distToSide = r - radial;
    const distToCap = hh - Math.abs(p.y);
    if (distToSide <= distToCap){
      const scale = radial > 1e-6 ? r / radial : 1;
      return new THREE.Vector3(p.x * scale, p.y, p.z * scale);
    }
    return new THREE.Vector3(p.x, (p.y < 0 ? -1 : 1) * hh, p.z);
  }
  const safeRadial = radial > 1e-6 ? radial : 1e-6;
  const scale = radial > r ? r / safeRadial : 1;
  return new THREE.Vector3(p.x * scale, THREE.MathUtils.clamp(p.y, -hh, hh), p.z * scale);
}

const GRAB_SHAPE_CLOSEST_POINT = {
  box: grabClosestPointBox,
  sphere: grabClosestPointSphere,
  cylinder: grabClosestPointCylinder,
};

export { GRAB_SHAPE_DEFAULTS, GRAB_SHAPE_CLOSEST_POINT, buildGrabShapeGeometry };
