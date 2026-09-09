/** Pure layer configuration, repair, and ordering rules. */

const BASE_LAYERS = [
  { id: 'reference-base', name: 'Reference Images', kind: 'reference', visible: true, locked: true, builtIn: true },
  { id: 'subfloor-base', name: 'Subfloor', kind: 'subfloor', visible: true, locked: false, builtIn: true },
  { id: 'venue-base', name: 'Venue', kind: 'venue', visible: true, locked: false, builtIn: true },
  { id: 'items-base', name: 'Items', kind: 'item', visible: true, locked: false, builtIn: true },
  { id: 'decor-base', name: 'Hanging Decor', kind: 'decor', visible: true, locked: false, builtIn: true },
  { id: 'labels-base', name: 'Labels', kind: 'label', visible: true, locked: false, builtIn: true },
];

export function defaultLayers() {
  return BASE_LAYERS.map((layer, order) => ({ ...layer, order }));
}

export function normaliseLayer(raw, index, nextLayerId) {
  const kind = raw && ['venue', 'label', 'reference', 'decor', 'subfloor'].includes(raw.kind) ? raw.kind : 'item';
  return { id: raw && raw.id ? String(raw.id) : nextLayerId(kind), name: raw && raw.name ? String(raw.name) : (kind === 'reference' ? 'Reference Images' : kind === 'subfloor' ? 'Subfloor' : kind === 'venue' ? 'Venue Layer' : kind === 'label' ? 'Labels' : kind === 'decor' ? 'Hanging Decor' : 'Item Layer'), kind, visible: raw && raw.visible !== false, locked: !!(raw && raw.locked), builtIn: !!(raw && raw.builtIn), opacity: raw && Number.isFinite(Number(raw.opacity)) ? Math.max(.05, Math.min(1, Number(raw.opacity))) : .5, order: Number.isFinite(raw && raw.order) ? Number(raw.order) : index };
}

export function ensureBaseLayers(layers, nextLayerId) {
  const next = Array.isArray(layers) ? layers.map((layer, index) => normaliseLayer(layer, BASE_LAYERS.length + index, nextLayerId)) : [];
  const baseIds = new Set(BASE_LAYERS.map((layer) => layer.id));
  const restoredBaseLayers = BASE_LAYERS.map((base) => {
    const saved = next.find((layer) => layer.id === base.id);
    return saved ? { ...base, ...saved, id: base.id, kind: base.kind, builtIn: true } : { ...base };
  });
  const customLayers = next.filter((layer) => !baseIds.has(layer.id));
  return [...restoredBaseLayers, ...customLayers].map((layer, index) => ({ ...layer, order: index }));
}

export function layerAcceptsPlacement(layer, kind) {
  return !!(layer && layer.visible && !layer.locked && layer.kind === kind);
}

export function fallbackLayerIdForKind(kind) {
  return kind === 'venue' ? 'venue-base' : kind === 'subfloor' ? 'subfloor-base' : kind === 'label' ? 'labels-base' : kind === 'decor' ? 'decor-base' : 'items-base';
}

export function nodeIsSelectable({ selectable, customType, labelMode, layer, parentTentLayer, parentTentExists = true }) {
  if (!selectable || !layer || !layer.visible || layer.locked) return false;
  if (customType === 'tentAddon' && (!parentTentExists || !parentTentLayer || !parentTentLayer.visible || parentTentLayer.locked)) return false;
  return true;
}
