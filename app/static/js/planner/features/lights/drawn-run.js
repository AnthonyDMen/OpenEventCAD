/** Konva rendering for standalone drawn runs, including bistro bulbs. */

export function createDrawnRunNode(ctx, data, start, end) {
  const { Konva, pixelsPerFoot, runLengthFt, cloneConfig, attachShapeEvents, ensureNodeId } = ctx;
  const points = Array.isArray(start) ? start : [start, end]; const isLight = data.drawMode === 'bistro'; const color = data.color || (isLight ? '#f1c75b' : '#b98fc1');
  const node = new Konva.Group({ draggable: true, name: 'drawnRun' });
  node.setAttrs({ customType: 'drawnRun', selectable: true, lockScaling: true, drawMode: data.drawMode || 'pipeDrape', inventoryName: data.inventoryName || 'Pipe & Drape Run', inventoryCategory: data.category || '', addonColor: color, runPoints: points, runLengthFt: runLengthFt(points), lightPostAnchors: isLight ? (cloneConfig(data.lightPostAnchors) || []) : [] });
  node.add(new Konva.Line({ points: points.flatMap((point) => [point.x, point.y]), stroke: color, strokeWidth: isLight ? 2 : Math.max(4, Number(data.width || .5) * pixelsPerFoot), lineCap: 'round', lineJoin: 'round', name: 'drawnRunLine' }));
  if (isLight) node.add(new Konva.Line({ points: points.flatMap((point) => [point.x, point.y]), stroke: 'rgba(0,0,0,.01)', strokeWidth: 22, lineCap: 'round', name: 'drawnRunHit' }));
  if (isLight) {
    const length = runLengthFt(points); const bulbs = Math.max(2, Math.floor(length / 2.5) + 1);
    for (let index = 0; index < bulbs; index += 1) { const ratio = index / (bulbs - 1); const distance = length * ratio; let passed = 0; let bulb = points[0]; for (let segment = 1; segment < points.length; segment += 1) { const a = points[segment - 1]; const b = points[segment]; const span = Math.hypot(b.x - a.x, b.y - a.y) / pixelsPerFoot; if (passed + span >= distance || segment === points.length - 1) { const local = span ? (distance - passed) / span : 0; bulb = { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local }; break; } passed += span; } node.add(new Konva.Circle({ x: bulb.x, y: bulb.y, radius: 2.5, fill: '#fff1b8', stroke: color, strokeWidth: 1, listening: false })); }
  }
  attachShapeEvents(node); ensureNodeId(node, 'drawn-run'); return node;
}

export function renderDrawnRunGeometry(ctx, node) {
  if (!node || !node.getAttr) return;
  const rebuilt = createDrawnRunNode(ctx, { drawMode: node.getAttr('drawMode'), inventoryName: node.getAttr('inventoryName'), category: node.getAttr('inventoryCategory'), color: node.getAttr('addonColor') }, ctx.cloneConfig(node.getAttr('runPoints')) || []);
  node.destroyChildren(); node.add(...Array.from(rebuilt.getChildren())); rebuilt.destroy();
}
