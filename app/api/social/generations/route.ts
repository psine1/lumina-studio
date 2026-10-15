import { NextResponse } from "next/server";
import { z } from "zod";
import { editImage } from "@/lib/magnific/client";
import { getProduct, ShopifyError } from "@/lib/shopify/client";
import { SOCIAL_IMAGE_MODEL, socialAspectRatio, socialGenerationSchema, socialImagePrompt } from "@/lib/social/generation";

// Coalesce repeated clicks/network retries with the same request ID. Never retry a paid POST.
const submissions = new Map<string, { signature: string; expires: number; task: Promise<{ taskId: string; model: typeof SOCIAL_IMAGE_MODEL }> }>();
export async function POST(request: Request) {
  try {
    const input = socialGenerationSchema.parse(await request.json());
    const signature = JSON.stringify(input);
    const previous = submissions.get(input.requestId);
    if (previous && previous.expires > Date.now()) {
      if (previous.signature !== signature) return NextResponse.json({ error: "Este identificador ya pertenece a otra generación." }, { status: 409 });
      return NextResponse.json(await previous.task, { headers: { "Cache-Control": "no-store" } });
    }
    for (const [key, value] of submissions) if (value.expires <= Date.now()) submissions.delete(key);
    if (submissions.size >= 100) return NextResponse.json({ error: "Demasiadas tareas recientes. Esperá antes de generar otra imagen." }, { status: 429 });
    const task = (async () => {
      const product = await getProduct(input.productId);
      if (!product.images.nodes.some((image) => image.url === input.imageUrl)) throw new ShopifyError("Elegí una fotografía original de este producto.", 400);
      const result = await editImage({ model: SOCIAL_IMAGE_MODEL, image: input.imageUrl, prompt: socialImagePrompt(input, product), aspectRatio: socialAspectRatio(input.format), resolution: "1K" });
      const id = z.string().min(1).parse(result.data?.task_id);
      return { taskId: id, model: SOCIAL_IMAGE_MODEL };
    })();
    submissions.set(input.requestId, { signature, task, expires: Date.now() + 60 * 60_000 });
    return NextResponse.json(await task, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ShopifyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Revisá la imagen, el producto y las instrucciones." }, { status: 400 });
    const missing = error instanceof Error && error.message === "MAGNIFIC_API_KEY_MISSING";
    console.error("Social Magnific generation failed:", error instanceof Error ? error.message : "Unknown provider error");
    if (error instanceof Error && error.message.startsWith("MAGNIFIC_400:")) return NextResponse.json({ error: `Magnific rechazó los parámetros: ${error.message.slice("MAGNIFIC_400:".length)}. No se creó una tarea.` }, { status: 400 });
    return NextResponse.json({ error: missing ? "Falta MAGNIFIC_API_KEY en el servidor." : "No se pudo iniciar la edición con Magnific. No se reintentó automáticamente; revisá las tareas del proveedor antes de generar otra vez." }, { status: missing ? 503 : 502 });
  }
}
