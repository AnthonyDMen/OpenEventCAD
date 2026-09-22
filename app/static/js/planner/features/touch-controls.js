// Touch navigation is intercepted before Konva. Mouse/keyboard events are untouched.
export function installTouchControls({ stage, world, layer, minScale, maxScale, cancelDrag, placementActive, preview, place, actions }) {
  const content = stage.content;
  let navigating = false;
  let gesture = null;
  let placement = false;
  let lastTouch = 0;
  const bar = document.createElement('div');
  bar.id = 'plannerTouchControls';
  bar.className = 'btn-group d-print-none';
  bar.setAttribute('aria-label', 'Touch canvas controls');
  Object.assign(bar.style, { position: 'fixed', bottom: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: '1040', maxWidth: '95vw', flexWrap: 'wrap' });
  document.body.appendChild(bar);
  let touchUsed = navigator.maxTouchPoints > 0;
  function refresh() {
    bar.replaceChildren();
    bar.style.display = touchUsed ? 'flex' : 'none';
    if (!touchUsed) return;
    for (const action of actions()) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn btn-secondary';
      button.textContent = action.label; button.dataset.touchAction = action.id;
      button.style.minHeight = '44px';
      button.addEventListener('click', async () => { await action.run(); refresh(); });
      bar.appendChild(button);
    }
  }
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const sample = touches => {
    const rect = content.getBoundingClientRect();
    const [a, b] = touches;
    return { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top, distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)) };
  };
  content.addEventListener('touchstart', event => {
    touchUsed = true; lastTouch = Date.now(); refresh();
    if (event.touches.length >= 2) {
      if (!navigating) { cancelDrag(); navigating = true; placement = false; }
      gesture = sample(event.touches); stop(event); return;
    }
    if (navigating) { stop(event); return; }
    if (placementActive()) { placement = true; stop(event); }
  }, { capture: true, passive: false });
  content.addEventListener('touchmove', event => {
    if (navigating) {
      stop(event);
      if (event.touches.length < 2) { gesture = null; return; }
      const next = sample(event.touches);
      if (gesture) {
        const oldScale = world.scaleX();
        const scale = Math.max(minScale, Math.min(maxScale, oldScale * next.distance / gesture.distance));
        const anchor = { x: (gesture.x - world.x()) / oldScale, y: (gesture.y - world.y()) / oldScale };
        world.scale({ x: scale, y: scale });
        world.position({ x: next.x - anchor.x * scale, y: next.y - anchor.y * scale });
        layer.batchDraw();
      }
      gesture = next; return;
    }
    if (placement) { stop(event); stage.setPointersPositions(event); preview(event); }
  }, { capture: true, passive: false });
  const end = event => {
    lastTouch = Date.now();
    if (navigating) {
      stop(event); gesture = null;
      if (!event.touches.length) navigating = false;
    } else if (placement) {
      stop(event); placement = false;
      if (event.type !== 'touchcancel') { stage.setPointersPositions(event); place(event); }
    } else if (event.type === 'touchcancel') cancelDrag();
    refresh();
  };
  content.addEventListener('touchend', end, { capture: true, passive: false });
  content.addEventListener('touchcancel', end, { capture: true, passive: false });
  // Compatibility mouse events must not place a second item or run point.
  content.addEventListener('mousedown', event => { if (Date.now() - lastTouch < 850 && event.sourceCapabilities?.firesTouchEvents) stop(event); }, true);
  refresh();
  return { refresh };
}
