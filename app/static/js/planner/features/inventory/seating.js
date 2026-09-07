/** Seating-report aggregation independent of canvas nodes. */

export function groupChairRowConfigs(configs) {
  const grouped = new Map();
  configs.forEach((config) => {
    const aisles = Array.isArray(config.aisles) ? config.aisles : [];
    const signature = JSON.stringify({ chairName: config.chairName || 'Chair', rows: config.rows || 1, cols: config.cols || 1, totalChairs: config.totalChairs || config.chairCount || 0, aisles: aisles.map((aisle) => ({ direction: aisle.direction, widthFt: aisle.widthFt })) });
    const current = grouped.get(signature) || { config, count: 0, chairs: Number(config.chairCount) || Math.max(1, Number(config.rows) || 1) * Math.max(1, Number(config.cols) || 1) };
    current.count += 1; grouped.set(signature, current);
  });
  return Array.from(grouped.values());
}

export function groupTableSeatingConfigs(configs) {
  const grouped = new Map();
  configs.forEach((config) => {
    const signature = JSON.stringify({ tableName: config.tableName || '', chairName: config.effectiveChairName || config.chairName || '', chairCount: config.chairCount || 0, cocktailHeightMode: config.cocktailHeightMode || '' });
    const current = grouped.get(signature) || { config, count: 0 };
    current.count += 1; grouped.set(signature, current);
  });
  return Array.from(grouped.values());
}
