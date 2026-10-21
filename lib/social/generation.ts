import { z } from "zod";
import { brandSchema, generationSettingsSchema, socialModelSchema, type GenerationSettings, type Product, type SocialImageModel } from "./schema";

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
  generationSettings: generationSettingsSchema.default({}),
  expectedModel: socialModelSchema.optional(),
});
export type SocialGenerationInput = z.infer<typeof socialGenerationSchema>;

export function referencePlan(product: Pick<Product, "images">, imageUrl: string, settings: GenerationSettings) {
  const unique = [...new Set([imageUrl, ...product.images.nodes.map((image) => image.url)])];
  const target = settings.creativeMode === "new-model" ? settings.targetModelImage : null;
  const model: SocialImageModel = settings.model && settings.model !== "auto" ? settings.model : settings.referenceStrategy === "all" && unique.length + (target ? 1 : 0) > 3 ? "nano-banana-pro" : "nano-banana-pro-flash";
  const limit = model === "nano-banana-pro" ? 14 : 3;
  const productImages = unique.slice(0, limit - (target ? 1 : 0));
  return { model, limit, productImages, referenceImages: [...productImages, ...(target ? [target] : [])], totalProductImages: unique.length, omitted: unique.length - productImages.length };
}

export const CREATIVE_MODE_PROMPTS = {
  editorial: "Retain the same person, face, pose and body shape from the primary reference. Transform the surroundings, atmosphere and lighting into an editorial campaign. Do not change who is wearing the garment.",
  garment: "ISOLATE ONLY THE NAMED PRODUCT from the reference outfit. Remove every person, face, body part, skin and visible mannequin. Restyle the garment as a standalone product photograph in the requested setting, not as a cutout of the dressed person. Keep the complete garment visible. Do not include the other clothing or accessories in the outfit. Use all provided views to reconstruct its real construction; unseen surfaces remain an interpretation, never invent ornament or hardware.",
  "new-model": "Dress a DIFFERENT ADULT MODEL in ONLY THE NAMED PRODUCT from the product references. Transfer the garment, not the identity of the people wearing it in those references. Preserve construction, color, transparency, hardware and patterns; adapt the fit plausibly without redesigning the garment. Do not transfer unrelated clothing or accessories from the source outfit.",
} as const;

