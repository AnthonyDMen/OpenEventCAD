/** Konva construction and drawing for connected fence runs. */

export function renderFenceGeometry(ctx, node) {
  const { Konva, pixelsPerFoot, cloneConfig, fenceBaseIsOwnedByNode, fenceBaseAngle } = ctx;
  const points = cloneConfig(node.getAttr('fencePoints')) || [];
  node.destroyChildren();
  points.forEach((point, index) => {
    if (!fenceBaseIsOwnedByNode(node, point)) return;
    const baseWidth = pixelsPerFoot * 0.65; const baseDepth = pixelsPerFoot * 1.1;
    node.add(new Konva.Rect({ x: point.x, y: point.y, width: baseWidth, height: baseDepth, offsetX: baseWidth / 2, offsetY: baseDepth / 2, rotation: fenceBaseAngle(points, index), fill: '#8c8c8c', stroke: '#495057', strokeWidth: 1, listening: false, name: 'fenceBase' }));
    node.add(new Konva.Circle({ x: point.x, y: point.y, radius: Math.max(2, pixelsPerFoot * 0.09), fill: '#59636b', stroke: '#343a40', strokeWidth: 1, listening: false, name: 'fencePole' }));
  });
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]; const b = points[index];
    node.add(new Konva.Line({ points: [a.x, a.y, b.x, b.y], stroke: '#f4f4f4', strokeWidth: Math.max(4, pixelsPerFoot * .25), lineCap: 'butt', listening: false, name: 'fencePanel' }));
    node.add(new Konva.Line({ points: [a.x, a.y, b.x, b.y], stroke: '#495057', strokeWidth: 1, lineCap: 'butt', listening: false, name: 'fenceEdge' }));
    node.add(new Konva.Line({ points: [a.x, a.y, b.x, b.y], stroke: 'rgba(0,0,0,.01)', strokeWidth: 20, lineCap: 'round', name: 'fenceHit' }));
  }
}

export function createFenceChain(ctx, data, points) {
  const { Konva, cloneConfig, nextSetupOrder, ensureNodeId, renderFenceGeometry: render, attachShapeEvents } = ctx;
  const node = new Konva.Group({ draggable: true, name: 'fenceChain' }); const order = nextSetupOrder();
  node.setAttrs({ customType: 'fenceChain', selectable: true, lockScaling: true, fencePoints: cloneConfig(points), fencePanelLengthFt: Number(data.panelLengthFt) || 8, fenceSetupId: `fence-setup-${order}`, fenceSetupOrder: order, fenceRunOrder: order });
  ensureNodeId(node, 'fence'); render(node); attachShapeEvents(node);
  return node;
}
