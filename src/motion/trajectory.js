import * as THREE from "three";
import { clampNum } from "../math/angles.js";

function sampleTrajectoryFromPoints(mode, points, t, closed){
  const pts = points.map(p => (p instanceof THREE.Vector3) ? p : new THREE.Vector3(p.x, p.y, p.z));
  if (pts.length === 0) return new THREE.Vector3();
  if (pts.length === 1) return pts[0].clone();
  t = clampNum(t, 0, 1);
  const canClose = !!closed && pts.length >= 3;
  if (mode === "curve" && pts.length >= 3){
    // CatmullRomCurve3 原生支援 closed 參數：t=1 會剛好繞回 t=0，不用額外處理收尾段
    const curve = new THREE.CatmullRomCurve3(pts, canClose);
    return curve.getPoint(t);
  }
  // 折線模式（或曲線但點數<3時退回折線）：依各段弦長比例決定 t 落在哪一段。
  // 封閉時段數多算一段「最後一點→第一點」，用 (i+1)%pts.length 取下一點即可自然接回起點。
  const segCount = canClose ? pts.length : pts.length - 1;
  const segLens = [];
  let total = 0;
  for (let i = 0; i < segCount; i++){
    const d = pts[i].distanceTo(pts[(i + 1) % pts.length]);
    segLens.push(d);
    total += d;
  }
  if (total < 1e-8) return pts[0].clone();
  let remain = t * total;
  for (let i = 0; i < segLens.length; i++){
    if (remain <= segLens[i] || i === segLens.length - 1){
      const segT = segLens[i] < 1e-8 ? 0 : clampNum(remain / segLens[i], 0, 1);
      return pts[i].clone().lerp(pts[(i + 1) % pts.length], segT);
    }
    remain -= segLens[i];
  }
  return pts[pts.length - 1].clone();
}

export { sampleTrajectoryFromPoints };
