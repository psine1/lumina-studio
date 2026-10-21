import { logoStyleSchema, textStyleSchema, type Brand, type Composition, type OverlayLayer } from "./schema";

// Undefined means a legacy project. An explicit empty array means all overlays were removed.
export function compositionLayers(composition: Composition, brand: Brand): OverlayLayer[] {
  if (composition.layers) return composition.layers;
  const layers: OverlayLayer[] = [];
  if (composition.text) layers.push({ id: "legacy-text", name: "Texto", type: "text", visible: true, text: composition.text, color: composition.textColor, font: composition.font, style: textStyleSchema.parse(composition.textStyle || {}) });
  if (brand.logo) layers.push({ id: "legacy-logo", name: "Logo", type: "image", visible: composition.logoVisible, src: brand.logo, style: logoStyleSchema.parse(composition.logoStyle || {}) });
  return layers;
}

export function layerComposition(composition: Composition, layer: OverlayLayer): Composition {
  return { ...composition, layers: undefined, text: layer.type === "text" ? layer.text : "", textColor: layer.type === "text" ? layer.color : composition.textColor, font: layer.type === "text" ? layer.font : composition.font, textStyle: layer.type === "text" ? layer.style : composition.textStyle, logoVisible: layer.type === "image" && layer.visible, logoStyle: layer.type === "image" ? layer.style : composition.logoStyle };
}

export function patchCompositionLayer(composition: Composition, brand: Brand, id: string, patch: Partial<Composition>): Partial<Composition> {
  const { text, textColor, font, textStyle, logoStyle, logoVisible, layers: _layers, ...common } = patch;
  void _layers;
  return { ...common, layers: compositionLayers(composition, brand).map((layer) => layer.id !== id ? layer : layer.type === "text" ? { ...layer, ...(text !== undefined ? { text } : {}), ...(textColor !== undefined ? { color: textColor } : {}), ...(font !== undefined ? { font } : {}), ...(textStyle ? { style: textStyle } : {}) } : { ...layer, ...(logoStyle ? { style: logoStyle } : {}), ...(logoVisible !== undefined ? { visible: logoVisible } : {}) }) };
}

export function reorderLayer(layers: OverlayLayer[], id: string, direction: "up" | "down") {
  const index = layers.findIndex((layer) => layer.id === id), next = index + (direction === "up" ? 1 : -1);
  if (index < 0 || next < 0 || next >= layers.length) return layers;
  const result = [...layers]; [result[index], result[next]] = [result[next], result[index]];
  return result;
}
