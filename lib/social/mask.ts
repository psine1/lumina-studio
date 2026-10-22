export function foregroundConfidence(masks: Float32Array[], labels: string[]): Float32Array {
  if (!masks.length) throw new Error("El detector no devolvió una máscara.");
  // Binary selfie models can expose only one foreground confidence map.
  if (masks.length === 1) return Float32Array.from(masks[0]);
  const background = labels.findIndex((label) => /^(background|fondo)$/i.test(label.trim()));
  if (background < 0 || !masks[background]) throw new Error("No se pudo identificar la clase de fondo.");
  return Float32Array.from(masks[background], (value) => Math.max(0, Math.min(1, 1 - value)));
}

export function confidenceAlpha(values: Float32Array, threshold = .45, softness = .2) {
  const low = threshold - softness / 2;
  return Uint8ClampedArray.from(values, (value) => {
    const t = Math.max(0, Math.min(1, (value - low) / Math.max(.001, softness)));
    return Math.round(t * t * (3 - 2 * t) * 255);
  });
}

export function refineMaskAlpha(alpha: Uint8ClampedArray, width: number, height: number, shift: number, feather: number) {
  const radius = Math.abs(Math.round(shift));
  let output = Uint8ClampedArray.from(alpha);
  // Separable grayscale dilation/erosion preserves partially transparent edges.
  if (radius) {
    for (const horizontal of [true, false]) {
      const next = new Uint8ClampedArray(output.length);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        let value = shift > 0 ? 0 : 255;
        for (let d = -radius; d <= radius; d++) {
          const xx = x + (horizontal ? d : 0), yy = y + (horizontal ? 0 : d);
          const sample = xx < 0 || yy < 0 || xx >= width || yy >= height ? 0 : output[yy * width + xx];
          value = shift > 0 ? Math.max(value, sample) : Math.min(value, sample);
        }
        next[y * width + x] = value;
      }
      output = next;
    }
  }
  const blur = Math.max(0, Math.round(feather));
  if (blur) for (const horizontal of [true, false]) {
    const next = new Uint8ClampedArray(output.length), length = horizontal ? width : height, lines = horizontal ? height : width;
    for (let line = 0; line < lines; line++) {
      const index = (offset: number) => horizontal ? line * width + offset : offset * width + line;
      let sum = 0;
      for (let i = 0; i <= Math.min(blur, length - 1); i++) sum += output[index(i)];
      for (let i = 0; i < length; i++) {
        next[index(i)] = Math.round(sum / (blur * 2 + 1));
        if (i - blur >= 0) sum -= output[index(i - blur)];
        if (i + blur + 1 < length) sum += output[index(i + blur + 1)];
      }
    }
    output = next;
  }
  return output;
}
