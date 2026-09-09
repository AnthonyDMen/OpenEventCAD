/** Geometry and collision rules for room doors and openings. */

export function roomAttachmentList(data, nextId = (index) => `attachment-${index + 1}`) {
  const legacy = [...(Array.isArray(data?.doors) ? data.doors : []), ...(Array.isArray(data?.openings) ? data.openings.map((item) => ({ ...item, type: 'opening' })) : [])];
  const source = Array.isArray(data && data.attachments) && (data.attachments.length || !legacy.length) ? data.attachments : legacy;
  return source.map((item, index) => ({ id: item.id || nextId(index), type: item.type === 'opening' ? 'opening' : 'door', componentId: item.componentId || 'room-outline', wallIndex: Math.max(0, Number(item.wallIndex) || 0), t: Math.max(0, Math.min(1, Number(item.t !== undefined ? item.t : item.position) || 0)), widthFt: Math.max(.25, Number(item.widthFt) || 3), swing: item.swing === 'outward' ? 'outward' : 'inward' }));
}

export function roomWall(component, wallIndex) {
  const points = component && component.points || []; const a = points[wallIndex]; const b = points[(Number(wallIndex) + 1) % points.length];
  if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) < .01) return null;
  return { a, b, length: Math.hypot(b.x - a.x, b.y - a.y), dx: b.x - a.x, dy: b.y - a.y };
}

export function roomWallInteriorSide(component) {
  const points = component && component.points || []; if (points.length < 3 || component.closed === false) return 1;
  const area = points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]; return sum + point.x * next.y - next.x * point.y; }, 0);
  return area >= 0 ? 1 : -1;
}

export function roomAttachmentClamp(attachment, wall, attachments = []) {
  if (!attachment || !wall || !Number.isFinite(wall.length) || wall.length <= 0) return attachment;
  const width = Math.min(Math.max(.25, Number(attachment.widthFt) || 3), wall.length);
  const others = attachments.filter((item) => item !== attachment && item.id !== attachment.id && item.componentId === attachment.componentId && Number(item.wallIndex) === Number(attachment.wallIndex));
  const occupied = others.map((item) => {
    const itemWidth = Math.min(Math.max(.25, Number(item.widthFt) || 3), wall.length);
    const center = Math.max(0, Math.min(wall.length, Number(item.t) || 0)) * wall.length;
    return { start: Math.max(0, center - itemWidth / 2), end: Math.min(wall.length, center + itemWidth / 2) };
  }).sort((a, b) => a.start - b.start);
  const gaps = []; let end = 0;
  occupied.forEach((span) => { if (span.start > end) gaps.push({ start: end, end: span.start }); end = Math.max(end, span.end); });
  if (end < wall.length) gaps.push({ start: end, end: wall.length });
  const desired = (Number(attachment.t) || 0) * wall.length;
  const fits = gaps.filter((gap) => gap.end - gap.start >= width - 1e-7);
  if (!fits.length) return null;
  const candidates = fits.map((gap) => Math.max(gap.start + width / 2, Math.min(gap.end - width / 2, desired)));
  candidates.sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired));
  attachment.widthFt = width; attachment.t = candidates[0] / wall.length; return attachment;
}

export function roomAttachmentComponents(widthFt, heightFt, customComponents) {
  return Array.isArray(customComponents) && customComponents.length ? customComponents : [{ id: 'room-outline', kind: 'polygon', points: [{ x: 0, y: 0 }, { x: widthFt, y: 0 }, { x: widthFt, y: heightFt }, { x: 0, y: heightFt }] }];
}

export function roomAttachmentPoint(component, attachment) {
  const wall = roomWall(component, attachment.wallIndex); return wall ? { x: wall.a.x + wall.dx * attachment.t, y: wall.a.y + wall.dy * attachment.t } : null;
}

export function resolveRoomAttachmentComponent(widthFt, heightFt, customComponents, attachment) {
  const components = roomAttachmentComponents(widthFt, heightFt, customComponents);
  return components.find((component) => component.id === attachment.componentId) || components[0] || null;
}

export function constrainRoomAttachmentDrag(roomTransform, component, attachment, attachments, absolutePosition, pixelsPerFoot) {
  const wall = roomWall(component, attachment.wallIndex);
  if (!roomTransform || !wall || !absolutePosition) return null;
  const localPx = roomTransform.copy().invert().point(absolutePosition);
  const localFt = { x: localPx.x / pixelsPerFoot, y: localPx.y / pixelsPerFoot };
  const next = { ...attachment, t: ((localFt.x - wall.a.x) * wall.dx + (localFt.y - wall.a.y) * wall.dy) / (wall.length * wall.length) };
  if (!roomAttachmentClamp(next, wall, attachments)) return null;
  const point = roomAttachmentPoint(component, next);
  return point ? { attachment: next, absolutePosition: roomTransform.point({ x: point.x * pixelsPerFoot, y: point.y * pixelsPerFoot }) } : null;
}

export function roomAttachmentWorldPoint(roomPosition, rotationDeg, point, pixelsPerFoot) {
  const radians = rotationDeg * Math.PI / 180;
  return { x: roomPosition.x + point.x * pixelsPerFoot * Math.cos(radians) - point.y * pixelsPerFoot * Math.sin(radians), y: roomPosition.y + point.x * pixelsPerFoot * Math.sin(radians) + point.y * pixelsPerFoot * Math.cos(radians) };
}
