/** Canvas sizing, drawing, and crop geometry for the reference-image editor. */

export function referenceSetupDisplay(canvas, image, view = {}) {
  if (!canvas || !image) return null;
  const width = 900; const height = 620;
  canvas.width = width; canvas.height = height;
  const zoom = Math.max(1, Math.min(8, Number(view.zoom) || 1));
  const scale = Math.min(width / image.width, height / image.height, 1) * zoom;
  const imageWidth = image.width * scale; const imageHeight = image.height * scale;
  const baseX = (width - imageWidth) / 2; const baseY = (height - imageHeight) / 2;
  const maxPanX = Math.max(0, (imageWidth - width) / 2); const maxPanY = Math.max(0, (imageHeight - height) / 2);
  const panX = Math.max(-maxPanX, Math.min(maxPanX, Number(view.panX) || 0));
  const panY = Math.max(-maxPanY, Math.min(maxPanY, Number(view.panY) || 0));
  if (view) { view.zoom = zoom; view.panX = panX; view.panY = panY; }
  return { x: baseX + panX, y: baseY + panY, scale, width, height, imageWidth, imageHeight };
}

export function renderReferenceSetupCanvas(canvas, setup) {
  if (!setup.open || !canvas || !setup.image) return;
  const display = referenceSetupDisplay(canvas, setup.image, setup.view);
  if (!display) return;
  const ctx = canvas.getContext('2d');
  const { crop, image } = setup;
  ctx.clearRect(0, 0, display.width, display.height);
  ctx.drawImage(image, display.x, display.y, display.imageWidth, display.imageHeight);
  ctx.fillStyle = 'rgba(0, 0, 0, .48)'; ctx.fillRect(0, 0, display.width, display.height);
  const cropX = display.x + crop.x * display.scale; const cropY = display.y + crop.y * display.scale;
  const cropWidth = crop.width * display.scale; const cropHeight = crop.height * display.scale;
  ctx.save(); ctx.beginPath(); ctx.rect(cropX, cropY, cropWidth, cropHeight); ctx.clip(); ctx.drawImage(image, display.x, display.y, display.imageWidth, display.imageHeight); ctx.restore();
  ctx.strokeStyle = '#0d6efd'; ctx.lineWidth = 3; ctx.strokeRect(cropX, cropY, cropWidth, cropHeight);
  [0, 1, 2, 3].forEach((index) => { const x = cropX + (index % 2 ? cropWidth : 0); const y = cropY + (index > 1 ? cropHeight : 0); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0d6efd'; ctx.lineWidth = 2; ctx.fillRect(x - 5, y - 5, 10, 10); ctx.strokeRect(x - 5, y - 5, 10, 10); });
  const points = setup.manualPoints;
  if (!points.length) return;
  ctx.fillStyle = '#ffca2c'; ctx.strokeStyle = '#212529'; ctx.lineWidth = 2;
  points.forEach((point) => { ctx.beginPath(); ctx.arc(display.x + point.x * display.scale, display.y + point.y * display.scale, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
  if (points[1]) { ctx.beginPath(); ctx.moveTo(display.x + points[0].x * display.scale, display.y + points[0].y * display.scale); ctx.lineTo(display.x + points[1].x * display.scale, display.y + points[1].y * display.scale); ctx.stroke(); }
}

export function referenceSetupPoint(canvas, image, event, view = {}) {
  const rect = canvas.getBoundingClientRect();
  const display = referenceSetupDisplay(canvas, image, view);
  const canvasX = (event.clientX - rect.left) * canvas.width / rect.width;
  const canvasY = (event.clientY - rect.top) * canvas.height / rect.height;
  return { x: Math.max(0, Math.min(image.width, (canvasX - display.x) / display.scale)), y: Math.max(0, Math.min(image.height, (canvasY - display.y) / display.scale)) };
}

export function clampReferenceCrop(image, crop) {
  const min = Math.min(32, image.width, image.height);
  return { width: Math.max(min, Math.min(image.width, crop.width)), height: Math.max(min, Math.min(image.height, crop.height)), x: Math.max(0, Math.min(image.width - Math.max(min, Math.min(image.width, crop.width)), crop.x)), y: Math.max(0, Math.min(image.height - Math.max(min, Math.min(image.height, crop.height)), crop.y)) };
}
