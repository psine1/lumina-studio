import { getModel } from "@/lib/magnific/models";
import type { MagnificTask } from "@/types/generation";

const API_ORIGIN = "https://api.magnific.com";
type MagnificErrorShape = { message?: string; error?: string; detail?: string };

function apiKey() {
  const key = process.env.MAGNIFIC_API_KEY;
  if (!key) throw new Error("MAGNIFIC_API_KEY_MISSING");
  return key;
}

async function request(path: string, init?: RequestInit): Promise<MagnificTask> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    headers: {
      "x-magnific-api-key": apiKey(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as MagnificTask & MagnificErrorShape;
  if (!response.ok) {
    const detail = payload.message ?? payload.error ?? payload.detail ?? "Magnific rechazó la solicitud.";
    throw new Error(`MAGNIFIC_${response.status}:${detail}`);
  }
  return payload;
}

function dimensionsForRatio(ratio: string, max = 1440) {
  const dimensions: Record<string, { width: number; height: number }> = {
    "1:1": { width: 1024, height: 1024 },
    "16:9": { width: max, height: 768 },
    "9:16": { width: 768, height: max },
    "4:3": { width: 1280, height: 960 },
    "3:4": { width: 960, height: 1280 },
  };
  return dimensions[ratio] ?? dimensions["1:1"];
}

export async function generateImage(input: { model: string; prompt: string; aspectRatio?: string; resolution?: string; seed?: number; promptEnhancement?: boolean; styleReference?: string; structureReference?: string }) {
  const model = getModel(input.model);
  if (!model || !model.modes.includes("image")) throw new Error("UNSUPPORTED_MODEL");
  if (model.id === "mystic") {
    return request(model.endpoint, {
      method: "POST",
      body: JSON.stringify({
        prompt: input.prompt,
        aspect_ratio: input.aspectRatio ?? "square_1_1",
        resolution: input.resolution ?? "2k",
        engine: "automatic",
        filter_nsfw: true,
        ...(input.styleReference ? { style_reference: input.styleReference } : {}),
        ...(input.structureReference ? { structure_reference: input.structureReference } : {}),
      }),
    });
  }
  const dimensions = dimensionsForRatio(input.aspectRatio ?? "1:1", Number(input.resolution) || 1440);
  return request(model.endpoint, {
    method: "POST",
    body: JSON.stringify({
      prompt: input.prompt,
      ...dimensions,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      prompt_upsampling: Boolean(input.promptEnhancement),
      ...(input.styleReference ? { input_image: input.styleReference } : {}),
      ...(input.structureReference ? { input_image_2: input.structureReference } : {}),
    }),
  });
}

export async function editImage(input: { prompt: string; image: string; aspectRatio?: string; seed?: number; promptEnhancement?: boolean }) {
  const model = getModel("flux-2-pro");
  if (!model) throw new Error("UNSUPPORTED_MODEL");
  return request(model.endpoint, {
    method: "POST",
    body: JSON.stringify({
      prompt: input.prompt,
      input_image: input.image,
      ...dimensionsForRatio(input.aspectRatio ?? "1:1"),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      prompt_upsampling: Boolean(input.promptEnhancement),
    }),
  });
}

export async function generateVideo(input: { model: string; prompt: string; aspectRatio?: string; duration?: string; startImage?: string; endImage?: string }) {
  const model = getModel(input.model);
  if (!model || !model.modes.includes("video")) throw new Error("UNSUPPORTED_MODEL");
  if (model.id === "kling-1-6") {
    return request(model.endpoint, {
      method: "POST",
      body: JSON.stringify({ duration: input.duration ?? "5", image: input.startImage, ...(input.endImage ? { image_tail: input.endImage } : {}), prompt: input.prompt }),
    });
  }
  return request(model.endpoint, {
    method: "POST",
    body: JSON.stringify({ prompt: input.prompt, ratio: input.aspectRatio ?? "1280:720", duration: Number(input.duration ?? "5") }),
  });
}

export async function getGenerationStatus(modelId: string, taskId: string) {
  const model = getModel(modelId);
  if (!model) throw new Error("UNSUPPORTED_MODEL");
  return request(model.statusEndpoint.replace("{taskId}", encodeURIComponent(taskId)));
}

export function normalizeGenerationStatus(status?: string) {
  switch (status?.toUpperCase()) {
    case "COMPLETED":
    case "SUCCEEDED": return "completed" as const;
    case "FAILED":
    case "ERROR": return "failed" as const;
    case "CREATED":
    case "PENDING": return "pending" as const;
    default: return "processing" as const;
  }
}

export function normalizeAsset(value: string, type: "image" | "video") {
  if (/^(https?:|data:|blob:)/.test(value)) return value;
  return type === "image" ? `data:image/png;base64,${value}` : `data:video/mp4;base64,${value}`;
}
