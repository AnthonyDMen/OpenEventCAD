/** Pure tent setup and inventory summary rules. */

export function tentDisplayNameFromSize(widthFt, heightFt) {
  return widthFt > 0 && heightFt > 0 ? `${widthFt}x${heightFt} Tent` : 'Tent';
}

export function stableTentSetupValue(value) {
  if (Array.isArray(value)) return value.map(stableTentSetupValue);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((next, key) => {
    next[key] = stableTentSetupValue(value[key]);
    return next;
  }, {});
  return typeof value === 'number' ? Math.round(value * 1000) / 1000 : value;
}

export function tentAddonSetupEntryFromAttrs(attrs = {}) {
  return stableTentSetupValue({
    addonType: attrs.addonType || '',
    inventoryName: attrs.inventoryName || '',
    widthFt: attrs.widthFt || 0,
    lengthFt: attrs.lengthFt || 0,
    diameterFt: attrs.diameterFt || 0,
    weightFootprint: attrs.weightFootprint || null,
    attachment: attrs.attachment || null,
  });
}

export function tentSetupSignatureFromAttrs(tentAttrs = {}, addonEntries = []) {
  const addons = addonEntries.slice().sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(stableTentSetupValue({
    widthFt: tentAttrs.widthFt || 0,
    heightFt: tentAttrs.heightFt || 0,
    addons,
  }));
}

export function tentAddonUsageRowsFromRecords(records = []) {
  const rows = new Map();
  records.forEach(({ addonType = '', inventoryName = '', lengthFt = 0 }) => {
    const isBistro = addonType === 'bistro' || addonType === 'customBistro';
    const name = isBistro ? 'Bistro Lights' : (inventoryName || addonType || 'Tent add-on');
    const amount = lengthFt > 0 ? Math.round(lengthFt) : 0;
    const unit = amount > 0 ? 'ft' : 'count';
    const current = rows.get(name) || { name, amount: 0, unit };
    current.amount += amount > 0 ? amount : 1;
    if (unit === 'ft') current.unit = 'ft';
    rows.set(name, current);
  });
  return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name));
}
