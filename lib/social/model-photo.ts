/** Decode before saving, normalize phone photos and keep identity references lightweight. */
export async function prepareModelPhoto(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Usá una foto JPG, PNG o WebP.");
  if (!file.size || file.size > 12_000_000) throw new Error("La foto debe pesar hasta 12 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => { throw new Error("No pudimos abrir esa imagen. Probá con otra foto JPG, PNG o WebP."); });
    if (Math.min(image.naturalWidth, image.naturalHeight) < 128) throw new Error("La foto es muy pequeña. Subí una donde el rostro o el cuerpo se vean con claridad (mínimo 128 px por lado).");
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la foto en este navegador.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [.9, .8, .7, .6]) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.length <= 1_200_000) return data;
    }
    throw new Error("No se pudo reducir la foto. Probá recortarla para que se vea solo la modelo.");
  } finally { URL.revokeObjectURL(url); }
}
