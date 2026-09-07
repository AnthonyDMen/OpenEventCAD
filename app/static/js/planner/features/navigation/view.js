/** Canvas navigation actions that preserve the viewport centre. */

export function zoomView({ worldGroup, worldLayer, stage, minScale, maxScale }, factor) {
  const old = worldGroup.scaleX(); const scale = Math.max(minScale, Math.min(old * factor, maxScale)); const centre = { x: stage.width() / 2, y: stage.height() / 2 }; const worldPos = { x: (centre.x - worldGroup.x()) / old, y: (centre.y - worldGroup.y()) / old };
  worldGroup.scale({ x: scale, y: scale }); worldGroup.position({ x: centre.x - worldPos.x * scale, y: centre.y - worldPos.y * scale }); worldLayer.batchDraw();
}
export function panView({ worldGroup, worldLayer }, dx, dy) { worldGroup.x(worldGroup.x() + dx); worldGroup.y(worldGroup.y() + dy); worldLayer.batchDraw(); }
export function rotateView({ worldGroup, worldLayer, stage }, degrees) { const centre = { x: stage.width() / 2, y: stage.height() / 2 }; const old = worldGroup.position(); const x = old.x - centre.x; const y = old.y - centre.y; worldGroup.rotation(worldGroup.rotation() + degrees); const radians = degrees * Math.PI / 180; worldGroup.position({ x: centre.x + x * Math.cos(radians) - y * Math.sin(radians), y: centre.y + x * Math.sin(radians) + y * Math.cos(radians) }); worldLayer.batchDraw(); }
export function resetView({ worldGroup, worldLayer }) { worldGroup.scale({ x: 1, y: 1 }); worldGroup.rotation(0); worldGroup.position({ x: 0, y: 0 }); worldLayer.batchDraw(); }
