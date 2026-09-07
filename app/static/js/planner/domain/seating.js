/** Stateless layout helpers shared by seating features. */

export function distributeAlongSpan(count, spanFt, footprintFt) {
  if (!count) return [];
  if (count === 1) return [spanFt / 2];
  const edgeInsetFt = Math.max(0.5, footprintFt / 2);
  const usableSpanFt = Math.max(0, spanFt - (2 * edgeInsetFt));
  const preferredGapFt = 0.5;
  const preferredStepFt = footprintFt + preferredGapFt;
  const maxStepFt = usableSpanFt / Math.max(1, count - 1);
  const stepFt = Math.min(preferredStepFt, maxStepFt);
  const centerFt = spanFt / 2;
  const startFt = centerFt - ((stepFt * (count - 1)) / 2);
  return Array.from({ length: count }, (_, index) => startFt + (index * stepFt));
}

export function normaliseChairRowsAisles(config) {
  if (!config || config.aislesEnabled === false) return [];
  const source = Array.isArray(config.aisles) ? config.aisles : [];
  const count = Math.min(40, Math.max(1, parseInt(config.aisleCount, 10) || source.length || 1));
  return Array.from({ length: count }, (_, index) => {
    const item = source[index] || {};
    const normalised = {
      id: item.id || `aisle-${index + 1}`,
      direction: ['vertical', 'horizontal', 'diagonal'].includes(item.direction) ? item.direction : 'vertical',
      widthFt: Math.min(20, Math.max(2, Number(item.widthFt) || 4)),
      position: Math.max(0, Math.min(1, Number.isFinite(Number(item.position)) ? Number(item.position) : (index + 1) / (count + 1))),
      angleDeg: Number.isFinite(Number(item.angleDeg)) ? Number(item.angleDeg) : 45,
    };
    if (Number.isFinite(Number(item.gapIndex))) normalised.gapIndex = Math.max(0, Math.round(Number(item.gapIndex)));
    return normalised;
  });
}

export function chairRowsAisleGapIndex(aisle, gapCount) {
  const lastGap = Math.max(0, Number(gapCount) - 1);
  if (Number.isFinite(Number(aisle && aisle.gapIndex))) {
    return Math.max(0, Math.min(lastGap, Math.round(Number(aisle.gapIndex))));
  }
  const position = Math.max(0, Math.min(1, Number(aisle && aisle.position) || 0));
  return Math.max(0, Math.min(lastGap, Math.round(position * (Number(gapCount) + 1)) - 1));
}

export function chairRowsGapCenterFt(gapIndex, footprintFt, spacingFt) {
  return (Number(gapIndex) + 1) * Number(footprintFt) + Number(gapIndex) * Number(spacingFt) + Number(spacingFt) / 2;
}

export function chairRowsNearestAvailableGap(pointerFt, axis, aisles, direction) {
  const gapCount = Math.max(0, Number(axis && axis.gapCount) || 0);
  const directional = (Array.isArray(aisles) ? aisles : [])
    .filter((aisle) => aisle && aisle.direction === direction)
    .map((aisle) => ({ ...aisle, gapIndex: chairRowsAisleGapIndex(aisle, gapCount) }));
  const occupied = new Set(directional.map((aisle) => aisle.gapIndex));
  let best = null;
  for (let gapIndex = 0; gapIndex < gapCount; gapIndex += 1) {
    if (occupied.has(gapIndex)) continue;
    const precedingWidthFt = directional
      .filter((aisle) => aisle.gapIndex < gapIndex)
      .reduce((sum, aisle) => sum + (Number(aisle.widthFt) || 0), 0);
    const centerFt = chairRowsGapCenterFt(gapIndex, axis.footprintFt, axis.spacingFt) + precedingWidthFt;
    const distance = Math.abs(Number(pointerFt) - centerFt);
    if (!best || distance < best.distance) best = { gapIndex, centerFt, distance };
  }
  return best;
}

export function chairRowsAislePhysicalCenterFt(aisle, aisles, axis) {
  const gapIndex = chairRowsAisleGapIndex(aisle, axis.gapCount);
  const earlierWidthFt = (Array.isArray(aisles) ? aisles : [])
    .filter((entry) => entry && entry.direction === aisle.direction)
    .filter((entry) => chairRowsAisleGapIndex(entry, axis.gapCount) < gapIndex)
    .reduce((total, entry) => total + (Number(entry.widthFt) || 0), 0);
  return chairRowsGapCenterFt(gapIndex, axis.footprintFt, axis.spacingFt) + earlierWidthFt;
}

export function chairRowsAisleVisualBounds(geometry, aisle) {
  const vertical = aisle.direction === 'vertical';
  const widthFt = Number(aisle.widthFt) || 4;
  const axis = vertical
    ? { gapCount: Math.max(1, Number(geometry.cols) - 1), footprintFt: geometry.chairLengthFt, spacingFt: geometry.seatSpacingFt }
    : { gapCount: Math.max(1, Number(geometry.rows) - 1), footprintFt: geometry.chairWidthFt, spacingFt: geometry.rowSpacingFt };
  const physicalCenterFt = chairRowsAislePhysicalCenterFt(aisle, geometry.aisles || [], axis);
  return vertical
    ? { xFt: physicalCenterFt - widthFt / 2, yFt: 0, widthFt, heightFt: geometry.widthFt }
    : { xFt: 0, yFt: physicalCenterFt - widthFt / 2, widthFt: geometry.lengthFt, heightFt: widthFt };
}

export function distributeRectChairCounts(total, maxLongPerSide, maxShortPerSide) {
  let remaining = Math.max(0, total);
  let longA = 0;
  let longB = 0;
  let shortA = 0;
  let shortB = 0;
  while (remaining >= 2 && (longA < maxLongPerSide || longB < maxLongPerSide)) {
    if (longA < maxLongPerSide) {
      longA += 1;
      remaining -= 1;
      if (remaining === 0) break;
    }
    if (longB < maxLongPerSide) {
      longB += 1;
      remaining -= 1;
    }
  }
  while (remaining >= 2 && (shortA < maxShortPerSide || shortB < maxShortPerSide)) {
    if (shortA < maxShortPerSide) {
      shortA += 1;
      remaining -= 1;
      if (remaining === 0) break;
    }
    if (shortB < maxShortPerSide) {
      shortB += 1;
      remaining -= 1;
    }
  }
  if (remaining > 0) {
    if (shortA < maxShortPerSide) shortA += 1;
    else if (shortB < maxShortPerSide) shortB += 1;
    else if (longA < maxLongPerSide) longA += 1;
    else if (longB < maxLongPerSide) longB += 1;
  }
  return { longA, longB, shortA, shortB };
}