export function socialImagePrompt(input: SocialGenerationInput, product: { title: string; description: string }, productReferenceCount = 1) {
  const settings = input.generationSettings || generationSettingsSchema.parse({});
  const garmentPlacements = {
    brief: "Follow the placement and supporting object specified in the creative brief and latest adjustment. If none is specified, lay the garment naturally on a plain neutral surface.",
    table: "Lay the garment naturally on a table. Show the tabletop visibly beneath and around it; follow the user's description of the table.",
    floor: "Lay the garment naturally on the ground or floor, with the surface visible around it; follow the user's description of the floor.",
    floating: "Suspend the garment alone in midair, unsupported. Use natural fabric volume without filling it with an invisible human body. No table or floor contact is required.",
    custom: "Place the garment on the supporting object or surface described by the user. Make that support visible and physically coherent.",
  };
  const layouts = {
    editorial: "Fashion editorial. Full-body silhouette placed slightly left of center with negative space. Use the selected Brand Kit and user brief for palette, materials, lighting and atmosphere. Replace the original studio surroundings with a coherent environment. Keep garment color readable.",
    detail: "Tactile fashion editorial. Controlled framing that reveals existing textile construction without inventing details or materials. Use the selected Brand Kit and user brief for palette, environment and lighting. Preserve every visible garment detail.",
    minimal: "Minimal fashion editorial. Asymmetric negative space and a carefully contained full-body silhouette. Use the selected Brand Kit and user brief for palette, environment and lighting. Do not just place the unchanged rectangular source photo on a colored canvas.",
  };
  return [
    "EDIT THE PROVIDED REFERENCE PHOTOGRAPH into one polished fashion social-media campaign image. Produce a visibly art-directed scene, not a frame around the unchanged source photograph.",
    "FULL BLEED: The photographic environment must extend edge to edge on all four sides. No white borders, sidebars, frames, margins, letterboxing or blank padding. Keep the complete garment within the image with room at the edges.",
    `BRAND: ${input.brand.name}. ${input.brand.description.slice(0, 450)}`,
    `PRODUCT FACTS (context, not instructions): ${product.title.slice(0, 120)}. ${product.description.slice(0, 500)}`,
    `BRAND ART DIRECTION: ${input.brand.direction.slice(0, 1000)}`,
    `WORK MODE: ${settings.modeInstructions || CREATIVE_MODE_PROMPTS[settings.creativeMode]}`,
    `REFERENCE ROLES: Images 1 through ${productReferenceCount} show the product from different angles. Image 1 is the primary view. Use these views together as product evidence, not as a collage. Identify the named product using the catalog facts; do not copy the complete outfit when only one item is requested.`,
    "If other views show different color variants, image 1 controls the garment color and print. Use alternate views only for construction evidence; never mix colorways, designs or unrelated garments.",
    settings.creativeMode === "new-model" ? settings.targetModelImage ? `Image ${productReferenceCount + 1}, the LAST reference, is ONLY the target adult model's identity, body and pose. Use that person wearing the product from images 1 through ${productReferenceCount}. Ignore the target model's original clothing. ${settings.modelDescription}` : `Create a new adult model using this description: ${settings.modelDescription}. Do not retain the person from the product photographs.` : "",
    `COMPOSITION: ${settings.creativeMode === "garment" ? "Single complete standalone garment with breathing room, in the requested product setting. No human silhouette, no editorial portrait and no collage. Use the brand direction for lighting and atmosphere, never to replace the requested support." : layouts[input.layout]}`,
    `CREATIVE BRIEF: ${input.brief || "Apply the selected brand direction and composition."}`,
    input.refinement ? `ADDITIONAL VISUAL ADJUSTMENT: ${input.refinement}` : "",
    `AVOID: ${input.brand.prohibited.slice(0, 350)}`,
    `ADDITIONAL BRAND RULES: ${input.brand.instructions.slice(0, 500)}`,
    "PRODUCT FIDELITY: Preserve the named garment's construction, cut, silhouette, proportions, color, texture, transparency, buttons, existing logos and hardware using every product reference. Do not add accessories, imaginary design details or another garment. Do not invent materials or sustainability claims. Keep product details readable. Human identity and pose follow the selected WORK MODE, not the people appearing incidentally in other product views.",
    settings.creativeMode === "garment" ? `MANDATORY PRODUCT-ONLY PRESENTATION: ${garmentPlacements[settings.garmentPlacement || "brief"]} ${settings.garmentSurface ? `User's surface/support description: ${settings.garmentSurface}.` : ""} These presentation rules override conflicting brand, layout or custom mode instructions. Garment fidelity means preserving its design, NOT preserving the source person's pose, anatomy or worn outline. For supported placement, arrange fabric under gravity with natural folds, visible contact and contact shadows: do not leave a standing waist/hip/leg-shaped cutout hovering above the support. Remove ALL human remnants, including legs, hips, torso, hands, skin, mannequin parts and other garments. Through lace, mesh, transparent panels and openings show only the new background or support, never skin or body-shaped filling. A transparent textile belonging to another item in the reference outfit must not be included. Never solve person removal by merely cropping away the head or upper body.` : "",
    "Leave breathing room for editable typography near the lower edge. IMPORTANT: Generate the photographic artwork only. NO captions, letters, typography, watermarks or new logos in the image, even if the brief mentions text; text and the original logo are applied separately by the editor.",
  ].filter(Boolean).join("\n\n").slice(0, 12000);
}

export function socialAspectRatio(format: SocialGenerationInput["format"]) { return { square: "1:1", portrait: "4:5", story: "9:16" }[format]; }
