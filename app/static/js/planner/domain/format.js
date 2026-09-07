/** Stateless display formatting and HTML escaping helpers. */

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatInventoryAmount(value, unit) {
  const amount = Number(value) || 0;
  const display = unit === 'ft' ? Math.round(amount * 10) / 10 : amount;
  return unit === 'ft' ? `${display} ft` : String(display);
}

export function formatInventoryUsage(name, value, unit) {
  const amount = formatInventoryAmount(value, unit);
  return /^(Custom )?Bistro Lights$|^Stage Skirt$/i.test(String(name || '').trim()) ? `~${amount}` : amount;
}
