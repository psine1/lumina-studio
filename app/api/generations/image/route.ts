import { NextResponse } from "next/server";
import { z } from "zod";
import { generateImage } from "@/lib/magnific/client";

const schema = z.object({
  model: z.enum(["mystic", "nano-banana-pro", "nano-banana-pro-flash", "flux-kontext-pro", "flux-2-pro", "flux-2-turbo", "seedream-4-5"]),
  prompt: z.string().trim().min(3).max(5000),
  aspectRatio: z.string().optional(),
  resolution: z.string().optional(),
  seed: z.number().int().min(0).max(4294967295).optional(),
  promptEnhancement: z.boolean().optional(),
  referenceImages: z.array(z.string().max(15_000_000)).max(14).optional(),
});

export async function POST(request: Request) {
  try {
    return NextResponse.json(await generateImage(schema.parse(await request.json())));
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Revisa los campos de la generación." }, { status: 400 });
    const message = error instanceof Error ? error.message : "No se pudo crear la generación.";
    const status = message === "MAGNIFIC_API_KEY_MISSING" ? 503 : message.includes("429") ? 429 : 502;
    const friendly = message === "MAGNIFIC_API_KEY_MISSING" ? "Falta configurar MAGNIFIC_API_KEY en el servidor." : message.split(":").slice(1).join(":") || message;
    return NextResponse.json({ error: friendly }, { status });
  }
}
