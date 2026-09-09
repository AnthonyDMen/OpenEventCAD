import { stagePanelParts } from '../../domain/stage.js';

/** Stage add-on placement, synchronization, and Konva node construction. */

export function stageAddonEdge(stage, localPoint, widthFt, pixelsPerFoot) {
  const stageWidth = Number(stage.getAttr('widthFt')) || 0;
  const stageLength = Number(stage.getAttr('lengthFt')) || 0;
  const xFt = localPoint.x / pixelsPerFoot;
  const yFt = localPoint.y / pixelsPerFoot;
  const distances = [
    { side: 'top', value: Math.abs(yFt) },
    { side: 'bottom', value: Math.abs(yFt - stageLength) },
    { side: 'left', value: Math.abs(xFt) },
    { side: 'right', value: Math.abs(xFt - stageWidth) },
  ].sort((a, b) => a.value - b.value);
  const nearest = distances[0];
  if (!nearest || nearest.value > 0.75) return null;
  const packed = stagePanelParts(stageWidth, stageLength);
  const cols = Math.ceil(stageWidth / 2);
  const rows = Math.ceil(stageLength / 2);
  const horizontal = nearest.side === 'top' || nearest.side === 'bottom';
  const along = horizontal ? xFt : yFt;
  const candidates = packed.placed.filter((part) => (
    horizontal
      ? (nearest.side === 'top' ? part.y === 0 : part.y + part.h === rows)
      : (nearest.side === 'left' ? part.x === 0 : part.x + part.w === cols)
  ));
  const segment = candidates
    .map((part) => ({ start: (horizontal ? part.x : part.y) * 2, length: (horizontal ? part.w : part.h) * 2 }))
    .find((entry) => along >= entry.start - 0.05 && along <= entry.start + entry.length + 0.05);
  if (!segment || segment.length + 0.05 < widthFt) return null;
  return {
    side: nearest.side,
    start: segment.start,
    length: segment.length,
    along: Math.max(segment.start + widthFt / 2, Math.min(segment.start + segment.length - widthFt / 2, along)),
  };
}

export function closestStageForAddonPlacement(ctx, worldPoint, widthFt) {
  const { forEachNode, pixelsPerFoot } = ctx;
  if (!worldPoint) return null;
  let best = null;
  forEachNode((node) => {
    if (!(node && node.getAttr && node.getAttr('isFlooring') && node.getAttr('floorCategory') === 'stage')) return;
    if (ctx.isSelectableNode && !ctx.isSelectableNode(node)) return;
    const angle = -(Number(node.rotation && node.rotation()) || 0) * Math.PI / 180;
    const dx = worldPoint.x - node.x();
    const dy = worldPoint.y - node.y();
    const local = { x: dx * Math.cos(angle) - dy * Math.sin(angle), y: dx * Math.sin(angle) + dy * Math.cos(angle) };
    const edge = stageAddonEdge(node, local, widthFt, pixelsPerFoot);
    if (edge) best = { node, edge };
  });
  return best;
}

function restoredEdge(stage, edge, width, pixelsPerFoot) {
  const w = Number(stage.getAttr('widthFt')) || 0;
  const h = Number(stage.getAttr('lengthFt')) || 0;
  const horizontal = edge.side === 'top' || edge.side === 'bottom';
  const span = horizontal ? w : h;
  if (span < width) return null;
  const along = Math.max(width / 2, Math.min(span - width / 2, Number(edge.along) || width / 2));
  const point = { x: (horizontal ? along : edge.side === 'left' ? 0 : w) * pixelsPerFoot, y: (horizontal ? edge.side === 'top' ? 0 : h : along) * pixelsPerFoot };
  return stageAddonEdge(stage, point, width, pixelsPerFoot);
}

export function syncStageAddonsForStage(ctx, stage) {
  const { ensureNodeId, forEachNode, pixelsPerFoot } = ctx;
  if (!(stage && stage.getAttr)) return;
  const stageId = ensureNodeId(stage, 'floor');
  const angle = (Number(stage.rotation && stage.rotation()) || 0) * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  forEachNode((node) => {
    if (!(node && node.getAttr && node.getAttr('customType') === 'stageAddon' && node.getAttr('parentStageNodeId') === stageId)) return;
    const edge = restoredEdge(stage, node.getAttr('stageEdge') || {}, Number(node.getAttr('widthFt')) || 2, pixelsPerFoot);
    if (!edge) return;
    node.setAttrs({ stageEdge: edge, side: edge.side });
    const depth = Number(node.getAttr('lengthFt')) || 1;
    const horizontal = edge.side === 'top' || edge.side === 'bottom';
    const stageWidth = Number(stage.getAttr('widthFt')) || 0;
    const stageLength = Number(stage.getAttr('lengthFt')) || 0;
    const localX = horizontal ? edge.along * pixelsPerFoot : (edge.side === 'left' ? -depth / 2 : stageWidth + depth / 2) * pixelsPerFoot;
    const localY = horizontal ? (edge.side === 'top' ? -depth / 2 : stageLength + depth / 2) * pixelsPerFoot : edge.along * pixelsPerFoot;
    node.position({ x: stage.x() + localX * cos - localY * sin, y: stage.y() + localX * sin + localY * cos });
    node.rotation((Number(stage.rotation && stage.rotation()) || 0) + (horizontal ? 0 : 90));
  });
}

