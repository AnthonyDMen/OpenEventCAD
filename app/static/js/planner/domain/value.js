/**
 * Stateless value helpers shared by planner features.
 *
 * Keep this module free of DOM, Konva, and planner state so it can be tested
 * directly with Node and safely reused by future feature modules.
 */

export function cloneConfig(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : undefined;
}

export function normaliseFeet(value, unitHint) {
  const numeric = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(numeric)) return undefined;
  const unit = String(unitHint || '').trim().toLowerCase();
  if (unit === 'px' || unit === 'pixel' || unit === 'pixels') return numeric / 12;
  return numeric;
}

export function normaliseNonNegativeInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function valuesRoughlyMatch(a, b, tolerance = 0.01) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
}
