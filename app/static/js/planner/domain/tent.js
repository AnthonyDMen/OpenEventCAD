/** Pure measurements used by tent add-on placement. */

export function normaliseWeightFootprint(data = {}) {
  const source = data.weightFootprint && typeof data.weightFootprint === 'object' ? data.weightFootprint : {};
  if (source.shape === 'rect') {
    return {
      shape: 'rect',
      widthFt: Number(source.widthFt) || Number(data.widthFt) || Number(data.width) || 1.5,
      lengthFt: Number(source.lengthFt) || Number(data.lengthFt) || Number(data.length) || 1.5,
    };
  }
  return {
    shape: 'circle',
    diameterFt: Number(source.diameterFt) || Number(data.diameterFt) || Number(data.diameter) || (Number(data.radius) ? Number(data.radius) * 2 : 1),
  };
}

export function weightSupportDistance(footprint, direction, rotationDeg) {
  if (footprint.shape !== 'rect') return footprint.diameterFt / 2;
  const theta = rotationDeg * Math.PI / 180;
  const alongLength = direction.x * Math.cos(theta) + direction.y * Math.sin(theta);
  const alongWidth = -direction.x * Math.sin(theta) + direction.y * Math.cos(theta);
  return Math.abs(alongLength) * footprint.lengthFt / 2 + Math.abs(alongWidth) * footprint.widthFt / 2;
}

export function tentLegPositionsFt(widthFt, heightFt) {
  const x = [];
  const y = [];
  if (widthFt === 10 && heightFt === 15) return [[0, 0], [10, 0], [10, 15], [0, 15]];
  if (widthFt === 15 || widthFt === 30) {
    x.push(0, 15);
    if (widthFt === 30) x.push(30);
    const pattern = heightFt === 20 ? [0, 10, 20] : [0];
    if (heightFt !== 20) {
      if (heightFt <= 15) pattern.push(heightFt);
      else {
        let position = 15;
        pattern.push(position);
        while (position < heightFt - 15) {
          position += 10;
          pattern.push(position);
        }
        if (pattern[pattern.length - 1] !== heightFt) pattern.push(heightFt);
      }
    }
    y.push(...pattern);
  } else {
    for (let position = 0; position <= widthFt + 0.1; position += 10) x.push(Math.min(position, widthFt));
    for (let position = 0; position <= heightFt + 0.1; position += 10) y.push(Math.min(position, heightFt));
  }
  return Array.from(new Map([
    ...x.flatMap((position) => [[position, 0], [position, heightFt]]),
    ...y.flatMap((position) => [[0, position], [widthFt, position]]),
  ].map((point) => [point.join(','), point])).values());
}

export function worldPointToTentLocalPoint(worldPoint, origin, rotationDeg = 0, pixelsPerFoot = 1) {
  const dx = worldPoint.x - origin.x;
  const dy = worldPoint.y - origin.y;
  const radians = -rotationDeg * Math.PI / 180;
  return {
    x: (dx * Math.cos(radians) - dy * Math.sin(radians)) / pixelsPerFoot,
    y: (dx * Math.sin(radians) + dy * Math.cos(radians)) / pixelsPerFoot,
  };
}

export function tentLocalPointToWorldPoint(localPoint, origin, rotationDeg = 0, pixelsPerFoot = 1) {
  const radians = rotationDeg * Math.PI / 180;
  const x = localPoint.x * pixelsPerFoot;
  const y = localPoint.y * pixelsPerFoot;
  return {
    x: origin.x + x * Math.cos(radians) - y * Math.sin(radians),
    y: origin.y + x * Math.sin(radians) + y * Math.cos(radians),
  };
}

export function tentContainsLocalPoint(widthFt, heightFt, point, toleranceFt = 0) {
  return point.x >= -toleranceFt && point.x <= widthFt + toleranceFt
    && point.y >= -toleranceFt && point.y <= heightFt + toleranceFt;
}

export function projectLocalPointToTentEdge(widthFt, heightFt, localPoint) {
  const distances = [Math.abs(localPoint.y), Math.abs(localPoint.x - widthFt), Math.abs(localPoint.y - heightFt), Math.abs(localPoint.x)];
  const edge = distances.indexOf(Math.min(...distances));
  if (edge === 0) return { x: Math.max(0, Math.min(widthFt, localPoint.x)), y: 0 };
  if (edge === 1) return { x: widthFt, y: Math.max(0, Math.min(heightFt, localPoint.y)) };
  if (edge === 2) return { x: Math.max(0, Math.min(widthFt, localPoint.x)), y: heightFt };
  return { x: 0, y: Math.max(0, Math.min(heightFt, localPoint.y)) };
}

