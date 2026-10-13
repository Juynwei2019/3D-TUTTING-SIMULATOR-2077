import { TG_SEGMENTS } from './tutting-geometry.js';

export const TG_RULE_VERSION = 1;
const ids = Object.keys(TG_SEGMENTS);
export function cleanGeometryRules(raw = {}) {
  const number = (v, d, max) => Number.isFinite(v) && v > 0 && v <= max ? v : d;
  const pair = (v) => {v=v&&typeof v==='object'?v:{};return { enabled: v.enabled === true,
    a: ids.includes(v.a) ? v.a : 'lForeArm', b: ids.includes(v.b) ? v.b : 'rForeArm',
    tolerance: number(v.tolerance, 5, 90) };};
  const p = raw?.plane || {};
  return { version: TG_RULE_VERSION,
    plane: { enabled: p.enabled === true, segments: Array.isArray(p.segments) ? ids.filter(id => p.segments.includes(id)) : ['lForeArm', 'rForeArm'],
      mode: p.mode === 'position' ? 'position' : 'direction',
      angleTolerance: number(p.angleTolerance, 5, 90), positionTolerance: number(p.positionTolerance, 3, 100) },
    parallel: { ...pair(raw?.parallel), allowOpposite: raw?.parallel?.allowOpposite !== false },
    perpendicular: pair(raw?.perpendicular) };
}
export function hasGeometryRules(config) {
  return config.plane.enabled || config.parallel.enabled || config.perpendicular.enabled;
}
export function evaluateGeometryRules(geometry, base, config) {
  if (!geometry?.ok || !base?.ok) return { ok: false, reason: 'invalid-geometry', checks: [], maxNormalizedError: Infinity };
  const checks = [];
  const add = (type, segments, error, tolerance, unit) => checks.push({ type, segments, error, tolerance, unit,
    pass: Number.isFinite(error) && error <= tolerance + 1e-9 });
  const p = config.plane;
  if (p.enabled) {
    if (!p.segments.length || p.segments.some(id => !geometry.segments[id] || !base.segments[id]))
      return { ok: false, reason: 'invalid-plane-segments', checks, maxNormalizedError: Infinity };
    // Fixed front normal +Z; reference depth comes from selected base endpoints.
    const depth = p.segments.reduce((sum, id) => sum + base.segments[id].start[2] + base.segments[id].end[2], 0) / (p.segments.length * 2);
    for (const id of p.segments) {
      const s = geometry.segments[id];
      if (p.mode === 'position') add('plane-position', [id], Math.max(Math.abs(s.start[2] - depth), Math.abs(s.end[2] - depth)) / s.length * 100, p.positionTolerance, '%');
      else add('plane-direction', [id], Math.asin(Math.min(1, Math.abs(s.direction[2]))) * 180 / Math.PI, p.angleTolerance, '°');
    }
  }
  for (const type of ['parallel', 'perpendicular']) {
    const r = config[type]; if (!r.enabled) continue;
    const a = geometry.segments[r.a], b = geometry.segments[r.b];
    if (!a || !b || r.a === r.b) return { ok: false, reason: 'invalid-pair', checks, maxNormalizedError: Infinity };
    const dot = a.direction.reduce((sum, v, i) => sum + v * b.direction[i], 0);
    const angle = Math.acos(Math.max(-1, Math.min(1, type === 'parallel' && r.allowOpposite ? Math.abs(dot) : dot))) * 180 / Math.PI;
    add(type, [r.a, r.b], type === 'parallel' ? angle : Math.abs(angle - 90), r.tolerance, '°');
  }
  return { ok: checks.every(c => c.pass), checks,
    maxNormalizedError: Math.max(0, ...checks.map(c => c.error / c.tolerance)) };
}
