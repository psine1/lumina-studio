import { NextResponse } from "next/server";
import { z } from "zod";
import { editImage } from "@/lib/magnific/client";

const schema = z.object({
  prompt: z.string().trim().min(3).max(5000),
  image: z.string().min(20).max(15_000_000),
  aspectRatio: z.string().optional(),
  seed: z.number().int().min(0).max(4294967295).optional(),
  promptEnhancement: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    return NextResponse.json(await editImage(schema.parse(await request.json())));
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Añade una imagen válida y describe el cambio." }, { status: 400 });
    const message = error instanceof Error ? error.message : "No se pudo editar la imagen.";
    const status = message === "MAGNIFIC_API_KEY_MISSING" ? 503 : message.includes("429") ? 429 : 502;
    return NextResponse.json({ error: message === "MAGNIFIC_API_KEY_MISSING" ? "Falta configurar MAGNIFIC_API_KEY en el servidor." : message.split(":").slice(1).join(":") || message }, { status });
  }
}