export function snapTentBistroPoint(widthFt, heightFt, localPoint) {
  const snapAxis = (value, size) => {
    const candidates = [];
    for (let point = 0; point <= size + .001; point += 5) candidates.push(Math.min(size, point));
    if (Math.abs(size - 15) < .01) candidates.push(7.5);
    return candidates.reduce((closest, candidate) => Math.abs(value - candidate) < Math.abs(value - closest) ? candidate : closest, candidates[0]);
  };
  return {
    x: snapAxis(Math.max(0, Math.min(widthFt, localPoint.x)), widthFt),
    y: snapAxis(Math.max(0, Math.min(heightFt, localPoint.y)), heightFt),
  };
}

export function perimeterSignAttachment(widthFt, heightFt, localPoint, signLengthFt = 2) {
  const edgeDistances = [Math.abs(localPoint.y), Math.abs(localPoint.x - widthFt), Math.abs(localPoint.y - heightFt), Math.abs(localPoint.x)];
  const edge = edgeDistances.indexOf(Math.min(...edgeDistances));
  const edgeLength = edge === 0 || edge === 2 ? widthFt : heightFt;
  const coordinate = edge === 0 || edge === 2 ? localPoint.x : localPoint.y;
  const center = Math.max(signLengthFt / 2, Math.min(edgeLength - signLengthFt / 2, coordinate));
  return { kind: 'perimeterSign', edge, center, signLengthFt };
}

export function tentAddonSegments(widthFt, heightFt, localPoint, lengthFt, startOffsetFt = 0) {
  const edgeDistance = [
    Math.abs(localPoint.y),
    Math.abs(localPoint.x - widthFt),
    Math.abs(localPoint.y - heightFt),
    Math.abs(localPoint.x),
  ];
  const clickedEdge = edgeDistance.indexOf(Math.min(...edgeDistance));
  const perimeter = 2 * (widthFt + heightFt);
  if (perimeter <= 0) return [];
  const rawStart = clickedEdge === 0 ? localPoint.x
    : clickedEdge === 1 ? widthFt + localPoint.y
      : clickedEdge === 2 ? widthFt + heightFt + (widthFt - localPoint.x)
        : 2 * widthFt + heightFt + (heightFt - localPoint.y);
  let cursor = ((Math.round(rawStart + startOffsetFt) % perimeter) + perimeter) % perimeter;
  const segments = [];
  let remaining = Math.max(0, Number(lengthFt) || 0);
  while (remaining > 0.001 && segments.length < 100) {
    let edge;
    let edgeOffset;
    let edgeLength;
    if (cursor < widthFt) { edge = 0; edgeOffset = cursor; edgeLength = widthFt; }
    else if (cursor < widthFt + heightFt) { edge = 1; edgeOffset = cursor - widthFt; edgeLength = heightFt; }
    else if (cursor < 2 * widthFt + heightFt) { edge = 2; edgeOffset = cursor - widthFt - heightFt; edgeLength = widthFt; }
    else { edge = 3; edgeOffset = cursor - 2 * widthFt - heightFt; edgeLength = heightFt; }
    const take = Math.min(remaining, edgeLength - edgeOffset);
    const start = edge === 0 || edge === 1 ? edgeOffset : edgeLength - edgeOffset - take;
    segments.push({ edge, start, length: take });
    remaining -= take;
    cursor = (cursor + take) % perimeter;
  }
  return segments;
}

// Sidewalls are normally installed from a leg bay.  A 2.5 ft interval keeps
// the start aligned with the standard tent-leg rhythm while still allowing a
// Shift-held placement to use the exact point on the perimeter.
export function sidewallPlacementPoint(widthFt, heightFt, localPoint, snapToLegBay = true) {
  const point = projectLocalPointToTentEdge(widthFt, heightFt, localPoint);
  if (!snapToLegBay) return point;
  const edgeDistances = [Math.abs(point.y), Math.abs(point.x - widthFt), Math.abs(point.y - heightFt), Math.abs(point.x)];
  const edge = edgeDistances.indexOf(Math.min(...edgeDistances));
  const edgeLength = edge === 0 || edge === 2 ? widthFt : heightFt;
  const coordinate = edge === 0 || edge === 2 ? point.x : point.y;
  const snapped = Math.max(0, Math.min(edgeLength, Math.round(coordinate / 2.5) * 2.5));
  if (edge === 0 || edge === 2) return { x: snapped, y: edge === 0 ? 0 : heightFt };
  return { x: edge === 1 ? widthFt : 0, y: snapped };
}

