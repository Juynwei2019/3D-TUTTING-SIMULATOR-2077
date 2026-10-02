import { MathUtils } from "three";

export const D = MathUtils.degToRad;
export const R = MathUtils.radToDeg;
export function clampNum(v, min, max) { return Math.max(min, Math.min(max, v)); }
