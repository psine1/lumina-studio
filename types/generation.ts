export type StudioMode = "image" | "edit" | "video" | "history";

export type GenerationStatus = "pending" | "processing" | "completed" | "failed";

export type GenerationRecord = {
  id: string;
  taskId?: string;
  type: Exclude<StudioMode, "history">;
  provider: string;
  model: string;
  modelLabel: string;
  prompt: string;
  status: GenerationStatus;
  createdAt: string;
  resultUrl?: string;
  aspectRatio?: string;
  summary: string[];
  error?: string;
};

export type ModelCapabilities = {
  textToImage?: boolean;
  imageToImage?: boolean;
  editing?: boolean;
  textToVideo?: boolean;
  imageToVideo?: boolean;
  references?: boolean;
  maxReferences?: number;
  startImage?: boolean;
  endImage?: boolean;
  audio?: boolean;
  seed?: boolean;
  duration?: boolean;
  resolution?: boolean;
  aspectRatio?: boolean;
  quantity?: boolean;
  promptEnhancement?: boolean;
};

export type AppModel = {
  id: string;
  label: string;
  type: "image" | "video" | "both";
  modes: Array<Exclude<StudioMode, "history">>;
  provider: string;
  description: string;
  endpoint: string;
  statusEndpoint: string;
  capabilities: ModelCapabilities;
  supportedAspectRatios?: string[];
  supportedDurations?: string[];
  supportedResolutions?: string[];
  badges: string[];
  metadata?: Record<string, unknown>;
};

export type MagnificTask = {
  data?: { task_id?: string; status?: string; generated?: string[] };
  message?: string;
  error?: string;
};