export function nearestTentLegIndex(widthFt, heightFt, localPoint) {
  const legs = tentLegPositionsFt(widthFt, heightFt);
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  legs.forEach((leg, index) => {
    const distance = Math.hypot(localPoint.x - leg[0], localPoint.y - leg[1]);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return { legs, index: nearestIndex, distance: nearestDistance };
}

export function weightAttachmentAtLeg(widthFt, heightFt, legIndex, localHint, footprint) {
  const legs = tentLegPositionsFt(widthFt, heightFt);
  const leg = legs[legIndex] || legs[0] || [0, 0];
  const isCorner = (leg[0] === 0 || leg[0] === widthFt) && (leg[1] === 0 || leg[1] === heightFt);
  const direction = { x: leg[0] === 0 ? -1 : (leg[0] === widthFt ? 1 : 0), y: leg[1] === 0 ? -1 : (leg[1] === heightFt ? 1 : 0) };
  if (!direction.x && !direction.y) direction.y = localHint && localHint.y < heightFt / 2 ? -1 : 1;
  const magnitude = Math.hypot(direction.x, direction.y) || 1;
  direction.x /= magnitude;
  direction.y /= magnitude;
  let rotationDeg = 0;
  if (footprint.shape === 'rect') rotationDeg = isCorner ? (direction.x * direction.y > 0 ? -45 : 45) : (direction.x ? 90 : 0);
  const centerOffset = 1.5 + weightSupportDistance(footprint, direction, rotationDeg);
  return { kind: 'weight', legIndex, clearanceFt: 1.5, rotationDeg, point: { x: leg[0] + direction.x * centerOffset, y: leg[1] + direction.y * centerOffset } };
}

export function fanAttachmentAtLeg(widthFt, heightFt, legIndex, fanWidthFt, fanLengthFt) {
  const legs = tentLegPositionsFt(widthFt, heightFt);
  const leg = legs[legIndex] || legs[0] || [0, 0];
  const isCorner = (leg[0] === 0 || leg[0] === widthFt) && (leg[1] === 0 || leg[1] === heightFt);
  const direction = { x: leg[0] === 0 ? 1 : (leg[0] === widthFt ? -1 : 0), y: leg[1] === 0 ? 1 : (leg[1] === heightFt ? -1 : 0) };
  let rotationDeg = direction.x ? 90 : 0;
  let point;
  if (isCorner) {
    rotationDeg = direction.x * direction.y > 0 ? -45 : 45;
    const inset = 0.15 + (fanLengthFt + fanWidthFt) / (2 * Math.SQRT2);
    point = { x: leg[0] + direction.x * inset, y: leg[1] + direction.y * inset };
  } else {
    point = { x: leg[0] + direction.x * (fanWidthFt / 2 + 0.15), y: leg[1] + direction.y * (fanWidthFt / 2 + 0.15) };
  }
  return { kind: 'fan', legIndex, rotationDeg, point, insideClearanceFt: 0.15 };
}

// Shift placement keeps a hanging fan on the selected perimeter edge but lets
// it sit between legs.  The rotation puts its long axis toward the tent so the
// preview and final object both read as facing inward.
export function fanAttachmentAtPerimeter(widthFt, heightFt, localPoint, fanWidthFt) {
  const edgePoint = projectLocalPointToTentEdge(widthFt, heightFt, localPoint);
  const edgeDistances = [Math.abs(edgePoint.y), Math.abs(edgePoint.x - widthFt), Math.abs(edgePoint.y - heightFt), Math.abs(edgePoint.x)];
  const edge = edgeDistances.indexOf(Math.min(...edgeDistances));
  const inset = (Number(fanWidthFt) || 1) / 2 + .15;
  if (edge === 0) return { kind: 'fan', edge, rotationDeg: 90, point: { x: edgePoint.x, y: inset }, insideClearanceFt: .15 };
  if (edge === 1) return { kind: 'fan', edge, rotationDeg: 180, point: { x: widthFt - inset, y: edgePoint.y }, insideClearanceFt: .15 };
  if (edge === 2) return { kind: 'fan', edge, rotationDeg: 90, point: { x: edgePoint.x, y: heightFt - inset }, insideClearanceFt: .15 };
  return { kind: 'fan', edge, rotationDeg: 0, point: { x: inset, y: edgePoint.y }, insideClearanceFt: .15 };
}

export function fireExtinguisherAttachmentAtLeg(widthFt, heightFt, legIndex) {
  const legs = tentLegPositionsFt(widthFt, heightFt);
  const leg = legs[legIndex] || legs[0] || [0, 0];
  const direction = { x: leg[0] === 0 ? 1 : leg[0] === widthFt ? -1 : 0, y: leg[1] === 0 ? 1 : leg[1] === heightFt ? -1 : 0 };
  const magnitude = Math.hypot(direction.x, direction.y) || 1;
  return { kind: 'fireExtinguisher', legIndex, point: { x: leg[0] + direction.x * .5 / magnitude, y: leg[1] + direction.y * .5 / magnitude } };
}

export function legDrapeAttachmentAtLeg(widthFt, heightFt, legIndex) {
  const legs = tentLegPositionsFt(widthFt, heightFt);
  const [x, y] = legs[legIndex] || legs[0] || [0, 0];
  return {
    kind: 'legDrape',
    legIndex,
    segments: [
      ...tentAddonSegments(widthFt, heightFt, { x, y }, 1.5, -1.5),
      ...tentAddonSegments(widthFt, heightFt, { x, y }, 1.5),
    ],
  };
}

export function isHangingDecorAddon(addonType) {
  return ['fan', 'bistro', 'customBistro', 'perimeterLight', 'chandelier', 'fireExtinguisher', 'exitSign', 'noSmokingSign'].includes(addonType);
}
