"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { type GenerationSettings } from "@/lib/social/schema";
import { modelPresetSettings } from "@/lib/social/generation";
import { prepareModelPhoto } from "@/lib/social/model-photo";
import { CheckCircle2, LoaderCircle, Upload, X } from "lucide-react";
import { loadSessionData, saveSessionData } from "@/lib/social/storage";

const views = ["Cuerpo completo", "Tres cuartos", "Turnaround", "Close-up de cara"];
const presetSchema = z.object({ id: z.string(), name: z.string().min(1).max(80), images: z.array(z.string().nullable()).length(4) });
type Preset = z.infer<typeof presetSchema>;
const defaults: Preset[] = [1, 2, 3].map(i => ({ id: `base-${i}`, name: `Modelo base ${i}`, images: [null, null, null, null] }));
export function ModelPresets({ settings, onChange, onError, onUploadingChange }: { settings: GenerationSettings; onChange: (value: GenerationSettings) => void; onError: (value: string) => void; onUploadingChange?: (value: boolean) => void }) {
  const [presets, setPresets] = useState(defaults);
  const [selected, setSelected] = useState("");
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { void loadSessionData("models").then(value => { if (value) setPresets(presetSchema.array().parse(value)); setReady(true); }).catch(() => onError("No se pudieron abrir los presets de modelos.")); }, [onError]);
  const current = presets.find(p => p.id === selected);
  const activeViews = settings.creativeMode === "new-model" ? [...new Set([...(settings.targetModelImage ? [settings.targetModelImage] : []), ...settings.modelViews])] : [];
  function apply(preset: Preset) { onChange(modelPresetSettings(settings, preset.images, preset.name)); }
  async function save(next: Preset[]) { const parsed = presetSchema.array().parse(next); await saveSessionData("models", parsed); setPresets(parsed); }
  async function upload(file: File, index: number) {
    if (!current) return;
    setUploading(true); onUploadingChange?.(true);
    try {
      const data = await prepareModelPhoto(file);
      const updated = { ...current, images: current.images.map((image, i) => i === index ? data : image) };
      await save(presets.map(p => p.id === current.id ? updated : p));
      apply(updated);
    } catch (e) { onError(e instanceof Error ? e.message : "No se pudo guardar la foto."); } finally { setUploading(false); onUploadingChange?.(false); }
  }
  return <section className="session-models"><h3>Biblioteca de modelos</h3><p>El preset aporta la cara y el cuerpo; el producto del catálogo aporta la prenda. Podés empezar con una foto y sumar vistas de la misma persona adulta para mejorar la consistencia. Para conservar cara y cuerpo, recomendamos rostro y cuerpo completo. Al cargar o elegir un preset con fotos, se aplica a la sesión.</p><select aria-label="Preset de modelo" disabled={!ready || uploading} value={selected} onChange={e => { setSelected(e.target.value); const preset = presets.find(p => p.id === e.target.value); if (preset?.images.some(Boolean)) apply(preset); else onChange({ ...settings, modelViews: [], targetModelImage: null, modelDescription: "", creativeMode: "editorial", modeInstructions: "" }); }}><option value="">Sin preset · usar el modo de creación</option>{presets.map(p => <option key={p.id} value={p.id}>{p.name}{p.images.some(Boolean) ? ` · ${p.images.filter(Boolean).length} fotos` : " · sin fotos"}</option>)}</select><button disabled={!ready || uploading} onClick={() => { const p = { id: crypto.randomUUID(), name: `Mi modelo ${presets.length - 2}`, images: [null, null, null, null] }; void save([...presets, p]).then(() => setSelected(p.id)).catch(() => onError("No se pudo guardar el preset.")); }}>Agregar modelo propio</button>
    {current && <><label>Nombre del preset<input disabled={uploading} maxLength={80} value={current.name} onChange={e => setPresets(presets.map(p => p.id === selected ? { ...p, name: e.target.value } : p))} onBlur={() => void save(presets).catch(() => onError("No se pudo guardar el nombre."))} /></label><p className="model-photo-guidance">Una foto nítida, una sola persona adulta y sin filtros. JPG, PNG o WebP hasta 12 MB: ajustamos el tamaño automáticamente.</p><div className="session-model-views">{views.map((view, i) => <div className="model-photo-slot" key={view}>{current.images[i] ? <img src={current.images[i]!} alt={view} /> : <div className="model-photo-placeholder"><Upload size={22} aria-hidden="true" /></div>}<strong>{view}</strong><small>{i === 0 || i === 3 ? "Recomendado" : "Opcional"}</small><label className="model-photo-upload"><Upload size={12} aria-hidden="true" />{current.images[i] ? "Cambiar foto" : "Cargar foto"}<input disabled={uploading} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f, i); }} /></label>{current.images[i] && <button type="button" disabled={uploading} aria-label={`Quitar ${view}`} onClick={async () => { try { const updated = { ...current, images: current.images.map((image, index) => index === i ? null : image) }; await save(presets.map(p => p.id === current.id ? updated : p)); if (updated.images.some(Boolean)) apply(updated); else onChange({ ...settings, modelViews: [], targetModelImage: null, modelDescription: "", creativeMode: "new-model", modeInstructions: "" }); } catch { onError("No se pudo quitar la foto."); } }}><X size={12} />Quitar</button>}</div>)}</div>{uploading && <p className="model-photo-progress" role="status"><LoaderCircle size={14} className="spin" />Preparando y guardando la foto…</p>}<button className="social-primary" disabled={uploading || !current.images.some(Boolean)} onClick={() => apply(current)}>Usar esta persona en todas las prendas</button></>}
    {activeViews.length > 0 && <div className="model-preset-applied" role="status"><img src={activeViews[0]} alt="Modelo aplicada a la sesión" /><div><strong><CheckCircle2 size={14} aria-hidden="true" />Modelo aplicada: {settings.modelDescription || "Referencia de persona"}</strong><p>{activeViews.length} {activeViews.length === 1 ? "foto de identidad" : "fotos de identidad"} · Cara y cuerpo del preset, prenda del catálogo.</p><p className="model-preset-engine">Automático usa Nano Banana Pro con fotos de identidad. Puede consumir más créditos que Flash. No se genera hasta que lo indiques.</p><button disabled={uploading} onClick={() => { setSelected(""); onChange({ ...settings, modelViews: [], targetModelImage: null, modelDescription: "", creativeMode: "editorial", modeInstructions: "" }); }}>Quitar preset</button></div></div>}

  </section>;
}
