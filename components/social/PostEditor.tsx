"use client";

import { useState, type CSSProperties } from "react";
import { ArrowDownToLine, ArrowLeft, Check, CheckCheck, ChevronDown, Copy, Download, Eye, ImageIcon, Layers3, LoaderCircle, Save, Sparkles, Type, Upload } from "lucide-react";
import { formats, type Composition, type Project } from "@/lib/social/schema";
import { mediaUrl } from "@/lib/social/composition";
import { CompositionPreview } from "./CompositionPreview";
import { OverlayControls } from "./OverlayControls";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Panel = "image" | "text" | "logo" | "download";
type Props = {
  project: Project; busy: boolean; generating: boolean; refinement: string; savedAt?: string;
  onRefinement: (value: string) => void;
  onComposition: (patch: Partial<Composition>) => void;
  onProject: (patch: Partial<Project>) => void;
  onGenerate: () => void; onBack: () => void; onSave: () => boolean;
  onExport: (format: "png" | "jpeg") => Promise<void>; onProjectDownload: () => void;
  onBackgroundUpload: (file: File) => Promise<void>;
  onNotice: (message: string) => void; onError: (message: string) => void;
};
const panels = [{ id: "image", label: "Imagen", icon: ImageIcon }, { id: "text", label: "Texto", icon: Type }, { id: "logo", label: "Logo", icon: Layers3 }, { id: "download", label: "Descargar", icon: Download }] as const;