export function clampStageAddonNode(ctx, node, stage) {
  const { pixelsPerFoot } = ctx;
  if (!(node && stage)) return;
  const width = Number(node.getAttr('widthFt')) || 2;
  const edge = restoredEdge(stage, node.getAttr('stageEdge') || {}, width, pixelsPerFoot);
  if (!edge) return;
  const side = edge.side;
  const stageWidth = Number(stage.getAttr('widthFt')) || 0;
  const stageLength = Number(stage.getAttr('lengthFt')) || 0;
  const depth = Number(node.getAttr('lengthFt')) || 1;
  const horizontal = side === 'top' || side === 'bottom';
  const angle = -(Number(stage.rotation && stage.rotation()) || 0) * Math.PI / 180;
  const dx = node.x() - stage.x();
  const dy = node.y() - stage.y();
  const local = { x: dx * Math.cos(angle) - dy * Math.sin(angle), y: dx * Math.sin(angle) + dy * Math.cos(angle) };
  if (horizontal) local.x = Math.max(edge.start + width / 2, Math.min(edge.start + edge.length - width / 2, local.x / pixelsPerFoot)) * pixelsPerFoot;
  else local.y = Math.max(edge.start + width / 2, Math.min(edge.start + edge.length - width / 2, local.y / pixelsPerFoot)) * pixelsPerFoot;
  if (horizontal) local.y = (side === 'top' ? -depth / 2 : stageLength + depth / 2) * pixelsPerFoot;
  else local.x = (side === 'left' ? -depth / 2 : stageWidth + depth / 2) * pixelsPerFoot;
  node.setAttrs({ stageEdge: { ...edge, along: (horizontal ? local.x : local.y) / pixelsPerFoot }, side });
  node.position({ x: stage.x() + local.x * Math.cos(-angle) - local.y * Math.sin(-angle), y: stage.y() + local.x * Math.sin(-angle) + local.y * Math.cos(-angle) });
  node.rotation((Number(stage.rotation && stage.rotation()) || 0) + (horizontal ? 0 : 90));
}

function stageAddonDimensions(type) {
  return {
    width: type === 'Adjustable Stairs' ? 4 : type === 'Stage Railing 4ft' ? 4 : 2,
    depth: type === 'Adjustable Stairs' ? 5 : type === 'Basic Step' ? 2 : 0.35,
  };
}

export function createStageAddonNode(ctx, data, stage, worldPoint) {
  const { Konva, attachShapeEvents, ensureNodeId, getNodeById, pixelsPerFoot } = ctx;
  if (!(stage && stage.getAttr && stage.getAttr('floorCategory') === 'stage')) return null;
  const type = data.addonType || 'Basic Step';
  const { width, depth } = stageAddonDimensions(type);
  const stageWidth = Number(stage.getAttr('widthFt')) || 0;
  const stageLength = Number(stage.getAttr('lengthFt')) || 0;
  const stageAngle = -(Number(stage.rotation && stage.rotation()) || 0) * Math.PI / 180;
  const dx = worldPoint.x - stage.x();
  const dy = worldPoint.y - stage.y();
  const localPoint = {
    x: dx * Math.cos(stageAngle) - dy * Math.sin(stageAngle),
    y: dx * Math.sin(stageAngle) + dy * Math.cos(stageAngle),
  };
  const savedEdge = data && data.stageEdge;
  const edge = savedEdge && ['top', 'right', 'bottom', 'left'].includes(savedEdge.side)
    ? restoredEdge(stage, savedEdge, width, pixelsPerFoot)
    : stageAddonEdge(stage, localPoint, width, pixelsPerFoot);
  if (!edge) return null;
  const horizontal = edge.side === 'top' || edge.side === 'bottom';
  const x = horizontal ? edge.along * pixelsPerFoot : (edge.side === 'left' ? -depth / 2 : stageWidth + depth / 2) * pixelsPerFoot;
  const y = horizontal ? (edge.side === 'top' ? -depth / 2 : stageLength + depth / 2) * pixelsPerFoot : edge.along * pixelsPerFoot;
  const edgeRotation = horizontal ? 0 : 90;
  const angle = (Number(stage.rotation && stage.rotation()) || 0) * Math.PI / 180;
  const node = new Konva.Group({ x: stage.x() + x * Math.cos(angle) - y * Math.sin(angle), y: stage.y() + x * Math.sin(angle) + y * Math.cos(angle), rotation: (Number(stage.rotation && stage.rotation()) || 0) + edgeRotation, draggable: true, name: 'stageAddon' });
  node.setAttrs({ customType: 'stageAddon', addonType: type, inventoryName: type, parentStageNodeId: ensureNodeId(stage, 'floor'), selectable: true, widthFt: width, lengthFt: depth, side: edge.side, stageEdge: edge });
  node.add(new Konva.Rect({ x: -width * pixelsPerFoot / 2, y: -depth * pixelsPerFoot / 2, width: width * pixelsPerFoot, height: depth * pixelsPerFoot, fill: '#c98b3c', stroke: '#1b1f23', strokeWidth: 1, listening: false }));
  const stepCount = type === 'Adjustable Stairs' ? 4 : type === 'Basic Step' ? 2 : 0;
  for (let step = 1; step < stepCount; step += 1) {
    const y = (-depth / 2 + depth * step / stepCount) * pixelsPerFoot;
    node.add(new Konva.Line({ points: [-width * pixelsPerFoot / 2, y, width * pixelsPerFoot / 2, y], stroke: '#1b1f23', strokeWidth: 1, listening: false, name: 'stageStairTread' }));
  }
  attachShapeEvents(node);
  // The coordinator constrains before updating labels and recording history.
  return node;
}
