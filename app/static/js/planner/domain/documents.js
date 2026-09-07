/** Local planner-document storage and record update rules. */

export function readLocalDocuments(storage, key) {
  try {
    const parsed = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function writeLocalDocuments(storage, key, documents) {
  storage.setItem(key, JSON.stringify(documents));
}

export function upsertLocalDocument(documents, { id = null, title, layout, now, nextId }) {
  const items = Array.isArray(documents) ? documents.slice() : [];
  const existingIndex = items.findIndex((item) => item.id === id);
  const saved = {
    id: id || nextId(),
    title,
    layout,
    created_at: existingIndex >= 0 ? items[existingIndex].created_at : now,
    updated_at: now,
  };
  if (existingIndex >= 0) items[existingIndex] = saved;
  else items.unshift(saved);
  return { items, saved };
}
