"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { generationSettingsSchema, type GenerationSettings } from "@/lib/social/schema";
import { loadSessionData, saveSessionData } from "@/lib/social/storage";

const views = ["Cuerpo completo", "Tres cuartos", "Turnaround", "Close-up de cara"];
const presetSchema = z.object({ id: z.string(), name: z.string().min(1).max(80), images: z.array(z.string().nullable()).length(4) });
type Preset = z.infer<typeof presetSchema>;
const defaults: Preset[] = [1, 2, 3].map(i => ({ id: `base-${i}`, name: `Modelo base ${i}`, images: [null, null, null, null] }));
export function ModelPresets({ settings, onChange, onError }: { settings: GenerationSettings; onChange: (value: GenerationSettings) => void; onError: (value: string) => void }) {
  const [presets, setPresets] = useState(defaults);
  const [selected, setSelected] = useState("");
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { void loadSessionData("models").then(value => { if (value) setPresets(presetSchema.array().parse(value)); setReady(true); }).catch(() => onError("No se pudieron abrir los presets de modelos.")); }, [onError]);
  const current = presets.find(p => p.id === selected);
  async function save(next: Preset[]) { const parsed = presetSchema.array().parse(next); await saveSessionData("models", parsed); setPresets(parsed); }
  async function upload(file: File, index: number) {
    if (!current) return;
    setUploading(true);
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1_000_000) throw new Error("Usá PNG, JPG o WebP de hasta 1 MB por vista.");
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      await save(presets.map(p => p.id === selected ? { ...p, images: p.images.map((image, i) => i === index ? data : image) } : p));
    } catch (e) { onError(e instanceof Error ? e.message : "No se pudo guardar la foto."); } finally { setUploading(false); }
  }
  return <section className="session-models"><h3>Biblioteca de modelos</h3><p>Elegí un preset para mantener la misma persona y cambiar la prenda. Los 3 espacios base están listos para cargar: cuerpo completo, tres cuartos, turnaround y rostro de la misma persona adulta.</p><select aria-label="Preset de modelo" disabled={!ready || uploading} value={selected} onChange={e => setSelected(e.target.value)}><option value="">Sin preset · usar el modo de creación</option>{presets.map(p => <option key={p.id} value={p.id}>{p.name}{p.images.every(Boolean) ? "" : " · faltan vistas"}</option>)}</select><button disabled={!ready || uploading} onClick={() => { const p = { id: crypto.randomUUID(), name: `Mi modelo ${presets.length - 2}`, images: [null, null, null, null] }; void save([...presets, p]).then(() => setSelected(p.id)).catch(() => onError("No se pudo guardar el preset.")); }}>Agregar modelo propio</button>
    {current && <><label>Nombre del preset<input maxLength={80} value={current.name} onChange={e => setPresets(presets.map(p => p.id === selected ? { ...p, name: e.target.value } : p))} onBlur={() => void save(presets).catch(() => onError("No se pudo guardar el nombre."))} /></label><div className="session-model-views">{views.map((view, i) => <label key={view}>{current.images[i] && <img src={current.images[i]!} alt={view} />}<span>{view}</span><input disabled={uploading} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f, i); }} /></label>)}</div><button className="social-primary" disabled={uploading || !current.images.every(Boolean)} onClick={() => onChange(generationSettingsSchema.parse({ ...settings, creativeMode: "new-model", model: "auto", referenceStrategy: "all", modeInstructions: "", targetModelImage: current.images[0], modelViews: current.images, modelDescription: current.name }))}>Usar esta persona en todas las prendas</button></>}
    {settings.creativeMode === "new-model" && settings.modelViews.length > 0 && <p role="status">Preset aplicado · cuatro vistas. <button onClick={() => onChange({ ...settings, modelViews: [], targetModelImage: null, modelDescription: "", creativeMode: "editorial" })}>Quitar preset</button></p>}
  </section>;
}
