/** Geometry and inventory calculations for fixed-length connected fence runs. */

export function fencePointKey(point) { return `${Math.round(point.x * 100) / 100}:${Math.round(point.y * 100) / 100}`; }

export function fenceInventoryRows(chains) {
  const rows = new Map(); const bases = new Set();
  const add = (name, amount) => { const row = rows.get(name) || { name, amount: 0, unit: 'count' }; row.amount += amount; rows.set(name, row); };
  (chains || []).forEach((chain) => { const name = `Fence Panel ${chain.panelLengthFt}' x 3'`; add(name, chain.points.length - 1); chain.points.forEach((point) => bases.add(fencePointKey(point))); });
  if (bases.size) { add('Fence Bases', bases.size); add('Fence Poles', bases.size); }
  return { rows: Array.from(rows.values()), bases };
}

export function fenceConstrainEndpoint(start, rawEnd, panelLengthFt, pixelsPerFoot) {
  const dx = rawEnd.x - start.x; const dy = rawEnd.y - start.y; const length = Math.hypot(dx, dy); const direction = length > 0.01 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 }; const panelPx = panelLengthFt * pixelsPerFoot;
  return { x: start.x + direction.x * panelPx, y: start.y + direction.y * panelPx };
}
