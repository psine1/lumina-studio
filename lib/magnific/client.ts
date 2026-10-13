import { getModel } from "@/lib/magnific/models";
import type { MagnificTask } from "@/types/generation";

const API_ORIGIN = "https://api.magnific.com";
type MagnificErrorShape = { message?: string; error?: string; detail?: string };
type UploadSlot = {
  upload_url: string;
  asset_url: string;
  headers: Record<string, string>;
};
type UploadResponse = { files?: UploadSlot[]; data?: { files?: UploadSlot[] } };
type PreparedImage = { url: string; mimeType?: string };

function apiKey() {
  const key = process.env.MAGNIFIC_API_KEY;
  if (!key) throw new Error("MAGNIFIC_API_KEY_MISSING");
  return key;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    headers: {
      "x-magnific-api-key": apiKey(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T & MagnificErrorShape;
  if (!response.ok) {
    const detail = payload.message ?? payload.error ?? payload.detail ?? "Magnific rechazó la solicitud.";
    throw new Error(`MAGNIFIC_${response.status}:${detail}`);
  }
  return payload;
}

function request(path: string, init?: RequestInit) {
  return requestJson<MagnificTask>(path, init);
}

function decodeImageDataUrl(value: string) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/i.exec(value);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { mimeType: match[1].toLowerCase(), bytes: bytes.buffer };
}

async function prepareImages(values: string[]): Promise<PreparedImage[]> {
  const prepared = values.map((value) => ({ value, decoded: decodeImageDataUrl(value) }));
  const local = prepared.filter((item) => item.decoded);
  if (!local.length) return values.map((url) => ({ url }));

  const uploadPayload = await requestJson<UploadResponse>("/v1/ai/uploads/request-url", {
    method: "POST",
    body: JSON.stringify({ files: local.map((item) => ({ content_type: item.decoded!.mimeType })) }),
  });
  const slots = uploadPayload.files ?? uploadPayload.data?.files;
  if (!slots || slots.length !== local.length) throw new Error("MAGNIFIC_UPLOAD:No se pudieron preparar las imágenes para Magnific.");

  await Promise.all(slots.map(async (slot, index) => {
    const response = await fetch(slot.upload_url, {
      method: "PUT",
      headers: slot.headers,
      body: local[index].decoded!.bytes,
    });
    if (!response.ok) throw new Error(`MAGNIFIC_UPLOAD_${response.status}:No se pudo subir una imagen de referencia.`);
  }));

  let uploadIndex = 0;
  return prepared.map((item) => {
    if (!item.decoded) return { url: item.value };
    const slot = slots[uploadIndex++];
    return { url: slot.asset_url, mimeType: item.decoded.mimeType };
  });
}

function nanoReference(image: PreparedImage, index: number) {
  return {
    image: image.url,
    text: `Referencia ${index + 1}`,
    ...(image.mimeType ? { mime_type: image.mimeType } : {}),
  };
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
  const references = await prepareImages(input.referenceImages ?? []);
  if (model.id === "mystic") {
    return request(model.endpoint, {
      method: "POST",
      body: JSON.stringify({
        prompt: input.prompt,
        aspect_ratio: input.aspectRatio ?? "square_1_1",
        resolution: input.resolution ?? "2k",
        engine: "automatic",
        filter_nsfw: true,
        ...(references[0] ? { style_reference: references[0].url } : {}),
        ...(references[1] ? { structure_reference: references[1].url } : {}),
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
        ...(references.length ? { reference_images: references.map(nanoReference) } : {}),
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
  if (model.id === "flux-kontext-pro") {
    return request(model.endpoint, {
      method: "POST",
      body: JSON.stringify({
        prompt: input.prompt,
        aspect_ratio: input.aspectRatio ?? "square_1_1",
        ...(references[0] ? { input_image: references[0].url } : {}),
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
        prompt_upsampling: Boolean(input.promptEnhancement),
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
      ...(references[0] ? { input_image: references[0].url } : {}),
      ...(references[1] ? { input_image_2: references[1].url } : {}),
      ...(references[2] ? { input_image_3: references[2].url } : {}),
      ...(references[3] ? { input_image_4: references[3].url } : {}),
    }),
  });
}

export async function editImage(input: { model: string; prompt: string; image: string; aspectRatio?: string; resolution?: string; seed?: number; promptEnhancement?: boolean }) {
  const model = getModel(input.model);
  if (!model || !model.modes.includes("edit")) throw new Error("UNSUPPORTED_MODEL");
  const [image] = await prepareImages([input.image]);
  if (model.id === "nano-banana-pro" || model.id === "nano-banana-pro-flash") {
    return request(model.endpoint, {
      method: "POST",
      body: JSON.stringify({
        prompt: input.prompt,
        reference_images: [nanoReference(image, 0)],
        aspect_ratio: input.aspectRatio ?? "auto",
        resolution: input.resolution ?? (model.id === "nano-banana-pro" ? "2K" : "1K"),
        ...(model.id === "nano-banana-pro-flash" ? { use_google_search_tool: false } : {}),
      }),
    });
  }
  if (model.id === "flux-kontext-pro") {
    return request(model.endpoint, {
      method: "POST",
      body: JSON.stringify({
        prompt: input.prompt,
        input_image: image.url,
        aspect_ratio: input.aspectRatio ?? "square_1_1",
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
        prompt_upsampling: Boolean(input.promptEnhancement),
      }),
    });
  }
  return request(model.endpoint, {
    method: "POST",
    body: JSON.stringify({
      prompt: input.prompt,
      input_image: image.url,
      ...dimensionsForRatio(input.aspectRatio ?? "1:1", Number(input.resolution) || 1024),
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
