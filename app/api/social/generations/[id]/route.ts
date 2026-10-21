import { NextResponse } from "next/server";
import { getGenerationStatus, normalizeAsset, normalizeGenerationStatus } from "@/lib/magnific/client";
import { SOCIAL_IMAGE_MODEL } from "@/lib/social/generation";
import { socialModelSchema } from "@/lib/social/schema";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[a-zA-Z0-9_-]{1,150}$/.test(id)) return NextResponse.json({ error: "Tarea inválida." }, { status: 400 });
    const model = socialModelSchema.safeParse(new URL(request.url).searchParams.get("model") || SOCIAL_IMAGE_MODEL);
    if (!model.success) return NextResponse.json({ error: "Modelo no válido." }, { status: 400 });
    const task = await getGenerationStatus(model.data, id);
    const status = normalizeGenerationStatus(task.data?.status);
    const asset = task.data?.generated?.[0];
    if (new URL(request.url).searchParams.get("asset") !== "1") return NextResponse.json({ status, hasImage: Boolean(asset) }, { headers: { "Cache-Control": "no-store" } });
    if (status !== "completed" || !asset) return NextResponse.json({ error: "La imagen todavía no está disponible." }, { status: 409 });
    const normalized = normalizeAsset(asset, "image");
    let response: Response;
    if (/^data:image\/(png|jpeg|webp);base64,/.test(normalized)) response = await fetch(normalized);
    else {
      // URL comes from the authenticated provider response, never from a browser parameter.
      const url = new URL(normalized);
      const allowed = ["freepik.com", "magnific.com", "fal.media", "magnific.ai", "storage.googleapis.com", "cdn-magnific.com"];
      if (url.protocol !== "https:" || url.port || url.username || url.password || !allowed.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new Error("Unsupported provider asset host");
      response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(25_000) });
    }
    if (!response.ok) throw new Error("Provider image unavailable");
    const type = response.headers.get("content-type")?.split(";")[0];
    if (!type || !["image/png", "image/jpeg", "image/webp"].includes(type)) throw new Error("Unsupported provider image");
    const reader = response.body?.getReader(); if (!reader) throw new Error("Empty image");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 10_000_000) { await reader.cancel(); throw new Error("Image too large"); } chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "No se pudo recuperar el resultado de Magnific. Conservá el ID de tarea y volvé a consultar; no hace falta pagar otra generación." }, { status: 502 });
  }
}
