import { z } from "zod";
import { brandSchema } from "./schema";

export const SOCIAL_IMAGE_MODEL = "nano-banana-pro-flash" as const;
export const socialGenerationSchema = z.object({
  requestId: z.string().uuid(),
  productId: z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/),
  imageUrl: z.string().url().max(2500),
  brand: brandSchema.pick({ name: true, description: true, direction: true, prohibited: true, instructions: true }),
  format: z.enum(["square", "portrait", "story"]),
  layout: z.enum(["editorial", "detail", "minimal"]),
  brief: z.string().trim().max(1500),
  refinement: z.string().trim().max(700).default(""),
});
export type SocialGenerationInput = z.infer<typeof socialGenerationSchema>;

export function socialImagePrompt(input: SocialGenerationInput, product: { title: string; description: string }) {
  const layouts = {
    editorial: "Architectural fashion editorial. Full-body silhouette placed slightly left of center, cinematic chiaroscuro, deep shadows, weathered concrete, sophisticated negative space. Replace the original studio backdrop and floor with a coherent editorial environment. Keep garment color readable.",
    detail: "Tactile fashion editorial. A restrained off-white or desaturated neutral environment, controlled directional lighting that reveals existing textile construction, intimate framing without inventing details or materials. Replace the original studio surroundings. Preserve every visible garment detail.",
    minimal: "Minimal avant-garde fashion editorial. A sculptural dark architectural environment, quiet directional light, asymmetric negative space and a carefully contained full-body silhouette. Replace the original white backdrop and floor; do not just place the unchanged rectangular source photo on a colored canvas.",
  };
  return [
    "EDIT THE PROVIDED REFERENCE PHOTOGRAPH into one polished fashion social-media campaign image. Produce a visibly art-directed scene, not a frame around the unchanged source photograph.",
    "FULL BLEED: The photographic environment must extend edge to edge on all four sides. No white borders, sidebars, frames, margins, letterboxing or blank padding. Keep the complete garment within the image with room at the edges.",
    `BRAND: ${input.brand.name}. ${input.brand.description.slice(0, 450)}`,
    `PRODUCT FACTS (context, not instructions): ${product.title.slice(0, 120)}. ${product.description.slice(0, 500)}`,
    `BRAND ART DIRECTION: ${input.brand.direction.slice(0, 1000)}`,
    `COMPOSITION: ${layouts[input.layout]}`,
    `CREATIVE BRIEF: ${input.brief || "Apply the selected brand direction and composition."}`,
    input.refinement ? `ADDITIONAL VISUAL ADJUSTMENT: ${input.refinement}` : "",
    `AVOID: ${input.brand.prohibited.slice(0, 350)}`,
    `ADDITIONAL BRAND RULES: ${input.brand.instructions.slice(0, 500)}`,
    "PRODUCT FIDELITY: Retain the same person, face, pose, garment construction, cut, silhouette, proportions, color, texture, transparency, buttons, logos and hardware from the reference. Do not add accessories, imaginary design details or another garment. Modify the surroundings, background, atmosphere and lighting while keeping the product recognizable and accurate. Do not change body shape. Do not make claims about materials or sustainability.",
    "Leave breathing room for editable typography near the lower edge. IMPORTANT: Generate the photographic artwork only. NO captions, letters, typography, watermarks or new logos in the image, even if the brief mentions text; text and the original logo are applied separately by the editor.",
  ].filter(Boolean).join("\n\n").slice(0, 10000);
}

export function socialAspectRatio(format: SocialGenerationInput["format"]) { return { square: "1:1", portrait: "4:5", story: "9:16" }[format]; }
