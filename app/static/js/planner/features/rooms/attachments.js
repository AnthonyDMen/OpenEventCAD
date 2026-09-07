/** Editing controls for room doors and openings. */

export function createRoomAttachmentControls(ctx) {
  const { getEdit, setEdit, roomAttachmentPopup, roomAttachmentWidth, roomAttachmentSwing, stageContainer, getRoomAttachmentList, roomAttachmentComponents, roomWall, roomAttachmentClamp, renderVenueAttachmentGeometry, setDirty, worldLayer } = ctx;

  function close() {
    if (roomAttachmentPopup) roomAttachmentPopup.style.display = 'none';
    setEdit(null);
  }

  function open(room, attachment, screenPoint) {
    if (!roomAttachmentPopup || !roomAttachmentWidth) return;
    setEdit({ room, attachment });
    roomAttachmentWidth.value = String(attachment.widthFt);
    roomAttachmentSwing.style.display = attachment.type === 'door' ? '' : 'none';
    const canvasRect = stageContainer && stageContainer.getBoundingClientRect ? stageContainer.getBoundingClientRect() : { left: 0, top: 0 };
    const screenX = canvasRect.left + screenPoint.x;
    const screenY = canvasRect.top + screenPoint.y;
    roomAttachmentPopup.style.left = `${Math.min(window.innerWidth - 185, Math.max(8, screenX + 10))}px`;
    roomAttachmentPopup.style.top = `${Math.min(window.innerHeight - 150, Math.max(8, screenY + 10))}px`;
    roomAttachmentPopup.style.display = 'block';
  }

  function update(room, attachment) {
    if (!room || !attachment) return null;
    const attachments = getRoomAttachmentList({ attachments: room.getAttr('attachmentsSpec') || [] });
    let stored = attachments.find((item) => item.id === attachment.id);
    if (!stored) {
      stored = { ...attachment };
      attachments.push(stored);
    }
    Object.assign(stored, attachment);
    const components = roomAttachmentComponents(room.getAttr('widthFt'), room.getAttr('heightFt'), room.getAttr('componentsSpec'));
    const component = components.find((item) => item.id === stored.componentId) || roomAttachmentComponents(room.getAttr('widthFt'), room.getAttr('heightFt'))[0];
    const wall = roomWall(component, stored.wallIndex);
    if (wall) roomAttachmentClamp(stored, wall, attachments);
    room.setAttr('attachmentsSpec', attachments);
    room.setAttr('doorsSpec', attachments.filter((item) => item.type === 'door'));
    renderVenueAttachmentGeometry(room);
    setDirty(true);
    if (worldLayer) worldLayer.batchDraw();
    return room.getAttr('attachmentsSpec').find((item) => item.id === stored.id) || stored;
  }

  return { close, open, update, getEdit };
}
