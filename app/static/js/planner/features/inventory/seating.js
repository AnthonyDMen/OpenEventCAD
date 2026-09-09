/** Seating-report aggregation independent of canvas nodes. */

export function groupChairRowConfigs(configs, nodes = []) {
  const grouped = new Map();
  configs.forEach((config, index) => {
    const aisles = Array.isArray(config.aisles) ? config.aisles : [];
    const signature = JSON.stringify({ label: config.seatingLabel || '', chairName: config.chairName || 'Chair', rows: config.rows || 1, cols: config.cols || 1, totalChairs: config.chairCount ?? config.totalChairs ?? 0, aisles: aisles.map((aisle) => ({ name: aisle.name || '', direction: aisle.direction, widthFt: aisle.widthFt, gapIndex: aisle.gapIndex })) });
    const current = grouped.get(signature) || { config, count: 0, chairs: Number(config.chairCount) || Math.max(1, Number(config.rows) || 1) * Math.max(1, Number(config.cols) || 1), nodes: [] };
    if (nodes[index]) current.nodes.push(nodes[index]);
    current.count += 1; grouped.set(signature, current);
  });
  return Array.from(grouped.values());
}

export function groupTableSeatingConfigs(configs, nodes = []) {
  const grouped = new Map();
  configs.forEach((config, index) => {
    const signature = JSON.stringify({ label: config.seatingLabel || '', tableName: config.tableName || '', chairName: config.effectiveChairName || config.chairName || '', chairCount: config.chairCount || 0, cocktailHeightMode: config.cocktailHeightMode || '', pattern: config.tableChairPattern || 'side_by_side' });
    const current = grouped.get(signature) || { config, count: 0, nodes: [] };
    if (nodes[index]) current.nodes.push(nodes[index]);
    current.count += 1; grouped.set(signature, current);
  });
  return Array.from(grouped.values());
}
