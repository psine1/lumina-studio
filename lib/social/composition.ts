import { formats, type Brand, type Composition } from "./schema";
import { drawTextLayer, layoutLogo, type OverlayGeometry } from "./overlays";

export function mediaUrl(url: string) { return `/api/social/media?url=${encodeURIComponent(url)}`; }

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string) {
  const cached = imageCache.get(url);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => { imageCache.delete(url); reject(new Error("No se pudo cargar una imagen de la composición.")); };
    image.src = url;
  });
  if (imageCache.size > 40) imageCache.delete(imageCache.keys().next().value!);
  imageCache.set(url, promise);
  return promise;
}

function contain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}

export function imagePlacement(imageWidth: number, imageHeight: number, width: number, height: number, fit: "cover" | "contain") {
  const scale = fit === "cover" ? Math.max(width / imageWidth, height / imageHeight) : Math.min(width / imageWidth, height / imageHeight);
  const w = imageWidth * scale, h = imageHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

export async function renderComposition(canvas: HTMLCanvasElement, composition: Composition, brand: Brand, cancelled = () => false) {
  const [product, background, logo] = await Promise.all([
    loadImage(composition.generatedImage || mediaUrl(composition.productImage)),
    composition.backgroundImage ? loadImage(composition.backgroundImage) : null,
    composition.logoVisible && brand.logo ? loadImage(brand.logo) : null,
  ]);
  if (cancelled()) return;
  const { width, height } = formats[composition.format];
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no permite exportar el lienzo.");
  ctx.fillStyle = composition.background; ctx.fillRect(0, 0, width, height);
  if (background) {
    const ratio = Math.max(width / background.naturalWidth, height / background.naturalHeight);
    ctx.drawImage(background, (width - background.naturalWidth * ratio) / 2, (height - background.naturalHeight * ratio) / 2, background.naturalWidth * ratio, background.naturalHeight * ratio);
  }
  const frame = composition.layout === "editorial" ? { x: .08, y: .07, w: .70, h: .77 } : composition.layout === "detail" ? { x: .06, y: .06, w: .88, h: .70 } : { x: .19, y: .15, w: .62, h: .60 };
  const boxW = width * frame.w * composition.imageScale, boxH = height * frame.h * composition.imageScale;
  if (composition.generatedImage) {
    const placement = imagePlacement(product.naturalWidth, product.naturalHeight, width, height, composition.imageFit || "cover");
    ctx.drawImage(product, placement.x, placement.y, placement.width, placement.height);
  }
  else contain(ctx, product, width * (frame.x + frame.w / 2) - boxW / 2, height * (frame.y + frame.h / 2) - boxH / 2, boxW, boxH);
  const text = drawTextLayer(ctx, composition, width, height);
  const logoBox = logo ? layoutLogo(composition, width, height, logo.naturalWidth, logo.naturalHeight) : null;
  if (logo && logoBox) {
    ctx.save(); ctx.globalAlpha = composition.logoStyle?.opacity ?? 1;
    ctx.drawImage(logo, logoBox.x, logoBox.y, logoBox.width, logoBox.height); ctx.restore();
  }
  return { text: composition.text ? text.box : null, logo: logoBox, textOverflow: Boolean(composition.text) && text.overflow } satisfies OverlayGeometry;
}

export async function downloadComposition(composition: Composition, brand: Brand, name: string, kind: "png" | "jpeg") {
  const canvas = document.createElement("canvas");
  const geometry = await renderComposition(canvas, composition, brand);
  if (geometry?.textOverflow) throw new Error("El texto excede el lienzo. Reducí el tamaño o aumentá el ancho del bloque antes de descargar.");
  const blob = await new Promise<Blob>((resolve, reject) => {
    try { canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo exportar la imagen.")), `image/${kind}`, .95); }
    catch { reject(new Error("El fondo externo no permite exportación. Quitalo o cargá un fondo desde tu equipo.")); }
  });
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = `${name.replace(/[^\p{L}\p{N}-]+/gu, "-")}.${kind === "jpeg" ? "jpg" : kind}`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
