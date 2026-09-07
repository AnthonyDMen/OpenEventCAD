/** Stateless geometry for custom venue and inventory shapes. */

export function normaliseDegrees(value) {
  return ((value % 360) + 360) % 360;
}

export function arcPoints(center, radius, midAngle = Math.PI) {
  const start = midAngle - Math.PI * .75;
  const end = midAngle + Math.PI * .75;
  return Array.from({ length: 20 }, (_, index) => {
    const angle = start + (end - start) * index / 19;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

export function buildVectorShape(kind, a, b) {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x, b.x);
  const maxY = Math.max(a.y, b.y);
  if (kind === 'rectangle') return [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
  if (kind === 'circle') {
    const radius = Math.max(.25, Math.hypot(b.x - a.x, b.y - a.y));
    return Array.from({ length: 24 }, (_, index) => {
      const angle = index / 24 * Math.PI * 2;
      return { x: a.x + Math.cos(angle) * radius, y: a.y + Math.sin(angle) * radius };
    });
  }
  if (kind === 'arc') return arcPoints(a, Math.max(.25, Math.hypot(b.x - a.x, b.y - a.y)));
  if (kind === 'line') return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const half = .15;
  const ox = -dy / length * half;
  const oy = dx / length * half;
  return [{ x: a.x + ox, y: a.y + oy }, { x: b.x + ox, y: b.y + oy }, { x: b.x - ox, y: b.y - oy }, { x: a.x - ox, y: a.y - oy }];
}

export function circleFromArcPoints(points) {
  if (!points || points.length < 3) return null;
  const a = points[0];
  const b = points[Math.floor(points.length / 2)];
  const c = points[points.length - 1];
  const determinant = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(determinant) < .0001) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / determinant;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / determinant;
  return { x, y, radius: Math.hypot(a.x - x, a.y - y) };
}

export function rotatePoints(points, center, deltaRadians) {
  return points.map((point) => {
    const x = point.x - center.x;
    const y = point.y - center.y;
    return {
      x: center.x + x * Math.cos(deltaRadians) - y * Math.sin(deltaRadians),
      y: center.y + x * Math.sin(deltaRadians) + y * Math.cos(deltaRadians),
    };
  });
}
