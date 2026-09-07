/**
 * Stateless polygon and rectangle helpers for planner geometry.
 *
 * Coordinates use the planner's current coordinate system (feet or pixels).
 * No function here depends on the DOM, Konva, or planner state.
 */

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, prior = polygon.length - 1; index < polygon.length; prior = index, index += 1) {
    const a = polygon[index];
    const b = polygon[prior];
    if (((a.y > point.y) !== (b.y > point.y))
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y || .000001) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return ((abC >= 0 && abD <= 0) || (abC <= 0 && abD >= 0))
    && ((cdA >= 0 && cdB <= 0) || (cdA <= 0 && cdB >= 0));
}

export function rectanglePoints(rect) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

export function rectangleTouchesPolygon(rect, polygon) {
  if (!rect || !polygon.length) return false;
  const corners = rectanglePoints(rect);
  if (corners.some((point) => pointInPolygon(point, polygon))
    || polygon.some((point) => point.x >= rect.x && point.x <= rect.x + rect.width
      && point.y >= rect.y && point.y <= rect.y + rect.height)) {
    return true;
  }
  for (let index = 0; index < corners.length; index += 1) {
    const a = corners[index];
    const b = corners[(index + 1) % corners.length];
    for (let edge = 0; edge < polygon.length; edge += 1) {
      if (segmentsIntersect(a, b, polygon[edge], polygon[(edge + 1) % polygon.length])) return true;
    }
  }
  return false;
}

export function polygonSelfIntersects(points) {
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const crosses = (a, b, c, d) => {
    const a1 = cross(a, b, c);
    const a2 = cross(a, b, d);
    const a3 = cross(c, d, a);
    const a4 = cross(c, d, b);
    return ((a1 > 0 && a2 < 0) || (a1 < 0 && a2 > 0))
      && ((a3 > 0 && a4 < 0) || (a3 < 0 && a4 > 0));
  };
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    for (let candidate = index + 1; candidate < points.length; candidate += 1) {
      if (Math.abs(index - candidate) <= 1 || (index === 0 && candidate === points.length - 1)) continue;
      if (crosses(a, b, points[candidate], points[(candidate + 1) % points.length])) return true;
    }
  }
  return false;
}

export function pointsBounds(points) {
  if (!points || !points.length) return null;
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}
