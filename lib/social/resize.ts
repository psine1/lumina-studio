import type { OverlayLayer } from "./schema";
import type { LayerBox } from "./overlays";

export type ResizeCorner = "nw" | "ne" | "sw" | "se";

export function scaleLayerFromCorner(layer: OverlayLayer, box: LayerBox, corner: ResizeCorner, dx: number, dy: number, canvasWidth: number, canvasHeight: number): OverlayLayer {
  if (box.width <= 0 || box.height <= 0) return layer;
  const right = corner.endsWith("e"), bottom = corner.startsWith("s");
  const sx = right ? 1 : -1, sy = bottom ? 1 : -1;
  const anchorX = right ? box.x : box.x + box.width;
  const anchorY = bottom ? box.y : box.y + box.height;
  const requested = 1 + (sx * dx * box.width + sy * dy * box.height) / (box.width ** 2 + box.height ** 2);
  const availableWidth = right ? canvasWidth - anchorX : anchorX;
  const availableHeight = bottom ? canvasHeight - anchorY : anchorY;
  let min = (layer.type === "text" ? .1 : .03) * canvasWidth / box.width;
  let max = Math.min(availableWidth / box.width, availableHeight / box.height, (layer.type === "text" ? 1 : .7) * canvasWidth / box.width);
  if (layer.type === "text") {
    min = Math.max(min, 12 / layer.style.fontSize);
    max = Math.min(max, 180 / layer.style.fontSize);
    if (layer.style.letterSpacing !== 0) max = Math.min(max, (layer.style.letterSpacing > 0 ? 20 : 2) / Math.abs(layer.style.letterSpacing));
  } else max = Math.min(max, canvasHeight * .5 / box.height);
  if (min > max) return layer;
  const scale = Math.max(min, Math.min(max, requested));
  const width = box.width * scale, height = box.height * scale;
  const position = { x: Math.max(0, Math.min(1, (right ? anchorX : anchorX - width) / canvasWidth)), y: Math.max(0, Math.min(1, (bottom ? anchorY : anchorY - height) / canvasHeight)), width: Math.max(layer.type === "text" ? .1 : .03, Math.min(layer.type === "text" ? 1 : .7, width / canvasWidth)) };
  return layer.type === "text" ? { ...layer, style: { ...layer.style, ...position, fontSize: Math.max(12, Math.min(180, layer.style.fontSize * scale)), letterSpacing: Math.max(-2, Math.min(20, layer.style.letterSpacing * scale)) } } : { ...layer, style: { ...layer.style, ...position } };
}
