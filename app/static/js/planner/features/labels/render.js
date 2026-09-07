/** Konva layout primitive shared by free and attached labels. */

export function updateLabelNodeLayout(node) {
  if (!node || !node.findOne || !node.getAttr) return;
  const textNode = node.findOne('.labelText');
  const hitNode = node.findOne('.labelHitArea');
  if (!textNode || !hitNode) return;
  const borderNode = node.findOne('.labelBorder');
  const padding = Number(node.getAttr('padding')) || 4;
  const textWidth = textNode.width();
  const textHeight = textNode.height();
  hitNode.width(textWidth + (padding * 2));
  hitNode.height(textHeight + (padding * 2));
  if (borderNode) borderNode.size({ width: hitNode.width(), height: hitNode.height() });
  textNode.position({ x: padding, y: padding });
  node.offset({ x: hitNode.width() / 2, y: hitNode.height() / 2 });
}
