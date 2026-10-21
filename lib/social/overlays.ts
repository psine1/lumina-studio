import { logoStyleSchema, textStyleSchema, type Composition } from "./schema";

export type LayerBox = { x: number; y: number; width: number; height: number };
export type OverlayGeometry = { text: LayerBox | null; logo: LayerBox | null; textOverflow: boolean; layers?: { id: string; name: string; type: "text" | "image"; box: LayerBox }[] };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export function alignLayerBox(box: LayerBox, width: number, height: number, axis: "horizontal" | "vertical", alignment: "start" | "center" | "end") {
  const size = axis === "horizontal" ? width : height;
  const extent = axis === "horizontal" ? box.width : box.height;
  const position = alignment === "center" ? (size - extent) / 2 : alignment === "start" ? size * .05 : size * .95 - extent;
  const value = clamp(position, 0, Math.max(0, size - extent)) / size;
  return axis === "horizontal" ? { x: value } : { y: value };
}

export function textWidth(ctx: CanvasRenderingContext2D, value: string, spacing: number) {
  if (!spacing) return ctx.measureText(value).width;
  const characters = Array.from(value);
  return characters.reduce((sum, character) => sum + ctx.measureText(character).width, 0) + Math.max(0, characters.length - 1) * spacing;
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number, spacing: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(ctx, candidate, spacing) <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const character of Array.from(word)) {
        if (line && textWidth(ctx, line + character, spacing) > width) { lines.push(line); line = ""; }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function layoutText(ctx: CanvasRenderingContext2D, composition: Composition, width: number, height: number) {
  // Parsing also migrates projects left in React state during a development hot reload.
  const style = textStyleSchema.parse(composition.textStyle || {});
  ctx.font = `${style.italic ? "italic " : ""}${style.bold ? "700" : "400"} ${style.fontSize}px "${composition.font}"`;
  const boxWidth = Math.min(width, Math.max(style.fontSize, width * style.width));
  const lines = wrapText(ctx, composition.text, boxWidth, style.letterSpacing);
  const lineStep = style.fontSize * style.lineHeight;
  const textHeight = style.fontSize + Math.max(0, lines.length - 1) * lineStep;
  const box = { x: clamp(style.x * width, 0, width - boxWidth), y: clamp(style.y * height, 0, Math.max(0, height - textHeight)), width: boxWidth, height: Math.min(height, textHeight) };
  return { style, lines, lineStep, box, overflow: textHeight > height || lines.some((line) => textWidth(ctx, line, style.letterSpacing) > boxWidth) };
}

export function layoutLogo(composition: Composition, canvasWidth: number, canvasHeight: number, imageWidth: number, imageHeight: number): LayerBox {
  const style = logoStyleSchema.parse(composition.logoStyle || {});
  const width = canvasWidth * style.width;
  const height = width * imageHeight / Math.max(1, imageWidth);
  const scale = Math.min(1, canvasHeight * .5 / height);
  const w = width * scale, h = height * scale;
  return { x: clamp(style.x * canvasWidth, 0, canvasWidth - w), y: clamp(style.y * canvasHeight, 0, canvasHeight - h), width: w, height: h };
}

export function drawTextLayer(ctx: CanvasRenderingContext2D, composition: Composition, width: number, height: number) {
  const layout = layoutText(ctx, composition, width, height);
  const { style, lines, lineStep, box } = layout;
  ctx.save();
  ctx.globalCompositeOperation = style.blendMode;
  ctx.fillStyle = composition.textColor; ctx.textBaseline = "top"; ctx.textAlign = "left"; ctx.globalAlpha = style.opacity;
  if (style.shadow) { ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2; }
  lines.forEach((line, index) => {
    const measured = textWidth(ctx, line, style.letterSpacing);
    let x = box.x + (style.align === "center" ? (box.width - measured) / 2 : style.align === "right" ? box.width - measured : 0);
    const y = box.y + index * lineStep;
    if (!style.letterSpacing) ctx.fillText(line, x, y);
    else for (const character of Array.from(line)) { ctx.fillText(character, x, y); x += ctx.measureText(character).width + style.letterSpacing; }
  });
  ctx.restore();
  return layout;
}
