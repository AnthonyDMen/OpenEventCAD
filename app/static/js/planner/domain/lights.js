/** Pure point generation for tent lighting layouts. */

export function chandelierPositionsFt(widthFt, heightFt) {
  const longIsWidth = widthFt >= heightFt;
  const longSide = longIsWidth ? widthFt : heightFt;
  const shortSide = longIsWidth ? heightFt : widthFt;
  const isSquare = Math.abs(longSide - shortSide) < 0.01;
  const count = isSquare ? 1 : Math.max(Math.floor(longSide / shortSide), Math.ceil(longSide / 40));
  return Array.from({ length: count }, (_, index) => ({
    x: longIsWidth ? longSide * (index + 0.5) / count : widthFt / 2,
    y: longIsWidth ? heightFt / 2 : longSide * (index + 0.5) / count,
  }));
}

export function bistroZigZagPointsFt(widthFt, heightFt) {
  const longIsWidth = widthFt >= heightFt;
  const longSide = longIsWidth ? widthFt : heightFt;
  const shortSide = longIsWidth ? heightFt : widthFt;
  const halfBayFt = shortSide / 2;
  const points = [];
  for (let longPosition = 0, index = 0; longPosition < longSide - 0.001; longPosition += halfBayFt, index += 1) {
    const crossPosition = index % 2 === 0 ? (index % 4 === 0 ? 0 : shortSide) : shortSide / 2;
    points.push(longIsWidth ? { x: longPosition, y: crossPosition } : { x: crossPosition, y: longPosition });
  }
  const last = points[points.length - 1];
  if (!last || (longIsWidth ? last.x : last.y) < longSide - 0.001) {
    const index = points.length;
    const crossPosition = index % 2 === 0 ? (index % 4 === 0 ? 0 : shortSide) : shortSide / 2;
    points.push(longIsWidth ? { x: longSide, y: crossPosition } : { x: crossPosition, y: longSide });
  }
  return points;
}
