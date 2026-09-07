/** Room-wall attachment hit testing, previewing, and placement. */

export function createRoomAttachmentPlacement(ctx) {
  const { Konva, pixelsPerFoot, stage, stageContainer, worldGroup, worldLayer, uiGroup, collectionToArray, roomAttachmentComponents, roomWall, roomAttachmentClamp, roomAttachmentList, roomWallInteriorSide, closestVenueBuilderWall, getPlacementPreview, getPlacementPayload, renderRoomWalls, renderVenueAttachmentGeometry, setDirty, showPlannerToast } = ctx;

  function currentWorldPointer() {
    if (!worldGroup) return null;
    const relative = worldGroup.getRelativePointerPosition && worldGroup.getRelativePointerPosition();
    if (relative) return relative;
    const stagePoint = stage && stage.getPointerPosition && stage.getPointerPosition();
    if (!stagePoint || !worldGroup.getAbsoluteTransform) return null;
    return worldGroup.getAbsoluteTransform().copy().invert().point(stagePoint);
  }

  function pointerFromEvent(event) {
    if (!stageContainer || !worldGroup || !event) return null;
    const source = event.evt || event;
    const touch = (source.touches && source.touches[0]) || (source.changedTouches && source.changedTouches[0]) || source;
    const clientX = Number(touch.clientX);
    const clientY = Number(touch.clientY);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    const rect = stageContainer.getBoundingClientRect();
    const stagePoint = { x: clientX - rect.left, y: clientY - rect.top };
    return worldGroup.getAbsoluteTransform().copy().invert().point(stagePoint);
  }

  function localPoint(room, worldPoint) {
    const radians = -(room.rotation() || 0) * Math.PI / 180;
    const dx = worldPoint.x - room.x();
    const dy = worldPoint.y - room.y();
    return { x: (dx * Math.cos(radians) - dy * Math.sin(radians)) / pixelsPerFoot, y: (dx * Math.sin(radians) + dy * Math.cos(radians)) / pixelsPerFoot };
  }

  function candidate(worldPoint) {
    let best = null;
    let bestDistance = Infinity;
    if (!worldPoint) return null;
    const rooms = worldLayer && worldLayer.find ? collectionToArray(worldLayer.find('.venue')) : [];
    rooms.forEach((room) => {
      if (!room || (room.isVisible && !room.isVisible()) || room.getAttr('customType') !== 'venue' || room.getAttr('venueType') === 'tent') return;
      const local = localPoint(room, worldPoint);
      if (!local || !Number.isFinite(local.x) || !Number.isFinite(local.y)) return;
      const components = roomAttachmentComponents(room.getAttr('widthFt'), room.getAttr('heightFt'), room.getAttr('componentsSpec'));
      components.forEach((component) => {
        if ((component.id === 'room-outline' || !room.getAttr('componentsSpec')) && component.points && component.points.length === 4) {
          const widthFt = Number(room.getAttr('widthFt')) || 0;
          const heightFt = Number(room.getAttr('heightFt')) || 0;
          if (widthFt <= 0 || heightFt <= 0) return;
          const distances = [
            { index: 0, value: Math.abs(local.y), along: local.x, length: widthFt },
            { index: 1, value: Math.abs(local.x - widthFt), along: local.y, length: heightFt },
            { index: 2, value: Math.abs(local.y - heightFt), along: widthFt - local.x, length: widthFt },
            { index: 3, value: Math.abs(local.x), along: heightFt - local.y, length: heightFt },
          ].sort((a, b) => a.value - b.value)[0];
          if (distances && distances.length > 0 && distances.value <= 3 && local.x >= -3 && local.x <= widthFt + 3 && local.y >= -3 && local.y <= heightFt + 3) {
            const t = Math.max(0, Math.min(1, distances.along / distances.length));
            const wall = roomWall(component, distances.index);
            if (wall && distances.value < bestDistance) {
              best = { room, component, components, wall: { ...wall, index: distances.index, t, distance: distances.value } };
              bestDistance = distances.value;
            }
          }
          return;
        }
        const wall = closestVenueBuilderWall(local, component);
        if (!wall) return;
        const points = component.points || [];
        const minX = points.length ? Math.min(...points.map((point) => Number(point.x) || 0)) : 0;
        const maxX = points.length ? Math.max(...points.map((point) => Number(point.x) || 0)) : 0;
        const minY = points.length ? Math.min(...points.map((point) => Number(point.y) || 0)) : 0;
        const maxY = points.length ? Math.max(...points.map((point) => Number(point.y) || 0)) : 0;
        const withinHost = local.x >= minX - 3 && local.x <= maxX + 3 && local.y >= minY - 3 && local.y <= maxY + 3;
        if (withinHost && wall.distance <= 3 && wall.distance < bestDistance) {
          best = { room, component, components, wall };
          bestDistance = wall.distance;
        }
      });
    });
    return best;
  }

  function renderPreview(worldPoint) {
    const placementPreview = getPlacementPreview();
    const placementPayload = getPlacementPayload();
    if (!placementPreview) return;
    const match = candidate(worldPoint);
    if (!match) {
      placementPreview.hide();
      worldLayer.batchDraw();
      return;
    }
    const wall = match.wall;
    const attachment = { t: wall.t, widthFt: Number(placementPayload.widthFt) || 3 };
    roomAttachmentClamp(attachment, wall, []);
    const point = { x: wall.a.x + wall.dx * attachment.t, y: wall.a.y + wall.dy * attachment.t };
    placementPreview.destroyChildren();
    placementPreview.position(match.room.position());
    placementPreview.rotation(match.room.rotation() || 0);
    placementPreview.opacity(1);
    placementPreview.show();
    const marker = new Konva.Group({ x: point.x * pixelsPerFoot, y: point.y * pixelsPerFoot, rotation: Math.atan2(wall.dy, wall.dx) * 180 / Math.PI, listening: false, name: 'roomAttachmentPreviewMarker' });
    const width = Math.min(attachment.widthFt, wall.length) * pixelsPerFoot;
    const half = width / 2;
    const color = placementPayload.attachmentType === 'door' ? '#198754' : '#f59e0b';
    marker.add(new Konva.Line({ points: [-half, 0, half, 0], stroke: '#fff', strokeWidth: 10, lineCap: 'round', listening: false }));
    marker.add(new Konva.Line({ points: [-half, 0, half, 0], stroke: color, strokeWidth: 5, lineCap: 'round', listening: false }));
    if (placementPayload.attachmentType === 'door') {
      const interior = roomWallInteriorSide(match.component);
      const side = placementPayload.swing === 'outward' ? -interior : interior;
      marker.add(new Konva.Arc({ x: 0, y: 0, innerRadius: half, outerRadius: half, angle: 90, rotation: side > 0 ? 45 : -135, stroke: '#198754', strokeWidth: 3, listening: false, name: 'roomAttachmentPlacementSwing' }));
    }
    placementPreview.add(marker);
    placementPreview.moveToTop();
    if (uiGroup) uiGroup.moveToTop();
    placementPreview.show();
    worldLayer.batchDraw();
  }

  function place(worldPoint, type) {
    const placementPayload = getPlacementPayload();
    const best = candidate(worldPoint);
    if (!best) {
      showPlannerToast('Click within 18 inches of an indoor room wall.');
      return false;
    }
    const attachments = roomAttachmentList({ attachments: best.room.getAttr('attachmentsSpec') || [] });
    const attachment = { id: `room-attachment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, componentId: best.component.id || 'room-outline', wallIndex: best.wall.index, t: best.wall.t, widthFt: Number(placementPayload && placementPayload.widthFt) || 3, swing: placementPayload && placementPayload.swing === 'outward' ? 'outward' : 'inward' };
    const wall = roomWall(best.component, attachment.wallIndex);
    roomAttachmentClamp(attachment, wall, attachments);
    if (Math.abs(attachment.t - best.wall.t) > 0.02 && attachments.some((item) => item.componentId === attachment.componentId && Number(item.wallIndex) === attachment.wallIndex)) {
      showPlannerToast('There is not enough room beside another wall attachment.');
      return false;
    }
    attachments.push(attachment);
    best.room.setAttr('attachmentsSpec', attachments);
    best.room.setAttr('doorsSpec', attachments.filter((item) => item.type === 'door'));
    renderRoomWalls(best.room, best.components, best.room.getAttr('outlineSpec'));
    renderVenueAttachmentGeometry(best.room);
    setDirty(true);
    worldLayer.batchDraw();
    return true;
  }

  return { currentWorldPointer, pointerFromEvent, candidate, renderPreview, localPoint, place };
}