export function PostEditor({ project, busy, generating, refinement, savedAt, onRefinement, onComposition, onProject, onGenerate, onBack, onSave, onExport, onProjectDownload, onBackgroundUpload, onNotice, onError }: Props) {
  const [panel, setPanel] = useState<Panel>("image");
  const [confirmBack, setConfirmBack] = useState(false);
  const [comparison, setComparison] = useState(false), [clean, setClean] = useState(false);
  const [language, setLanguage] = useState<"es" | "en">("es"), [fileFormat, setFileFormat] = useState<"png" | "jpeg">("png");
  const generated = Boolean(project.composition.generatedImage);
  const pending = project.generation?.status === "pending";
  const dirty = !savedAt || savedAt !== project.updatedAt;
  const needsReview = generated && !project.composition.aiReviewed;
  const dimensions = formats[project.composition.format];
  function selectPanel(value: Panel) { setPanel(value); if (value === "text" || value === "logo") { setComparison(false); setClean(false); } }
  function changeLogo(logo: string | null) { onProject({ brand: { ...project.brand, logo }, composition: { ...project.composition, logoVisible: Boolean(logo) } }); }
  async function copyCaption() {
    try { await navigator.clipboard.writeText(`${project.concept.caption.es}\n\n${project.concept.caption.en}`); onNotice("Caption bilingüe copiado."); }
    catch { onError("No se pudo copiar. Podés seleccionar el caption y copiarlo manualmente."); }
  }
  return <section className="social-editor social-post-editor" aria-label="Editor del posteo">
    <header className="post-toolbar">
      <div className="post-title"><button className="post-back" type="button" disabled={busy || generating} onClick={() => dirty ? setConfirmBack(true) : onBack()} aria-label="Volver a las direcciones"><ArrowLeft size={17} /></button><div><span className="post-eyebrow">{project.brand.name} · {project.product.title}</span><h2>{project.concept.name}</h2></div></div>
      <div className="post-toolbar-actions"><span className={`post-save-state ${dirty ? "unsaved" : "saved"}`}>{dirty ? <><i />Cambios sin guardar</> : <><Check size={13} />Guardado</>}</span><button type="button" disabled={busy || generating} onClick={onSave}><Save size={15} />Guardar</button><button type="button" className="social-primary" onClick={() => selectPanel("download")}><Download size={15} />Descargar</button></div>
    </header>
    <div className="post-workspace">
      <div className="post-stage">
        <div className="post-stage-toolbar"><span className={`post-asset-state ${generated ? "generated" : "original"}`}><i />{generated ? "Imagen generada con IA" : "Boceto · foto original"}</span><div className="post-stage-buttons">{generated && <button type="button" aria-pressed={comparison} onClick={() => setComparison(!comparison)}><Eye size={14} />{comparison ? "Volver al lienzo" : "Comparar"}</button>}<button type="button" aria-pressed={clean} onClick={() => { setComparison(false); setClean(!clean); }}>{clean ? "Mostrar controles" : "Vista limpia"}</button></div></div>
        <div className={`post-artboard ${comparison ? "comparing" : ""}`} style={{ "--canvas-ratio": dimensions.width / dimensions.height } as CSSProperties}>
          {comparison && generated ? <div className="post-compare"><figure><div><img src={mediaUrl(project.composition.productImage)} alt="Referencia original de Shopify" /></div><figcaption>Original Shopify</figcaption></figure><figure><div><img src={project.composition.generatedImage!} alt="Fotografía transformada por Magnific" /></div><figcaption>Generada con Magnific</figcaption></figure></div> : <CompositionPreview composition={project.composition} brand={project.brand} onChange={clean ? undefined : onComposition} onSelectLayer={(layer) => selectPanel(layer)} />}
          {generating && <div className="post-generation-status" role="status"><LoaderCircle size={16} className="spin" /><div><strong>Magnific está creando tu imagen</strong><span>Una sola generación. Podés seguir ajustando texto y logo.</span></div></div>}
        </div>
        <footer className="post-stage-footer"><span>{dimensions.width} × {dimensions.height} px <b>·</b> {project.composition.format === "story" ? "Stories" : project.composition.format === "portrait" ? "Retrato" : "Cuadrado"}</span><span><CheckCheck size={13} />Texto y logo editables</span></footer>
      </div>
      <aside className="post-inspector">
        <div className="post-inspector-tabs" role="tablist" aria-label="Herramientas del posteo">{panels.map(({ id, label, icon: Icon }) => <button type="button" key={id} role="tab" id={`post-tab-${id}`} aria-controls={`post-panel-${id}`} aria-selected={panel === id} tabIndex={panel === id ? 0 : -1} onClick={() => selectPanel(id)} onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); const index = panels.findIndex((p) => p.id === id); const next = panels[(index + (event.key === "ArrowRight" ? 1 : -1) + panels.length) % panels.length]; selectPanel(next.id); document.getElementById(`post-tab-${next.id}`)?.focus(); }}><Icon size={17} /><span>{label}</span></button>)}</div>
        <div className="post-inspector-content" role="tabpanel" id={`post-panel-${panel}`} aria-labelledby={`post-tab-${panel}`}>
          {panel === "image" && <>
            <div className="post-panel-heading"><h3>{generated ? "Dale otra vuelta" : "Creá la imagen del posteo"}</h3><p>{generated ? "Modificá el brief si querés generar otra versión. Texto y logo se ajustan sin volver a generar." : "Magnific usa la foto del producto y tus indicaciones para transformar la escena."}</p></div>
            <label>Tu dirección creativa<textarea rows={5} maxLength={1500} value={project.creativeBrief || ""} onChange={(event) => onProject({ creativeBrief: event.target.value })} placeholder="Un interior de concreto, luz lateral cinematográfica y espacio negativo. Conservar la prenda…" /><span className="post-field-hint">{(project.creativeBrief || "").length}/1500</span></label>
            {generated && <label>Qué querés cambiar<input maxLength={700} value={refinement} onChange={(event) => onRefinement(event.target.value)} placeholder="Más oscuro, más aire, otro entorno…" /></label>}
            <button type="button" className="social-primary post-generate-button" disabled={busy || generating} onClick={onGenerate}>{generating || busy ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{generating ? "Generando imagen…" : pending ? "Consultar resultado" : generated ? "Generar otra versión" : "Generar con Magnific"}</button>
            <div className="post-credit-note"><span>{pending ? "Consultar no genera otra imagen" : "1 imagen · calidad 1K"}</span><strong>{pending ? "Sin nuevos créditos" : "Usa créditos Magnific"}</strong></div>
            <details className="post-advanced"><summary>Formato y composición<ChevronDown size={14} /></summary><div><label>Formato<select value={project.composition.format} onChange={(event) => onComposition({ format: event.target.value as Composition["format"] })}>{Object.entries(formats).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></label>{generated && <label>Ajuste de la imagen<select value={project.composition.imageFit || "cover"} onChange={(event) => onComposition({ imageFit: event.target.value as Composition["imageFit"] })}><option value="cover">Rellenar el lienzo · sin franjas</option><option value="contain">Mostrar imagen completa</option></select><span className="post-field-hint">Rellenar puede recortar los bordes si cambiás la proporción. No estira la imagen ni consume créditos.</span></label>}<label>{generated ? "Composición para la próxima generación" : "Composición del boceto"}<select value={project.composition.layout} onChange={(event) => onComposition({ layout: event.target.value as Composition["layout"] })}><option value="editorial">Editorial asimétrica</option><option value="detail">Marco de detalle</option><option value="minimal">Presencia mínima</option></select></label>{!generated && <><label>Color del marco<input type="color" value={project.composition.background} onChange={(event) => onComposition({ background: event.target.value })} /></label><label>Escala de la fotografía<input type="range" min={.4} max={1.2} step={.02} value={project.composition.imageScale} onChange={(event) => onComposition({ imageScale: Number(event.target.value) })} /></label><button type="button" onClick={() => onComposition({ imageScale: .65 })}>Más espacio negativo</button><label className="post-upload-button"><Upload size={15} />Cargar fondo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onBackgroundUpload(file); }} /></label>{project.composition.backgroundImage && <button type="button" onClick={() => onComposition({ backgroundImage: null })}>Quitar fondo cargado</button>}</>}</div></details>
            {generated && <button className="post-text-button" type="button" disabled={busy || generating} onClick={() => onComposition({ generatedImage: null, aiReviewed: false })}>Usar la fotografía original</button>}
            {project.generation && <details className="post-advanced post-task-info"><summary>Información de la tarea<ChevronDown size={14} /></summary><div><small>{project.generation.taskId}</small><span>Nano Banana Pro Flash. Consultar esta tarea no inicia otra generación.</span></div></details>}
          </>}
          {(panel === "text" || panel === "logo") && <><div className="post-panel-heading"><h3>{panel === "text" ? "Encontrá las palabras y su lugar" : "La firma de tu marca"}</h3><p>{panel === "text" ? "Editá el texto y movelo en el lienzo. El caption de redes se edita al descargar." : "Usá el archivo original del logo y acomodalo sobre la imagen."}</p></div><OverlayControls mode={panel} composition={project.composition} brand={project.brand} onChange={onComposition} onLogoChange={changeLogo} onError={onError} /><div className="post-local-note"><Check size={13} />Edición local · no usa créditos</div></>}
          {panel === "download" && <>
            <div className="post-panel-heading"><h3>Tu posteo, listo para salir</h3><p>Descargá la imagen y llevate el caption. No se publica nada automáticamente.</p></div>
            <div className="post-output-info"><ImageIcon size={22} /><div><strong>{dimensions.width} × {dimensions.height} px</strong><span>Texto y logo incluidos en la descarga</span></div></div>
            <div className="post-segmented" role="group" aria-label="Formato de descarga">{([{ id: "png", title: "PNG", detail: "Máxima nitidez" }, { id: "jpeg", title: "JPG", detail: "Archivo liviano" }] as const).map((option) => <button type="button" key={option.id} aria-pressed={fileFormat === option.id} onClick={() => setFileFormat(option.id)}><strong>{option.title}</strong><span>{option.detail}</span></button>)}</div>
            {generated && <div className={`post-review ${needsReview ? "pending" : "done"}`}><div><Eye size={16} /><strong>Revisá la prenda antes de descargar</strong></div><p>Compará color, construcción y detalles con la foto original.</p><button type="button" className="post-text-button" onClick={() => setComparison(true)}>Ver comparación</button><label className="social-check"><input type="checkbox" checked={project.composition.aiReviewed} onChange={(event) => onComposition({ aiReviewed: event.target.checked })} />Revisé la prenda y apruebo el resultado</label></div>}
            <button type="button" className="social-primary post-download-button" disabled={busy || generating || pending || needsReview} onClick={() => void onExport(fileFormat)}>{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowDownToLine size={17} />}Descargar {fileFormat === "png" ? "PNG" : "JPG"}</button>
            {pending && <p className="post-field-hint">Primero recuperá la imagen pendiente desde Imagen.</p>}
            <section className="post-caption"><div className="post-caption-heading"><h4>Caption para redes</h4><div className="post-language" role="group" aria-label="Idioma del caption"><button type="button" aria-pressed={language === "es"} onClick={() => setLanguage("es")}>ES</button><button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button></div></div><textarea aria-label={language === "es" ? "Caption en español" : "Caption en inglés"} maxLength={2200} rows={4} value={project.concept.caption[language]} onChange={(event) => onProject({ concept: { ...project.concept, caption: { ...project.concept.caption, [language]: event.target.value } } })} /><button type="button" onClick={() => void copyCaption()}><Copy size={14} />Copiar caption bilingüe</button></section>
            <details className="post-advanced"><summary>Conservar una copia editable<ChevronDown size={14} /></summary><div><p>Guardá en este navegador o descargá el proyecto para importarlo después con todas sus capas.</p><button type="button" onClick={onSave}><Save size={14} />Guardar proyecto</button><button type="button" onClick={onProjectDownload}><Download size={14} />Descargar proyecto JSON</button></div></details>
          </>}
        </div>
      </aside>
    </div>
    <Dialog open={confirmBack} onOpenChange={setConfirmBack}><DialogContent className="post-leave-dialog"><DialogHeader><DialogTitle>Tenés cambios sin guardar</DialogTitle><DialogDescription>Guardá el proyecto para conservar la imagen, el texto y el logo antes de volver a las direcciones.</DialogDescription></DialogHeader><div className="post-leave-actions"><button type="button" onClick={() => setConfirmBack(false)}>Seguir editando</button><button type="button" onClick={() => { setConfirmBack(false); onBack(); }}>Volver sin guardar</button><button type="button" className="social-primary" onClick={() => { const saved = onSave(); setConfirmBack(false); if (saved) onBack(); }}>Guardar y volver</button></div></DialogContent></Dialog>
  </section>;
}
