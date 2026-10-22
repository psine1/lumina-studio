import type { LayerBox } from "./overlays";

export function snapLayer(box: LayerBox, x: number, y: number, width: number, height: number, others: LayerBox[], threshold: number) {
  const targetsX = [0, width * .05, width / 2, width * .95, width];
  const targetsY = [0, height * .05, height / 2, height * .95, height];
  others.forEach((other) => { targetsX.push(other.x, other.x + other.width / 2, other.x + other.width); targetsY.push(other.y, other.y + other.height / 2, other.y + other.height); });
  function axis(position: number, extent: number, size: number, targets: number[]) {
    let best = threshold, result = Math.max(0, Math.min(size - extent, position)), guide: number | null = null;
    for (const target of targets) for (const edge of [0, extent / 2, extent]) {
      const candidate = target - edge, distance = Math.abs(candidate - position);
      if (candidate >= 0 && candidate + extent <= size && distance < best) { best = distance; result = candidate; guide = target; }
    }
    return { position: result, guide };
  }
  const horizontal = axis(x, box.width, width, targetsX), vertical = axis(y, box.height, height, targetsY);
  return { x: horizontal.position, y: vertical.position, guideX: horizontal.guide, guideY: vertical.guide };
}
