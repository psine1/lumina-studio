"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, SlidersHorizontal, Images, ImageIcon, Shirt, UserRound, Upload, X } from "lucide-react";
import { generationSettingsSchema, type GenerationSettings, type Product } from "@/lib/social/schema";
import { CREATIVE_MODE_PROMPTS, referencePlan } from "@/lib/social/generation";
import { mediaUrl } from "@/lib/social/composition";

type Props = { compact?: boolean; children?: ReactNode; settings: GenerationSettings; product: Product; image: string; disabled?: boolean; onChange: (settings: GenerationSettings) => void; onError: (message: string) => void };
export function GenerationModeControls({ compact = false, children, settings: raw, product, image, disabled, onChange, onError }: Props) {
  const settings = generationSettingsSchema.parse(raw || {});
  const [uploading, setUploading] = useState(false);
  const plan = referencePlan(product, image, settings);
  const change = (patch: Partial<GenerationSettings>) => onChange({ ...settings, ...patch });
  async function upload(file: File) {
    setUploading(true);
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1_000_000) throw new Error("Subí una foto PNG, JPG o WebP de hasta 1 MB.");
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("No se pudo leer la foto.")); reader.readAsDataURL(file); });
      change({ targetModelImage: data });
    } catch (error) { onError(error instanceof Error ? error.message : "No se pudo cargar la foto."); }
    finally { setUploading(false); }
  }
  return <section className="generation-mode-controls" aria-label="Modo de creación">
    <div className="generation-mode-heading"><strong>{compact && <i className="post-step-number" aria-hidden="true"><ImageIcon size={14} /></i>}¿Qué querés crear?</strong><span>Elegir un modo no usa créditos</span></div>
    <div className="generation-mode-buttons" role="group" aria-label="Modo de trabajo">{[{ id: "editorial", title: "Misma persona", detail: "Cambiá la escena", icon: ImageIcon }, { id: "garment", title: "Solo prenda", detail: "Sin ninguna persona", icon: Shirt }, { id: "new-model", title: "Otra persona", detail: "Cambiá quién la usa", icon: UserRound }].map(({ id, title, detail, icon: Icon }) => <button type="button" disabled={disabled} key={id} aria-pressed={settings.creativeMode === id} onClick={() => change({ creativeMode: id as GenerationSettings["creativeMode"], referenceStrategy: id === "editorial" ? "economy" : "all", modeInstructions: "" })}>{settings.creativeMode === id && <CheckCircle2 size={13} className="generation-mode-selected" />}<Icon size={20} /><strong>{title}</strong><span>{detail}</span></button>)}</div>
    {settings.creativeMode === "garment" && <div className="generation-target">
      <label>¿Dónde querés la prenda?<select disabled={disabled} value={settings.garmentPlacement} onChange={(event) => change({ garmentPlacement: event.target.value as GenerationSettings["garmentPlacement"] })}><option value="brief">Según mis indicaciones</option><option value="table">Sobre una mesa</option><option value="floor">En el suelo</option><option value="floating">Flotando, sin cuerpo</option><option value="custom">Sobre otro elemento</option></select></label>
      <label>{settings.garmentPlacement === "floating" ? "Detalles de la escena (opcional)" : "Describí el soporte o la escena (opcional)"}<textarea disabled={disabled} rows={2} maxLength={500} value={settings.garmentSurface} onChange={(event) => change({ garmentSurface: event.target.value })} placeholder="Una mesa elegante de mármol, toma desde arriba y luz lateral…" /></label>
      <p>Solo el producto seleccionado, sin personas ni partes del cuerpo. Apoyado, la tela cae y se acomoda sobre la superficie; flotando, conserva volumen sin cuerpo dentro.</p>
    </div>}
    {settings.creativeMode === "new-model" && <div className="generation-target"><label>Descripción del nuevo modelo adulto<textarea disabled={disabled} rows={2} value={settings.modelDescription} maxLength={700} onChange={(event) => change({ modelDescription: event.target.value })} placeholder="Un modelo adulto, postura relajada, pelo corto… o cargá una referencia abajo." /></label><label className="post-upload-button"><Upload size={14} />{uploading ? "Cargando…" : "Cargar foto del nuevo modelo"}<input disabled={disabled || uploading} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} /></label>{settings.targetModelImage && <div className="generation-target-photo"><img src={settings.targetModelImage} alt="Referencia de la nueva persona" /><div><strong>Referencia de persona</strong><span>Se usa su identidad y pose; su ropa no se copia.</span><button type="button" disabled={disabled} onClick={() => change({ targetModelImage: null })}><X size={12} />Quitar foto</button></div></div>}<p>La foto se envía a Magnific al generar. No se sube a Shopify.</p></div>}

    {children}
    {!compact && <><label>Modelo de IA<select disabled={disabled} value={settings.model} onChange={(event) => change({ model: event.target.value as GenerationSettings["model"] })}><option value="auto">Automático · elegir según las fotos</option><option value="nano-banana-pro-flash">Nano Banana Pro Flash · hasta 3 referencias</option><option value="nano-banana-pro">Nano Banana Pro · hasta 14 referencias</option></select></label><p className="post-field-hint">Flash: hasta 3 referencias. Pro: hasta 14; puede consumir más créditos.</p></>}
    <details className={`post-advanced generation-reference-options ${compact ? "compact" : ""}`} open={compact ? undefined : true}><summary><span className="post-setting-label"><Images size={15} aria-hidden="true" />Fotos de referencia</span><span>{plan.productImages.length} de {plan.totalProductImages} fotos</span><ChevronDown size={14} aria-hidden="true" /></summary><div>
    {settings.model === "auto" && <label>Referencias de la prenda<select disabled={disabled} value={settings.referenceStrategy} onChange={(event) => change({ referenceStrategy: event.target.value as GenerationSettings["referenceStrategy"] })}><option value="economy">Ahorro · Flash · hasta 3 referencias totales</option><option value="all">Más vistas · todas las que admita el modelo · hasta 14</option></select></label>}
    <div className="generation-reference-summary"><strong>{plan.productImages.length} de {plan.totalProductImages} fotos del producto{settings.creativeMode === "new-model" && settings.targetModelImage ? " + 1 de persona" : ""}</strong><span>{plan.model === "nano-banana-pro" ? "Nano Banana Pro · 1K · puede consumir más créditos que Flash" : "Nano Banana Pro Flash · 1K"}</span>{plan.omitted > 0 && <p>El límite deja {plan.omitted} fotos fuera. Se prioriza la vista elegida y luego el orden del catálogo; no se envían todas.</p>}<div className="generation-reference-thumbs">{plan.productImages.map((url, index) => <img key={url} src={mediaUrl(url)} alt={`Referencia de prenda ${index + 1}`} loading="lazy" />)}</div></div>
    {settings.creativeMode !== "editorial" && <p className="generation-fidelity-note">Varias vistas ayudan a conservar detalles. Las zonas ocultas y el nuevo calce pueden ser reconstruidos por IA: revisá el resultado antes de usarlo.</p>}
    </div></details>
    <details className="post-advanced post-mode-instructions"><summary><span className="post-setting-label"><SlidersHorizontal size={15} aria-hidden="true" />Instrucciones avanzadas del modo</span><ChevronDown size={14} aria-hidden="true" /></summary><div><textarea aria-label="Instrucciones avanzadas del modo" disabled={disabled} rows={4} maxLength={1800} value={settings.modeInstructions || CREATIVE_MODE_PROMPTS[settings.creativeMode]} onChange={(event) => change({ modeInstructions: event.target.value })} /><span className="post-field-hint">Se guardan en este proyecto. Las reglas de fidelidad de producto siguen aplicándose.</span></div></details>
  </section>;
}
