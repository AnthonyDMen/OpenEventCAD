/** Konva rendering for room walls, doors, and openings. */

export function renderRoomWalls(ctx, room, components, outlineCfg) {
  const { Konva, pixelsPerFoot, roomWall } = ctx;
  room.find('.venueWallSegment').forEach((node) => node.destroy());
  const stroke = (outlineCfg && outlineCfg.color) || '#0d6efd';
  const thickness = (outlineCfg && outlineCfg.thickness) || 4;
  components.forEach((component) => {
    const points = component.points || [];
    const edgeCount = component.closed === false ? Math.max(0, points.length - 1) : points.length;
    for (let index = 0; index < edgeCount; index += 1) {
      if ((component.removedWalls || []).includes(index)) continue;
      const wall = roomWall(component, index);
      if (wall) room.add(new Konva.Line({ points: [wall.a.x * pixelsPerFoot, wall.a.y * pixelsPerFoot, wall.b.x * pixelsPerFoot, wall.b.y * pixelsPerFoot], stroke, strokeWidth: thickness, lineCap: 'butt', listening: true, name: 'venueWallSegment' }));
    }
  });
}

export function renderRoomAttachments(ctx, room) {
  const { Konva, activeTool, pixelsPerFoot, stage, roomAttachmentList, roomAttachmentComponents, roomWall, roomAttachmentClamp, roomAttachmentPoint, roomWallInteriorSide, constrainRoomAttachmentDrag, updateRoomAttachment, openRoomAttachmentPopup } = ctx;
  if (!room || room.getAttr('customType') !== 'venue') return;
  const attachments = roomAttachmentList({ attachments: room.getAttr('attachmentsSpec') || [] });
  room.setAttr('attachmentsSpec', attachments);
  room.find('.roomAttachment').forEach((node) => node.destroy());
  const components = roomAttachmentComponents(room.getAttr('widthFt'), room.getAttr('heightFt'), room.getAttr('componentsSpec'));
  attachments.forEach((attachment) => {
    const component = components.find((item) => item.id === attachment.componentId) || components[0];
    const wall = roomWall(component, attachment.wallIndex);
    if (!wall) return;
    if (!roomAttachmentClamp(attachment, wall, attachments)) return;
    const point = roomAttachmentPoint(component, attachment);
    if (!point) return;
    const width = Math.min(attachment.widthFt, wall.length);
    const half = width * pixelsPerFoot / 2;
    const marker = new Konva.Group({ x: point.x * pixelsPerFoot, y: point.y * pixelsPerFoot, rotation: Math.atan2(wall.dy, wall.dx) * 180 / Math.PI, draggable: activeTool === 'select', name: 'roomAttachment' });
    marker.setAttr('attachmentId', attachment.id);
    marker.add(new Konva.Line({ points: [-half, 0, half, 0], stroke: '#fff', strokeWidth: 8, lineCap: 'round' }));
    marker.add(new Konva.Line({ points: [-half, 0, half, 0], stroke: attachment.type === 'door' ? '#198754' : '#f59e0b', strokeWidth: 4, lineCap: 'round' }));
    if (attachment.type === 'door') {
      const interior = roomWallInteriorSide(component);
      const side = attachment.swing === 'outward' ? -interior : interior;
      marker.add(new Konva.Arc({ x: 0, y: 0, innerRadius: half, outerRadius: half, angle: 90, rotation: side > 0 ? 45 : -135, stroke: '#198754', strokeWidth: 2 }));
    }
    marker.dragBoundFunc((position) => {
      const constrained = constrainRoomAttachmentDrag(room, component, attachment, attachments, position);
      return constrained ? constrained.absolutePosition : marker.getAbsolutePosition();
    });
    marker.on('dragstart dragmove', (event) => { event.cancelBubble = true; });
    marker.on('dragend', (event) => {
      event.cancelBubble = true;
      const constrained = constrainRoomAttachmentDrag(room, component, attachment, attachments, marker.getAbsolutePosition());
      if (constrained) { attachment.t = constrained.attachment.t; attachment.widthFt = constrained.attachment.widthFt; marker.absolutePosition(constrained.absolutePosition); }
      updateRoomAttachment(room, attachment);
    });
    marker.on('dblclick dbltap', (event) => { event.cancelBubble = true; openRoomAttachmentPopup(room, attachment, stage && stage.getPointerPosition ? stage.getPointerPosition() : { x: 10, y: 10 }); });
    room.add(marker);
  });
}
