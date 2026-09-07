/** Unit-safe reference-image calibration calculations. */

export function calibrationFactor(knownFt, measuredUnits, unitsPerFoot) {
  const known = Number(knownFt); const measured = Number(measuredUnits);
  return Number.isFinite(known) && known > 0 && Number.isFinite(measured) && measured > 0 ? (known * unitsPerFoot) / measured : null;
}

export function referenceSetupDimensions(crop, scale, unitsPerFoot) {
  if (!crop || !scale || !scale.pixels || !scale.feet) return null;
  const pixelsPerFoot = scale.pixels / scale.feet;
  return { width: crop.width / pixelsPerFoot * unitsPerFoot, height: crop.height / pixelsPerFoot * unitsPerFoot };
}
