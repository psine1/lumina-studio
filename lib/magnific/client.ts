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
  const ratios: Record<string, [number, number]> = {
    "1:1": [1, 1],
    "16:9": [16, 9],
    "9:16": [9, 16],
    "4:3": [4, 3],
    "3:4": [3, 4],
  };
  const [widthRatio, heightRatio] = ratios[ratio] ?? ratios["1:1"];
  const longSide = Math.max(256, max);
  if (widthRatio >= heightRatio) return { width: longSide, height: Math.round(longSide * heightRatio / widthRatio) };
  return { width: Math.round(longSide * widthRatio / heightRatio), height: longSide };
}

export async function generateImage(input: { model: string; prompt: string; aspectRatio?: string; resolution?: string; seed?: number; promptEnhancement?: boolean; referenceImages?: string[] }) {
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
        ...(input.referenceImages?.[0] ? { style_reference: input.referenceImages[0] } : {}),
        ...(input.referenceImages?.[1] ? { structure_reference: input.referenceImages[1] } : {}),
      }),
    });
  }
  if (model.id === "nano-banana-pro" || model.id === "nano-banana-pro-flash") {
    return request(model.endpoint, {
      method: "POST",
      body: JSON.stringify({
        prompt: input.prompt,
        aspect_ratio: input.aspectRatio ?? "1:1",
        resolution: input.resolution ?? (model.id === "nano-banana-pro" ? "2K" : "1K"),
        ...(model.id === "nano-banana-pro-flash" ? { use_google_search_tool: false } : {}),
      }),
    });
  }
  if (model.id === "seedream-4-5") {
    return request(model.endpoint, {
      method: "POST",
      body: JSON.stringify({
        prompt: input.prompt,
        aspect_ratio: input.aspectRatio ?? "square_1_1",
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
        enable_safety_checker: true,
      }),
    });
  }
  const dimensions = dimensionsForRatio(input.aspectRatio ?? "1:1", Number(input.resolution) || 1440);
  if (model.id === "flux-2-turbo") {
    return request(model.endpoint, {
      method: "POST",
      body: JSON.stringify({
        prompt: input.prompt,
        image_size: dimensions,
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
        enable_safety_checker: true,
        output_format: "png",
      }),
    });
  }
  return request(model.endpoint, {
    method: "POST",
    body: JSON.stringify({
      prompt: input.prompt,
      ...dimensions,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      prompt_upsampling: Boolean(input.promptEnhancement),
      ...(input.referenceImages?.[0] ? { input_image: input.referenceImages[0] } : {}),
      ...(input.referenceImages?.[1] ? { input_image_2: input.referenceImages[1] } : {}),
      ...(input.referenceImages?.[2] ? { input_image_3: input.referenceImages[2] } : {}),
      ...(input.referenceImages?.[3] ? { input_image_4: input.referenceImages[3] } : {}),
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
      ...dimensionsForRatio(input.aspectRatio ?? "1:1", 1024),
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
  if (model.id === "kling-2-6-pro") {
    return request(model.endpoint, {
      method: "POST",
      body: JSON.stringify({ prompt: input.prompt, duration: input.duration ?? "5", aspect_ratio: input.aspectRatio ?? "widescreen_16_9", generate_audio: true }),
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
