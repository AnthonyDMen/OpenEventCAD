/** Pure measurements for connected planner runs. */

export function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pointDistanceInFeet(a, b, pixelsPerFoot) {
  return pointDistance(a, b) / pixelsPerFoot;
}

export function polylineLength(points, pixelsPerFoot) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  return points.slice(1).reduce((total, point, index) => (
    total + pointDistance(point, points[index])
  ), 0) / pixelsPerFoot;
}

export function clampEndpointToSpan(start, end, maximumFeet, pixelsPerFoot) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = pointDistance(start, end);
  const maximumPixels = maximumFeet * pixelsPerFoot;
  if (distance <= maximumPixels || distance < .01) return { x: end.x, y: end.y };
  return {
    x: start.x + dx / distance * maximumPixels,
    y: start.y + dy / distance * maximumPixels,
  };
}
