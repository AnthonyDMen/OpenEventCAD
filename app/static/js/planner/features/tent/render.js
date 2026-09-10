import { tentLegPositionsFt } from '../../domain/tent.js';

/** Konva drawing primitives for tent add-ons. */

export function drawTentSidewallSegment(Konva, parent, segment, widthFt, heightFt, color, pixelsPerFoot, opacity = 1) {
  const depthPx = (opacity < 1 ? 0.45 : 0.25) * pixelsPerFoot;
  const edge = Number(segment.edge) || 0;
  const start = Number(segment.start) || 0;
  const length = Number(segment.length) || 0;
  const attrs = { fill: color, opacity, stroke: '#495057', strokeWidth: 1, hitStrokeWidth: 18, name: 'tentSidewallSegment', listening: opacity >= 1 };
  if (edge === 0) parent.add(new Konva.Rect({ ...attrs, x: start * pixelsPerFoot, y: -depthPx / 2, width: length * pixelsPerFoot, height: depthPx }));
  else if (edge === 1) parent.add(new Konva.Rect({ ...attrs, x: widthFt * pixelsPerFoot - depthPx / 2, y: start * pixelsPerFoot, width: depthPx, height: length * pixelsPerFoot }));
  else if (edge === 2) parent.add(new Konva.Rect({ ...attrs, x: start * pixelsPerFoot, y: heightFt * pixelsPerFoot - depthPx / 2, width: length * pixelsPerFoot, height: depthPx }));
  else parent.add(new Konva.Rect({ ...attrs, x: -depthPx / 2, y: start * pixelsPerFoot, width: depthPx, height: length * pixelsPerFoot }));
}

export function drawTentLegDrape(Konva, parent, widthFt, heightFt, legIndex, pixelsPerFoot, opacity = 1) {
  const legs = tentLegPositionsFt(widthFt, heightFt);
  const [x, y] = legs[legIndex] || legs[0] || [0, 0];
  const wingFt = 1.5;
  const depthPx = .35 * pixelsPerFoot;
  const attrs = { fill: '#f8f9fa', opacity, stroke: '#adb5bd', strokeWidth: 1, hitStrokeWidth: 18, name: 'tentLegDrape', listening: opacity >= 1 };
  const addHorizontal = (start, length, atBottom) => { if (length > .01) parent.add(new Konva.Rect({ ...attrs, x: start * pixelsPerFoot, y: atBottom ? heightFt * pixelsPerFoot - depthPx : 0, width: length * pixelsPerFoot, height: depthPx })); };
  const addVertical = (start, length, atRight) => { if (length > .01) parent.add(new Konva.Rect({ ...attrs, x: atRight ? widthFt * pixelsPerFoot - depthPx : 0, y: start * pixelsPerFoot, width: depthPx, height: length * pixelsPerFoot })); };
  if (y === 0 || y === heightFt) { addHorizontal(x - Math.min(wingFt, x), Math.min(wingFt, x), y === heightFt); addHorizontal(x, Math.min(wingFt, widthFt - x), y === heightFt); }
  if (x === 0 || x === widthFt) { addVertical(y - Math.min(wingFt, y), Math.min(wingFt, y), x === widthFt); addVertical(y, Math.min(wingFt, heightFt - y), x === widthFt); }
}

export function drawTentLightRun(Konva, parent, from, to, color, pixelsPerFoot, dashed = false) {
  const start = { x: from.x * pixelsPerFoot, y: from.y * pixelsPerFoot };
  const end = { x: to.x * pixelsPerFoot, y: to.y * pixelsPerFoot };
  const distanceFt = Math.hypot(to.x - from.x, to.y - from.y);
  parent.add(new Konva.Line({ points: [start.x, start.y, end.x, end.y], stroke: color, strokeWidth: 1.25, hitStrokeWidth: 18, opacity: dashed ? .5 : .72, dash: dashed ? [7, 6] : [], name: 'tentLightString' }));
  const bulbCount = Math.max(1, Math.floor(distanceFt / 2));
  for (let index = 1; index <= bulbCount; index += 1) {
    const progress = index / (bulbCount + 1);
    parent.add(new Konva.Circle({ x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress, radius: Math.max(2, pixelsPerFoot * .09), fill: color, opacity: .9, listening: false, name: 'tentLightBulb' }));
  }
}
