import { NextResponse } from "next/server";
import { getGenerationStatus, normalizeAsset, normalizeGenerationStatus } from "@/lib/magnific/client";
import { getModel } from "@/lib/magnific/models";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const modelId = new URL(request.url).searchParams.get("model") ?? "";
  const model = getModel(modelId);
  if (!model) return NextResponse.json({ error: "Modelo no soportado." }, { status: 400 });
  try {
    const task = await getGenerationStatus(modelId, id);
    const mediaType = model.type === "video" ? "video" : "image";
    return NextResponse.json({ id, status: normalizeGenerationStatus(task.data?.status), generated: (task.data?.generated ?? []).map((asset) => normalizeAsset(asset, mediaType)), providerStatus: task.data?.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo consultar el estado.";
    const status = message === "MAGNIFIC_API_KEY_MISSING" ? 503 : message.includes("429") ? 429 : 502;
    return NextResponse.json({ error: message === "MAGNIFIC_API_KEY_MISSING" ? "Falta configurar MAGNIFIC_API_KEY en el servidor." : message.split(":").slice(1).join(":") || message }, { status });
  }
}
