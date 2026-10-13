import type { AppModel } from "@/types/generation";

export const APP_MODELS: AppModel[] = [
  {
    id: "mystic",
    label: "Mystic",
    type: "image",
    modes: ["image"],
    provider: "Magnific",
    description: "Flujo exclusivo de alta fidelidad con referencias de estilo y estructura.",
    endpoint: "/v1/ai/mystic",
    statusEndpoint: "/v1/ai/mystic/{taskId}",
    capabilities: { textToImage: true, references: true, maxReferences: 2, resolution: true, aspectRatio: true },
    supportedAspectRatios: ["square_1_1", "widescreen_16_9", "social_story_9_16", "traditional_3_4", "classic_4_3"],
    supportedResolutions: ["1k", "2k", "4k"],
    badges: ["Refs", "4K", "Fotorreal"],
    metadata: { docs: "https://docs.magnific.com/api-reference/mystic/post-mystic" },
  },
  {
    id: "flux-2-pro",
    label: "FLUX.2 Pro",
    type: "both",
    modes: ["image", "edit"],
    provider: "Black Forest Labs",
    description: "Generación profesional y edición guiada con hasta cuatro imágenes de entrada.",
    endpoint: "/v1/ai/text-to-image/flux-2-pro",
    statusEndpoint: "/v1/ai/text-to-image/flux-2-pro/{taskId}",
    capabilities: { textToImage: true, imageToImage: true, editing: true, references: true, maxReferences: 4, seed: true, resolution: true, aspectRatio: true, promptEnhancement: true },
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    supportedResolutions: ["1024", "1440"],
    badges: ["Refs ×4", "Edit", "Pro"],
    metadata: { docs: "https://docs.magnific.com/api-reference/text-to-image/post-flux-2-pro" },
  },
  {
    id: "runway-4-5",
    label: "Runway Gen 4.5",
    type: "video",
    modes: ["video"],
    provider: "Runway",
    description: "Texto a video con cinco formatos y duraciones de 5, 8 o 10 segundos.",
    endpoint: "/v1/ai/text-to-video/runway-4-5",
    statusEndpoint: "/v1/ai/text-to-video/runway-4-5/{taskId}",
    capabilities: { textToVideo: true, duration: true, aspectRatio: true },
    supportedAspectRatios: ["1280:720", "720:1280", "1104:832", "960:960", "832:1104"],
    supportedDurations: ["5", "8", "10"],
    badges: ["T2V", "10s", "Cinético"],
    metadata: { docs: "https://docs.magnific.com/api-reference/video/runway-gen-4-5/generate-t2v" },
  },
  {
    id: "kling-1-6",
    label: "Kling 1.6 Standard",
    type: "video",
    modes: ["video"],
    provider: "Kuaishou",
    description: "Imagen a video con control de fotograma inicial y final.",
    endpoint: "/v1/ai/image-to-video/kling-std",
    statusEndpoint: "/v1/ai/image-to-video/kling-std/{taskId}",
    capabilities: { imageToVideo: true, startImage: true, endImage: true, duration: true },
    supportedDurations: ["5", "10"],
    badges: ["Start / End", "I2V", "10s"],
    metadata: { docs: "https://docs.magnific.com/api-reference/image-to-video/kling-std/post-kling-std" },
  },
];

export function getModel(modelId: string) {
  return APP_MODELS.find((model) => model.id === modelId);
}

export function publicModels() {
  return APP_MODELS.map(({ endpoint: _endpoint, statusEndpoint: _statusEndpoint, ...model }) => model);
}
