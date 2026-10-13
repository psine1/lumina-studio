import { NextResponse } from "next/server";
import { z } from "zod";
import { generateVideo } from "@/lib/magnific/client";

const schema = z.object({
  model: z.enum(["runway-4-5", "kling-2-6-pro", "kling-1-6"]),
  prompt: z.string().trim().min(3).max(2500),
  aspectRatio: z.string().optional(),
  duration: z.string().optional(),
  startImage: z.string().max(15_000_000).optional(),
  endImage: z.string().max(15_000_000).optional(),
}).superRefine((value, context) => {
  if (value.model === "kling-1-6" && !value.startImage) context.addIssue({ code: z.ZodIssueCode.custom, path: ["startImage"], message: "Kling necesita una imagen inicial." });
});

export async function POST(request: Request) {
  try {
    return NextResponse.json(await generateVideo(schema.parse(await request.json())));
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Revisa los campos del video." }, { status: 400 });
    const message = error instanceof Error ? error.message : "No se pudo crear el video.";
    const status = message === "MAGNIFIC_API_KEY_MISSING" ? 503 : message.includes("429") ? 429 : 502;
    return NextResponse.json({ error: message === "MAGNIFIC_API_KEY_MISSING" ? "Falta configurar MAGNIFIC_API_KEY en el servidor." : message.split(":").slice(1).join(":") || message }, { status });
  }
}
