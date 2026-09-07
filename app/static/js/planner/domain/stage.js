/** Deterministic stage-panel packing and leg-count calculations. */

export function stagePanelParts(widthFt, lengthFt) {
  const width = Math.max(1, Math.round(Number(widthFt) || 1));
  const length = Math.max(1, Math.round(Number(lengthFt) || 1));
  const columns = Math.ceil(width / 2);
  const rows = Math.ceil(length / 2);
  const used = Array.from({ length: rows }, () => Array(columns).fill(false));
  const parts = { 'Stage 4×4 Panels': 0, 'Stage 2×4 Panels': 0, 'Stage 2×2 Panels': 0 };
  const placed = [];
  const tryPlace = (cellWidth, cellHeight, name) => {
    for (let y = 0; y <= rows - cellHeight; y += 1) {
      for (let x = 0; x <= columns - cellWidth; x += 1) {
        let clear = true;
        for (let yy = y; yy < y + cellHeight; yy += 1) {
          for (let xx = x; xx < x + cellWidth; xx += 1) if (used[yy][xx]) clear = false;
        }
        if (!clear) continue;
        for (let yy = y; yy < y + cellHeight; yy += 1) {
          for (let xx = x; xx < x + cellWidth; xx += 1) used[yy][xx] = true;
        }
        parts[name] += 1;
        placed.push({ x, y, w: cellWidth, h: cellHeight });
        return true;
      }
    }
    return false;
  };
  while (tryPlace(2, 2, 'Stage 4×4 Panels')) { /* pack largest panels first */ }
  while (tryPlace(1, 2, 'Stage 2×4 Panels') || tryPlace(2, 1, 'Stage 2×4 Panels')) { /* fill strips */ }
  while (tryPlace(1, 1, 'Stage 2×2 Panels')) { /* fill remaining cells */ }
  const corners = new Set();
  placed.forEach((part) => {
    [[part.x, part.y], [part.x + part.w, part.y], [part.x, part.y + part.h], [part.x + part.w, part.y + part.h]]
      .forEach(([x, y]) => corners.add(`${x}:${y}`));
  });
  return { parts, legs: corners.size, placed };
}
