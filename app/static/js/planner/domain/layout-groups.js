/** Validation and merge rules for reusable layout-group templates. */

export function isValidLayoutGroupTemplate(item) {
  if (!(item && item.id && item.name && item.config)) return false;
  return Boolean((item.config.kind === 'tentSetup' && item.config.tent)
    || (Array.isArray(item.config.nodes) && item.config.nodes.length));
}

export function validLayoutGroupTemplates(items) {
  return Array.isArray(items) ? items.filter(isValidLayoutGroupTemplate) : [];
}

export function mergeLayoutGroupTemplates(existing, incoming) {
  const byId = new Map(validLayoutGroupTemplates(existing).map((item) => [item.id, item]));
  validLayoutGroupTemplates(incoming).forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values());
}

export function isLayoutGroupableNodeType(type) {
  return !['venue', 'referenceImage', 'layoutGroup'].includes(type);
}

export function layoutGroupConfigFromSnapshots(snapshots) {
  const supported = Array.isArray(snapshots) ? snapshots.filter((snapshot) => snapshot && snapshot.json && snapshot.bounds && isLayoutGroupableNodeType(snapshot.type)) : [];
  if (!supported.length) return null;
  const minX = Math.min(...supported.map((snapshot) => snapshot.bounds.x));
  const minY = Math.min(...supported.map((snapshot) => snapshot.bounds.y));
  const maxX = Math.max(...supported.map((snapshot) => snapshot.bounds.x + snapshot.bounds.width));
  const maxY = Math.max(...supported.map((snapshot) => snapshot.bounds.y + snapshot.bounds.height));
  const nodes = supported.map(({ json }) => {
    const attrs = { ...(json.attrs || {}) };
    attrs.templateSourceNodeId = attrs.nodeId || '';
    delete attrs.nodeId;
    delete attrs.layerId;
    attrs.x = (Number(attrs.x) || 0) - minX;
    attrs.y = (Number(attrs.y) || 0) - minY;
    return { ...json, attrs };
  });
  return { nodes, bounds: { width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) } };
}
