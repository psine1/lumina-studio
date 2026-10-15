import { z } from "zod";

const shopifyMedia = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "cdn.shopify.com" && !url.port && !url.username && !url.password && url.pathname.startsWith("/s/files/");
}, "La referencia debe ser una imagen original del CDN de Shopify.");
const localImage = z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);

export const shopifyImageSchema = z.object({
  id: z.string(), url: shopifyMedia, altText: z.string().nullable(),
  width: z.number().nullable(), height: z.number().nullable(),
});
export const productSchema = z.object({
  id: z.string(), title: z.string(), description: z.string(), productType: z.string(),
  status: z.string(), tags: z.array(z.string()), vendor: z.string(), handle: z.string(),
  images: z.object({ nodes: z.array(shopifyImageSchema), pageInfo: z.object({ hasNextPage: z.boolean() }) }),
  collections: z.object({ nodes: z.array(z.object({ id: z.string(), title: z.string() })), pageInfo: z.object({ hasNextPage: z.boolean() }) }),
  variants: z.object({ nodes: z.array(z.object({ id: z.string(), title: z.string(), price: z.string(), selectedOptions: z.array(z.object({ name: z.string(), value: z.string() })) })), pageInfo: z.object({ hasNextPage: z.boolean() }) }),
});
export type Product = z.infer<typeof productSchema>;
export const brandSchema = z.object({
  id: z.string().min(1), name: z.string().min(1).max(100), description: z.string().max(3000),
  colors: z.array(z.string().regex(/^#[a-fA-F0-9]{6}$/)).min(1).max(8),
  typography: z.enum(["Arial", "Georgia", "Times New Roman"]), tone: z.string().max(3000),
  direction: z.string().max(5000), prohibited: z.string().max(3000), instructions: z.string().max(8000),
  logo: localImage.max(2_000_000).nullable(), references: z.array(localImage.max(2_000_000)).max(6),
  shopifyConnection: z.string(),
});
export type Brand = z.infer<typeof brandSchema>;
export const formats = { square: { label: "Cuadrado · 1080 × 1080", width: 1080, height: 1080 }, portrait: { label: "Retrato · 1080 × 1350", width: 1080, height: 1350 }, story: { label: "Stories · 1080 × 1920", width: 1080, height: 1920 } } as const;
export const conceptSchema = z.object({
  name: z.string().min(1).max(120), rationale: z.string().max(1200), visualDirection: z.string().max(2000),
  composition: z.string().max(1200), caption: z.object({ es: z.string().max(2200), en: z.string().max(2200) }),
  onImageText: z.string().max(160).nullable(), layout: z.enum(["editorial", "detail", "minimal"]),
  requiresImageGeneration: z.boolean(), imagePrompt: z.string().max(4000).nullable(),
});
export type Concept = z.infer<typeof conceptSchema>;
export const textStyleSchema = z.object({
  x: z.number().min(0).max(1).default(.09), y: z.number().min(0).max(1).default(.865),
  width: z.number().min(.1).max(1).default(.82), fontSize: z.number().min(12).max(180).default(43),
  align: z.enum(["left", "center", "right"]).default("left"),
  bold: z.boolean().default(false), italic: z.boolean().default(false),
  letterSpacing: z.number().min(-2).max(20).default(0), lineHeight: z.number().min(.9).max(2).default(1.2),
  opacity: z.number().min(0).max(1).default(1), shadow: z.boolean().default(false),
});
export const logoStyleSchema = z.object({
  x: z.number().min(0).max(1).default(.78), y: z.number().min(0).max(1).default(.05),
  width: z.number().min(.03).max(.7).default(.15), opacity: z.number().min(0).max(1).default(1),
});
export const compositionSchema = z.object({
  format: z.enum(["square", "portrait", "story"]), layout: z.enum(["editorial", "detail", "minimal"]),
  background: z.string().regex(/^#[a-fA-F0-9]{6}$/), backgroundImage: localImage.max(15_000_000).nullable(),
  productImage: shopifyMedia, text: z.string().max(160), textColor: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  generatedImage: localImage.max(15_000_000).nullable().default(null),
  imageFit: z.enum(["cover", "contain"]).default("cover"),
  aiReviewed: z.boolean().default(false),
  font: z.enum(["Arial", "Georgia", "Times New Roman"]), imageScale: z.number().min(0.4).max(1.2),
  logoVisible: z.boolean(),
  textStyle: textStyleSchema.default({}), logoStyle: logoStyleSchema.default({}),
});
export type Composition = z.infer<typeof compositionSchema>;
export const projectSchema = z.object({
  id: z.string(), brand: brandSchema, product: productSchema, concept: conceptSchema,
  composition: compositionSchema, createdAt: z.string(), updatedAt: z.string(),
  creativeBrief: z.string().max(1500).default(""),
  generation: z.object({ taskId: z.string(), model: z.literal("nano-banana-pro-flash"), status: z.enum(["pending", "completed", "failed"]) }).optional(),
});
export type Project = z.infer<typeof projectSchema>;
