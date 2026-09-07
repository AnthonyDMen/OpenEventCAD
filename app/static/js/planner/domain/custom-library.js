/** Validation and merge rules for browser-stored user-created templates. */

export function readCustomInventoryItems(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(value)
      ? value.filter((item) => item && item.id && item.name && ((Array.isArray(item.components) && item.components.length) || (Array.isArray(item.points) && item.points.length >= 3)))
      : [];
  } catch {
    return [];
  }
}

export function readCustomVenueTemplates(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(value)
      ? value.filter((item) => item && ((Array.isArray(item.components) && item.components.length) || (Array.isArray(item.points) && item.points.length >= 3)))
      : [];
  } catch {
    return [];
  }
}

export function mergeCustomTemplateRecords(current, incoming) {
  const merged = Array.isArray(current) ? [...current] : [];
  (Array.isArray(incoming) ? incoming : []).forEach((entry) => {
    const index = merged.findIndex((item) => item && item.id === entry.id);
    if (index >= 0) merged[index] = entry;
    else merged.push(entry);
  });
  return merged;
}
