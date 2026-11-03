import { type Project } from "./schema";
import { compositionBlob } from "./composition";

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
// ZIP STORE: PNG files are already compressed. UTF-8 filenames and CRC protect interoperability.
export async function zipImages(files: { name: string; blob: Blob }[]) {
  const chunks: BlobPart[] = [], central: BlobPart[] = []; let offset = 0, centralSize = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name), bytes = new Uint8Array(await file.blob.arrayBuffer()), crc = crc32(bytes);
    const local = new Uint8Array(30 + name.length), l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true); l.setUint16(12, 33, true); l.setUint32(14, crc, true); l.setUint32(18, bytes.length, true); l.setUint32(22, bytes.length, true); l.setUint16(26, name.length, true); local.set(name, 30);
    const entry = new Uint8Array(46 + name.length), c = new DataView(entry.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(14, 33, true); c.setUint32(16, crc, true); c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true); entry.set(name, 46);
    chunks.push(local, bytes); central.push(entry); offset += local.length + bytes.length; centralSize += entry.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: "application/zip" });
}
export async function exportSession(projects: Project[], zip: boolean) {
  if (!projects.length || projects.some(p => !p.composition.generatedImage || !p.composition.aiReviewed || p.generation?.status === "pending")) throw new Error("Generá y aprobá todas las imágenes antes de cerrar el batch.");
  const files = [];
  for (const [index, p] of projects.entries()) files.push({ name: `${String(index + 1).padStart(2, "0")}-${p.product.title.replace(/[^\p{L}\p{N}-]+/gu, "-")}.png`, blob: await compositionBlob(p.composition, p.brand, "png") });
  if (zip) downloadBlob(await zipImages(files), "sesion-social.zip");
  else for (const file of files) downloadBlob(file.blob, file.name);
}
