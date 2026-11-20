"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Sparkles, Upload, X } from "lucide-react";
import { formats, generationSettingsSchema, type Brand, type Composition, type Product, type GenerationSettings } from "@/lib/social/schema";
import { loadSessionData, saveSessionData } from "@/lib/social/storage";
import { mediaUrl } from "@/lib/social/composition";
import { referencePlan, socialImagePrompt } from "@/lib/social/generation";

type Props = {
  brand: Brand;
  product: Product; image: string; format: Composition["format"]; contentType: string; approach: string;
  textMode: string; customText: string; instructions: string;
  generationSettings: GenerationSettings; onGenerationSettings: (value: GenerationSettings) => void; onError: (message: string) => void;
  onImage: (image: string) => void; onFormat: (format: Composition["format"]) => void;
  onContentType: (value: string) => void; onApproach: (value: string) => void; onTextMode: (value: string) => void;
  onCustomText: (value: string) => void; onInstructions: (value: string) => void; onPrepare: () => void;
};
const starters = [
  { name: "Luz natural", text: "Luz de ventana suave, tonos cálidos y una actitud espontánea. Un espacio real, sin artificios." },
  { name: "Editorial", text: "Arquitectura de concreto, luz lateral y sombras definidas. Encuadre asimétrico con espacio para diseño." },
  { name: "Estudio", text: "Fondo continuo neutro, luz difusa y textura de la prenda en primer plano. Colores fieles al producto." },
];
export function CreativeSetup(p: Props) {
  const [prepared, setPrepared] = useState("");
  const [uploading, setUploading] = useState(false);
  const [library, setLibrary] = useState<GenerationSettings["artReferences"]>([]);
  const [libraryReady, setLibraryReady] = useState(false);
  const refs = p.generationSettings.artReferences;
  useEffect(() => { let cancelled = false; void loadSessionData("art-library").then(value => { if (cancelled) return; if (Array.isArray(value)) setLibrary(value.map(reference => generationSettingsSchema.parse({ artReferences: [reference] }).artReferences[0])); setLibraryReady(true); }).catch(() => p.onError("No se pudo abrir la biblioteca de referencias.")); return () => { cancelled = true; }; }, [p.onError]);
  useEffect(() => { setPrepared(""); }, [p.instructions, p.image, p.generationSettings, p.brand]);
  function changeRefs(value: typeof refs) { p.onGenerationSettings({ ...p.generationSettings, model: "auto", artReferences: value }); setPrepared(""); }
  async function upload(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    try {
      const next = [...refs];
      for (const file of Array.from(files)) {
        if (next.length >= 6) break;
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1_000_000) throw new Error("Usá PNG, JPG o WebP de hasta 1 MB por referencia.");
        const image = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
        next.push({ id: crypto.randomUUID(), name: file.name.slice(0, 120), role: "style", image });
      }
      const saved = [...library, ...next.filter(reference => !library.some(item => item.id === reference.id))].slice(-30);
      await saveSessionData("art-library", saved); setLibrary(saved); changeRefs(next);
    } catch (e) { p.onError(e instanceof Error ? e.message : "No se pudo cargar la referencia."); }
    finally { setUploading(false); }
  }
  return <div className="direction-layout">
    <section className="flow-panel direction-main">
      <div className="flow-panel-heading"><span className="flow-number">01</span><div><h3>Contanos la idea</h3><p>Una misma mirada para todas las prendas de esta sesión.</p></div><Sparkles size={20} /></div>
      <label className="direction-prompt"><span>Tu dirección de arte</span><textarea rows={5} maxLength={1500} value={p.instructions} onChange={e => { p.onInstructions(e.target.value); setPrepared(""); }} placeholder="Imagino una campaña en una casa de verano. Luz de tarde, tonos arena, tomas espontáneas. La prenda es protagonista…" /><small>{p.instructions.length}/1500</small></label>
      <div className="creative-starters"><span>Punto de partida</span>{starters.map(s => <button key={s.name} onClick={() => { p.onApproach(s.name); p.onInstructions(s.text); setPrepared(""); }}>{s.name}</button>)}</div>
      <div className="flow-panel-heading"><span className="flow-number">02</span><div><h3>Referencias visuales</h3><p>Indicá qué te interesa de cada imagen: estilo, toma, objeto o modelo.</p></div><span className="flow-count">{refs.length}/6</span></div>
      <div className="art-reference-grid">{refs.map(ref => <article key={ref.id}><img src={ref.image} alt={ref.name} /><button aria-label={`Quitar ${ref.name}`} onClick={() => changeRefs(refs.filter(r => r.id !== ref.id))}><X size={14} /></button><select aria-label={`Rol de ${ref.name}`} value={ref.role} onChange={e => changeRefs(refs.map(r => r.id === ref.id ? { ...r, role: e.target.value as typeof ref.role } : r))}><option value="style">Estilo y luz</option><option value="shot">Toma y encuadre</option><option value="object">Objeto / escena</option><option value="model">Modelo</option></select><small>{ref.name}</small></article>)}<label className="art-reference-upload"><Upload size={22} /><strong>{uploading ? "Cargando…" : "Subir referencias"}</strong><span>PNG, JPG o WebP · hasta 1 MB</span><input aria-label="Subir referencias visuales" disabled={uploading || !libraryReady || refs.length >= 6} type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={e => { void upload(e.target.files); e.target.value = ""; }} /></label></div>
      {refs.length > 0 && <p className="flow-hint">Las referencias se envían con cada prenda. Las fotos del producto conservan prioridad sobre su color y construcción.</p>}
      <details className="post-advanced"><summary>Usar imágenes que ya cargaste · {library.length} guardadas</summary><div className="creative-reference-thumbs">{library.map(ref => <button key={ref.id} disabled={refs.length >= 6 || refs.some(item => item.id === ref.id)} aria-label={`Reutilizar ${ref.name}`} onClick={() => changeRefs([...refs, ref])}><img src={ref.image} alt={ref.name} /></button>)}</div><small className="flow-hint">Biblioteca de sesiones anteriores y fotos del catálogo.</small><div className="creative-reference-thumbs">{p.product.images.nodes.map(asset => <button key={asset.id} disabled={refs.length >= 6} aria-label="Agregar foto del catálogo como referencia de toma" onClick={async () => { try { const response = await fetch(mediaUrl(asset.url)); if (!response.ok) throw new Error(); const blob = await response.blob(); if (blob.size > 1_000_000) throw new Error(); const image = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(blob); }); changeRefs([...refs, { id: crypto.randomUUID(), name: asset.altText?.slice(0,120) || "Toma del catálogo", role: "shot", image }]); } catch { p.onError("No se pudo cargar esa foto. Subí una copia de hasta 1 MB."); } }}><img src={mediaUrl(asset.url)} alt={asset.altText || "Foto del catálogo"} /></button>)}</div></details>
    </section>
    <aside className="direction-aside">
      <section className="flow-panel assistant-card"><span className="eyebrow"><Sparkles size={14} /> ASISTENTE DE DIRECCIÓN</span><h3>De tu idea al prompt.</h3><p>Organizamos el brief, los roles de referencia y las reglas de fidelidad en un prompt técnico para la generación.</p><div className="assistant-facts"><span>Formato <strong>{formats[p.format].width} × {formats[p.format].height}</strong></span><span>Referencias creativas <strong>{refs.length}</strong></span><span>Consistencia <strong>{p.generationSettings.modelViews.length ? "Preset de identidad" : "Según modo elegido"}</strong></span></div><button onClick={() => { const plan = referencePlan(p.product, p.image, p.generationSettings); setPrepared(socialImagePrompt({ requestId: crypto.randomUUID(), productId: p.product.id, imageUrl: p.image, brand: { ...p.brand, direction: "", instructions: "" }, format: p.format, layout: p.contentType === "Material y detalle" ? "detail" : p.approach === "Minimalista" || p.contentType === "Composición mínima" ? "minimal" : "editorial", brief: p.instructions, refinement: "", generationSettings: p.generationSettings }, p.product, plan.productImages.length)); }}><Sparkles size={15} /> Preparar prompt técnico</button><small>Traducción por reglas. No realiza análisis visual con un agente de IA.</small>{prepared && <details open className="technical-prompt"><summary>Vista previa del prompt</summary><pre>{prepared}</pre></details>}</section>
      <section className="flow-panel"><span className="eyebrow">PRIMERA PIEZA</span><div className="direction-product"><img src={mediaUrl(p.image)} alt={p.product.title} /><div><strong>{p.product.title}</strong><span>Una imagen para empezar.</span></div></div><details className="post-advanced"><summary>Cambiar foto de producto (opcional)</summary><label>Foto principal<select value={p.image} onChange={e => p.onImage(e.target.value)}>{p.product.images.nodes.map((a, i) => <option key={a.id} value={a.url}>Toma {i + 1}</option>)}</select></label></details><p className="flow-hint">Validá la ambientación y la dirección de arte antes de generar el batch completo.</p><button className="social-primary" disabled={!p.image || uploading} onClick={p.onPrepare}>Continuar a la primera imagen <ArrowRight size={16} /></button><small>Preparar la sesión no consume créditos.</small></section>
    </aside>
  </div>;
}
