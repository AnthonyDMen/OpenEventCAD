/** Catalog normalization and inventory classification rules. */

export function normaliseInventoryDefinition(raw, sectionId) {
  if (!raw || typeof raw !== 'object') return null;
  const entry = { ...raw, sectionId };
  entry.name = String(entry.name || entry.display_name || '').trim();
  entry.aliases = Array.isArray(entry.aliases) ? entry.aliases.map((value) => String(value || '').trim()).filter(Boolean) : [];
  entry.id = String(entry.id || entry.familyId || entry.name || `${sectionId}-item`).trim();
  entry.unit = typeof entry.unit === 'string' ? entry.unit.trim().toLowerCase() : 'ft';
  entry.category = entry.category || sectionId;
  entry.hiddenFromPanel = !!entry.hiddenFromPanel;
  entry.labelText = typeof entry.labelText === 'string' ? entry.labelText.trim() : '';
  entry.notes = typeof entry.notes === 'string' ? entry.notes.trim() : '';
  entry.footprint = raw.footprint && typeof raw.footprint === 'object' ? raw.footprint : null;
  entry.weightFootprint = raw.weightFootprint && typeof raw.weightFootprint === 'object' ? raw.weightFootprint : null;
  entry.addonType = typeof raw.addonType === 'string' ? raw.addonType.trim() : '';
  entry.drawMode = typeof raw.drawMode === 'string' ? raw.drawMode.trim() : '';
  return entry.name ? entry : null;
}

export function inventoryMeasurementIsAssumed(item, backlog) {
  const name = String(item && item.name || '').toLowerCase();
  return (Array.isArray(backlog) ? backlog : []).some((entry) => {
    const flagged = String(entry && entry.name || '').toLowerCase();
    return (flagged.includes('boho') && /boho|loui|wicker|throne/.test(name)) || (flagged.includes('cooler') && /chiller|cooler/.test(name)) || (flagged.includes('cherry blossom') && /cherry blossom/.test(name)) || (flagged && (name.includes(flagged) || flagged.includes(name)));
  });
}

export function inventoryRowUnit(name, explicitUnit = '') {
  return explicitUnit || (/^(Bistro|Custom Bistro|Perimeter) Lights$/i.test(String(name || '').trim()) ? 'ft' : 'count');
}
