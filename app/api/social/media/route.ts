import { NextResponse } from "next/server";

// Same-origin image reads keep downloads exportable without exposing Shopify credentials.
export async function GET(request: Request) {
  try {
    const value = new URL(request.url).searchParams.get("url");
    if (!value || value.length > 2500) return NextResponse.json({ error: "Imagen inválida." }, { status: 400 });
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "cdn.shopify.com" || url.port || url.username || url.password || !url.pathname.startsWith("/s/files/")) return NextResponse.json({ error: "Solo se permiten imágenes del catálogo Shopify." }, { status: 400 });
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error("Media unavailable");
    const contentType = response.headers.get("content-type")?.split(";")[0];
    if (!contentType || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(contentType)) throw new Error("Invalid media type");
    if (Number(response.headers.get("content-length")) > 15_000_000) throw new Error("Image too large");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty media");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value: chunk, done } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > 15_000_000) { await reader.cancel(); throw new Error("Image too large"); }
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new Response(bytes, { headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "No se pudo cargar la imagen original." }, { status: 502 }); }
}
