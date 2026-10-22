"use client";

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { ArrowDownToLine, ArrowLeft, Undo2, Redo2, LockKeyhole, Magnet, ImagePlus, Plus, Check, CheckCheck, ChevronDown, Coins, Copy, Cpu, Download, Eye, ImageIcon, Layers3, LoaderCircle, Palette, Scissors, PencilLine, Ratio, SlidersHorizontal, Info, RotateCcw, PanelRightClose, PanelRightOpen, Save, Sparkles, Type, Upload } from "lucide-react";
import { formats, generationSettingsSchema, textStyleSchema, logoStyleSchema, overlayLayerSchema, type OverlayLayer, type Composition, type Project } from "@/lib/social/schema";
import { mediaUrl, hasSubjectMask } from "@/lib/social/composition";
import { CanvasViewport } from "./CanvasViewport";
import { CompositionPreview } from "./CompositionPreview";
import { compositionLayers, layerComposition, patchCompositionLayer, reorderLayer } from "@/lib/social/layers";
import { useEditorHistory } from "./useEditorHistory";
import { SubjectMaskEditor } from "./SubjectMaskEditor";
import { PropertiesPanel } from "./PropertiesPanel";
import { LayersPanel } from "./LayersPanel";
import { OverlayControls } from "./OverlayControls";
import { GenerationModeControls } from "./GenerationModeControls";
import { referencePlan } from "@/lib/social/generation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Panel = "image" | "download";
type Props = {
  brandControl?: ReactNode;
  project: Project; busy: boolean; generating: boolean; refinement: string; savedAt?: string;
  onRefinement: (value: string) => void;
  onComposition: (patch: Partial<Composition>) => void;
  onProject: (patch: Partial<Project>) => void;
  onGenerate: () => void; onBack: () => void; onSave: () => Promise<boolean>;
  onExport: (format: "png" | "jpeg") => Promise<void>; onProjectDownload: () => void;
  onBackgroundUpload: (file: File) => Promise<void>;
  onNotice: (message: string) => void; onError: (message: string) => void;
};
const panels = [{ id: "image", label: "Imagen IA", icon: ImageIcon }, { id: "download", label: "Descargar", icon: Download }] as const;

export function PostEditor({ brandControl, project, busy, generating, refinement, savedAt, onRefinement, onComposition: _onComposition, onProject: rawOnProject, onGenerate, onBack, onSave, onExport, onProjectDownload, onBackgroundUpload, onNotice, onError }: Props) {
  void _onComposition;
  const history = useEditorHistory(project, rawOnProject);
  const onComposition = history.updateComposition, onProject = history.updateProject;
  const [snapping, setSnapping] = useState(true);
  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey || busy || generating || maskOpen) return;
      if ((event.target as Element).closest?.("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const key = event.key.toLowerCase();
      if (key === "z" || key === "y") { event.preventDefault(); if (key === "y" || event.shiftKey) history.redo(); else history.undo(); }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [maskOpen, setMaskOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(true);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);
  const [assetBusy, setAssetBusy] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const layers = compositionLayers(project.composition, project.brand);
  const latestLayers = useRef(layers), activeEditor = useRef(true);
  useEffect(() => { latestLayers.current = layers; }, [layers]);
  useEffect(() => { activeEditor.current = true; return () => { activeEditor.current = false; }; }, []);
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId);
  const [toolsHidden, setToolsHidden] = useState(false);
  const [guides, setGuides] = useState(true);
  const inspectorContent = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<Panel>("image");
  const [confirmBack, setConfirmBack] = useState(false);
  const [comparison, setComparison] = useState(false), [clean, setClean] = useState(false);
  const [language, setLanguage] = useState<"es" | "en">("es"), [fileFormat, setFileFormat] = useState<"png" | "jpeg">("png");
  const generated = Boolean(project.composition.generatedImage);
  const pending = project.generation?.status === "pending";
  const dirty = !savedAt || savedAt !== project.updatedAt;
  const needsReview = generated && !project.composition.aiReviewed;
  const dimensions = formats[project.composition.format];
  const settings = generationSettingsSchema.parse(project.generationSettings || {});
  const plan = referencePlan(project.product, project.composition.productImage, settings);
  const missingModel = settings.creativeMode === "new-model" && !settings.targetModelImage && settings.modelDescription.trim().length < 8;
  function selectPanel(value: Panel) { setPanel(value); setToolsHidden(false); inspectorContent.current?.scrollTo({ top: 0 }); }
  function selectLayer(id: string | null) {
    setSelectedLayerId(id); setPropertiesOpen(Boolean(id)); setPropertiesCollapsed(false); if (!id) selectPanel("image"); setComparison(false); setClean(false);
  }
  function commitLayers(next: OverlayLayer[]) { latestLayers.current = next; onComposition({ layers: next }); }
  function addLayer(layer: OverlayLayer) {
    if (!activeEditor.current) return;
    if (latestLayers.current.length >= 40) { onError("Podés agregar hasta 40 capas por posteo."); return; }
    commitLayers([...latestLayers.current, layer]); selectLayer(layer.id);
  }
  function addText() {
    addLayer({ id: crypto.randomUUID(), name: `Texto ${layers.filter((layer) => layer.type === "text").length + 1}`, type: "text", locked: false, visible: true, text: "Nuevo texto", color: project.composition.textColor, font: project.composition.font, style: textStyleSchema.parse({ x: .15, y: Math.min(.7, .3 + layers.length * .03), width: .7, fontSize: 60 }) });
  }
  async function addImage(file: File) {
    if (layers.length >= 40 || assetBusy) return;
    setAssetBusy(true);
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1_000_000) throw new Error("Usá PNG, JPG o WebP de hasta 1 MB.");
      const src = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("No se pudo leer la imagen.")); reader.readAsDataURL(file); });
      if (!activeEditor.current) return;
      addLayer({ id: crypto.randomUUID(), name: file.name.slice(0, 100) || "Imagen", type: "image", locked: false, visible: true, src, style: logoStyleSchema.parse({ x: .3, y: .3, width: .35 }) });
    } catch (error) { onError(error instanceof Error ? error.message : "No se pudo agregar la imagen."); }
    finally { if (activeEditor.current) setAssetBusy(false); }
  }
  function removeLayer(id: string) {
    if (layers.find((layer) => layer.id === id)?.locked) return;
    const next = layers.filter((layer) => layer.id !== id); commitLayers(next);
    if (id === selectedLayerId) selectLayer(next.at(-1)?.id || null);
  }
  function duplicateLayer(id: string) {
    const original = layers.find((layer) => layer.id === id); if (!original || original.locked) return;
    addLayer(overlayLayerSchema.parse({ ...original, id: crypto.randomUUID(), name: `${original.name.slice(0, 85)} (copia)`, style: { ...original.style, x: Math.min(1 - original.style.width, original.style.x + .025), y: Math.min(.95, original.style.y + .025) } }));
  }
  function updateLayer(patch: Partial<Composition>) {
    if (selectedLayer && !selectedLayer.locked) onComposition(patchCompositionLayer(project.composition, project.brand, selectedLayer.id, patch));
  }
  function changeLayerImage(src: string | null) {
    if (!selectedLayer || selectedLayer.locked || selectedLayer.type !== "image") return;
    if (!src) { removeLayer(selectedLayer.id); return; }
    commitLayers(layers.map((layer) => layer.id === selectedLayer.id && layer.type === "image" ? { ...layer, src, visible: true } : layer));
  }
  const layerPanel = !comparison && !clean && layersOpen ? <LayersPanel onLock={(id) => commitLayers(layers.map((layer) => layer.id === id ? { ...layer, locked: !layer.locked } : layer))} onEditMask={() => setMaskOpen(true)} maskReady={hasSubjectMask(project.composition)} maskStale={Boolean(project.composition.subjectMask) && !hasSubjectMask(project.composition)} layers={layers} selectedId={selectedLayerId} onSelect={selectLayer} onToggle={(id) => commitLayers(layers.map((layer) => layer.id === id && !layer.locked ? { ...layer, visible: !layer.visible } : layer))} onDuplicate={duplicateLayer} onRemove={removeLayer} onReorder={(id, direction) => commitLayers(reorderLayer(layers, id, direction, hasSubjectMask(project.composition)))} /> : null;
  const propertiesPanel = !comparison && !clean && propertiesOpen ? <PropertiesPanel selectionId={selectedLayerId || undefined} collapsed={propertiesCollapsed} onCollapse={() => setPropertiesCollapsed(!propertiesCollapsed)} onClose={() => setPropertiesOpen(false)}>
            {selectedLayer ? <><div className="post-panel-heading"><span className="post-section-kicker"><SlidersHorizontal size={12} />PROPIEDADES DE LA CAPA</span><h3>{selectedLayer.name}</h3><p>Los cambios se aplican al elemento seleccionado.</p></div><fieldset className="locked-layer-fields" disabled={selectedLayer.locked}><label>Nombre de la capa<input maxLength={100} value={selectedLayer.name} onChange={(event) => commitLayers(layers.map((layer) => layer.id === selectedLayer.id ? { ...layer, name: event.target.value || (layer.type === "text" ? "Texto" : "Imagen") } : layer))} /></label><OverlayControls layerVisible={selectedLayer.visible} onRemove={() => removeLayer(selectedLayer.id)} onVisibility={() => commitLayers(layers.map((layer) => layer.id === selectedLayer.id ? { ...layer, visible: !layer.visible } : layer))} key={selectedLayer.id} imageLayer={selectedLayer.type === "image"} mode={selectedLayer.type === "text" ? "text" : "logo"} composition={layerComposition(project.composition, selectedLayer)} brand={{ ...project.brand, logo: selectedLayer.type === "image" ? selectedLayer.src : null }} onChange={updateLayer} onLogoChange={changeLayerImage} onError={onError} /></fieldset>{selectedLayer.locked && <button type="button" className="unlock-layer-button" onClick={() => commitLayers(layers.map((layer) => layer.id === selectedLayer.id ? { ...layer, locked: false } : layer))}><LockKeyhole size={15} />Desbloquear capa</button>}<div className="post-local-note"><Check size={13} />Edición local · no usa créditos</div></> : <div className="post-layer-empty"><Layers3 size={32} /><h3>Seleccioná un elemento</h3><p>Hacé clic sobre un texto o imagen en el lienzo, o elegilo en Capas.</p><button type="button" onClick={addText}><Type size={16} />Agregar texto</button><button type="button" onClick={() => imageInput.current?.click()}><ImagePlus size={16} />Agregar imagen</button></div>}
          </PropertiesPanel> : null;
  async function copyCaption() {
    try { await navigator.clipboard.writeText(`${project.concept.caption.es}\n\n${project.concept.caption.en}`); onNotice("Caption bilingüe copiado."); }
    catch { onError("No se pudo copiar. Podés seleccionar el caption y copiarlo manualmente."); }
  }
  return <section className={`social-editor social-post-editor post-editor-fullscreen ${toolsHidden ? "tools-hidden" : ""}`} aria-label="Editor del posteo" onPointerDownCapture={(event) => { if ((event.target as Element).matches("input[type=range]")) history.begin(); }} onPointerUpCapture={history.end} onPointerCancelCapture={history.end}>
    <input ref={imageInput} type="file" className="canvas-asset-input" accept="image/png,image/jpeg,image/webp" aria-label="Agregar imagen al lienzo" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void addImage(file); }} />
    <header className="post-toolbar">
      <div className="post-title"><button className="post-back" type="button" disabled={busy || generating} onClick={() => dirty ? setConfirmBack(true) : onBack()} aria-label="Volver al brief"><ArrowLeft size={17} /></button><div><span className="post-eyebrow">Social Studio · {project.brand.name}</span><h2>{project.product.title}</h2></div></div>
      <div className="post-toolbar-actions"><div className="editor-history-buttons" role="group" aria-label="Historial de edición"><button type="button" aria-label="Deshacer" title="Deshacer · Ctrl/⌘ + Z" disabled={!history.canUndo || busy || generating || maskOpen} onClick={history.undo}><Undo2 size={17} /></button><button type="button" aria-label="Rehacer" title="Rehacer · Ctrl/⌘ + Shift + Z" disabled={!history.canRedo || busy || generating || maskOpen} onClick={history.redo}><Redo2 size={17} /></button></div><button type="button" className="post-tools-toggle" aria-label={toolsHidden ? "Mostrar herramientas" : "Ocultar herramientas"} aria-expanded={!toolsHidden} onClick={() => setToolsHidden(!toolsHidden)}>{toolsHidden ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}<span>Herramientas</span></button><span className={`post-save-state ${dirty ? "unsaved" : "saved"}`}>{dirty ? <><i />Cambios sin guardar</> : <><Check size={13} />Guardado</>}</span><button type="button" disabled={busy || generating} onClick={onSave}><Save size={15} />Guardar</button><button type="button" className="social-primary" onClick={() => selectPanel("download")}><Download size={15} />Descargar</button></div>
    </header>
    <div className="post-workspace">
      <div className="post-stage">

        <div className={`post-artboard ${comparison ? "comparing" : ""}`} style={{ "--canvas-ratio": dimensions.width / dimensions.height } as CSSProperties}>
          <CanvasViewport key={comparison ? "compare" : "canvas"} width={comparison ? dimensions.width * 2 + 48 : dimensions.width} height={dimensions.height + (comparison ? 120 : 0)} floatingPanel={<>{layerPanel}{propertiesPanel}</>} toolbarActions={<><div className="canvas-add-tools" role="toolbar" aria-label="Agregar elementos al lienzo"><button type="button" disabled={layers.length >= 40} onClick={addText} title="Agregar texto"><Type size={16} /><Plus size={10} /><span>Texto</span></button><button type="button" disabled={assetBusy || layers.length >= 40} onClick={() => imageInput.current?.click()} title="Agregar imagen o logo"><ImagePlus size={16} /><span>{assetBusy ? "Cargando…" : "Imagen"}</span></button>{project.brand.logo && <button type="button" disabled={layers.length >= 40} title="Agregar logo del Brand Kit" onClick={() => addLayer({ id: crypto.randomUUID(), name: "Logo de marca", type: "image", locked: false, visible: true, src: project.brand.logo!, style: logoStyleSchema.parse({}) })}><Layers3 size={15} /><span>Logo de marca</span></button>}<button type="button" aria-label={hasSubjectMask(project.composition) ? "Ajustar recorte del sujeto" : "Recortar sujeto"} title="Crear o ajustar la máscara del sujeto" onClick={() => setMaskOpen(true)}><Scissors size={16} /><span>{hasSubjectMask(project.composition) ? "Ajustar recorte" : "Recortar sujeto"}</span></button><button type="button" aria-pressed={layersOpen} title="Mostrar u ocultar panel de capas" aria-label="Panel de capas" onClick={() => setLayersOpen(!layersOpen)}><Layers3 size={16} /><span>Capas</span></button><button type="button" aria-label="Ajuste automático a guías" title="Ajuste a centro, márgenes y otras capas · Alt para omitir al arrastrar" aria-pressed={snapping} onClick={() => setSnapping(!snapping)}><Magnet size={16} /><span>Ajustar a guías</span></button><button type="button" aria-pressed={propertiesOpen} aria-label="Panel de propiedades" title="Mostrar u ocultar propiedades" onClick={() => { setPropertiesOpen(!propertiesOpen); setPropertiesCollapsed(false); setComparison(false); setClean(false); }}><SlidersHorizontal size={16} /><span>Propiedades</span></button></div><div className="post-stage-buttons">{generated && <button type="button" aria-pressed={comparison} onClick={() => setComparison(!comparison)}><Eye size={14} />{comparison ? "Volver al lienzo" : "Comparar"}</button>}<button type="button" aria-pressed={clean} onClick={() => { setComparison(false); setClean(!clean); }}>{clean ? "Mostrar controles" : "Vista limpia"}</button></div></>}>
          {comparison && generated ? <div className="post-compare"><figure><div><img src={mediaUrl(project.composition.productImage)} alt="Referencia original de Shopify" /></div><figcaption>Original Shopify</figcaption></figure><figure><div><img src={project.composition.generatedImage!} alt="Fotografía transformada por Magnific" /></div><figcaption>Generada con Magnific</figcaption></figure></div> : <CompositionPreview snapping={snapping} onGestureStart={history.begin} onGestureEnd={history.end} selectedLayerId={selectedLayerId} onSelectBackground={() => selectLayer(null)} showTools={false} guidesVisible={guides} composition={project.composition} brand={project.brand} onChange={clean ? undefined : onComposition} onSelectLayer={selectLayer} />}
          </CanvasViewport>
          {generating && <div className="post-generation-status" role="status"><LoaderCircle size={16} className="spin" /><div><strong>Magnific está creando tu imagen</strong><span>Una sola generación. Podés seguir ajustando texto y logo.</span></div></div>}
        </div>
        <footer className="post-stage-footer"><span>{dimensions.width} × {dimensions.height} px <b>·</b> {project.composition.format === "story" ? "Stories" : project.composition.format === "portrait" ? "Retrato" : "Cuadrado"}</span><div className="post-stage-meta">{generated && <span className="post-asset-state generated"><i />Imagen generada con IA</span>}{!comparison && !clean && <label className="post-guides-toggle"><input type="checkbox" checked={guides} onChange={(event) => setGuides(event.target.checked)} />Guías</label>}<span><CheckCheck size={13} />Texto y logo editables</span></div></footer>
      </div>
      <aside className="post-inspector">
        <div className="post-inspector-tabs" role="tablist" aria-label="Herramientas del posteo">{panels.map(({ id, label, icon: Icon }) => <button type="button" key={id} role="tab" id={`post-tab-${id}`} aria-controls={`post-panel-${id}`} aria-selected={panel === id} tabIndex={panel === id ? 0 : -1} onClick={() => selectPanel(id)} onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); const index = panels.findIndex((p) => p.id === id); const next = panels[(index + (event.key === "ArrowRight" ? 1 : -1) + panels.length) % panels.length]; selectPanel(next.id); document.getElementById(`post-tab-${next.id}`)?.focus(); }}><Icon size={17} /><span>{label}</span></button>)}</div>
        <div ref={inspectorContent} className="post-inspector-content" role="tabpanel" id={`post-panel-${panel}`} aria-labelledby={`post-tab-${panel}`}>
          {panel === "image" && <>
            <div className="post-panel-heading"><span className="post-section-kicker"><Sparkles size={12} aria-hidden="true" />IMAGEN CON IA</span><h3>{generated ? "Creá una nueva versión" : "Dale forma a tu idea"}</h3><p>{generated ? "Elegí el resultado que buscás y contanos tu idea." : "Elegí cómo mostrar el producto y describí la escena."}</p></div>
            <GenerationModeControls compact settings={settings} product={project.product} image={project.composition.productImage} disabled={busy || generating || pending} onChange={(generationSettings) => onProject({ generationSettings })} onError={onError}>
            <div className="post-scene-section"><label><span className="post-step-title"><i className="post-step-number" aria-hidden="true"><PencilLine size={14} /></i>Contanos tu idea</span><textarea rows={4} maxLength={1500} value={project.creativeBrief || ""} onChange={(event) => onProject({ creativeBrief: event.target.value })} placeholder={settings.creativeMode === "garment" ? "La prenda extendida sobre una mesa de mármol, con luz natural y sombras suaves…" : "Un corredor de concreto, luz lateral y un ambiente cinematográfico…"} /><span className="post-input-meta"><span>Describí el lugar, la luz y el estilo.</span><span>{(project.creativeBrief || "").length}/1500</span></span></label>
            {generated && <label>Ajustes para esta versión (opcional)<input maxLength={700} value={refinement} onChange={(event) => onRefinement(event.target.value)} placeholder="Más oscuro, más aire, otro entorno…" /></label>}
            </div></GenerationModeControls>
            <details className="post-customize"><summary><span className="post-customize-title"><SlidersHorizontal size={18} aria-hidden="true" /><span>Personalizar el resultado<small>Marca, estilo y formato</small></span></span><ChevronDown size={16} /></summary><div>
            <details className="post-advanced post-brand-options"><summary><span className="post-setting-label"><Layers3 size={15} aria-hidden="true" />Brand Kit</span><span>{project.brand.name}</span><ChevronDown size={14} /></summary><div>{brandControl}</div></details>
            <details className="post-advanced"><summary><span className="post-setting-label"><Palette size={15} aria-hidden="true" />Cambiar estilo</span><ChevronDown size={14} /></summary><div><p>{generated ? "Se aplica al generar otra versión." : "Probá la composición sin usar créditos."}</p><div className="post-segmented" role="group" aria-label="Estilo de la publicación">{([
              { layout: "editorial", title: "Foto protagonista", detail: "Foto grande y fondo oscuro", scale: 1 },
              { layout: "detail", title: "Fondo claro", detail: "Foto centrada y marco claro", scale: 1 },
              { layout: "minimal", title: "Más espacio libre", detail: "Foto pequeña y fondo amplio", scale: .65 },
            ] as const).map((style) => <button type="button" key={style.layout} disabled={busy || generating || pending} aria-pressed={project.composition.layout === style.layout} onClick={() => onComposition({ layout: style.layout, ...(!generated ? { background: style.layout === "detail" ? project.brand.colors[2] || "#eee9df" : project.brand.colors[0], textColor: style.layout === "detail" ? project.brand.colors[0] : project.brand.colors[2] || "#eee9df", imageScale: style.scale } : {}) })}><strong>{style.title}</strong><span>{style.detail}</span></button>)}</div></div></details>

            <details className="post-advanced"><summary><span className="post-setting-label"><Ratio size={15} aria-hidden="true" />Formato y composición</span><ChevronDown size={14} /></summary><div><label>Formato<select value={project.composition.format} onChange={(event) => onComposition({ format: event.target.value as Composition["format"] })}>{Object.entries(formats).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></label>{generated && <label>Ajuste de la imagen<select value={project.composition.imageFit || "cover"} onChange={(event) => onComposition({ imageFit: event.target.value as Composition["imageFit"] })}><option value="cover">Rellenar el lienzo · sin franjas</option><option value="contain">Mostrar imagen completa</option></select><span className="post-field-hint">Rellenar puede recortar los bordes si cambiás la proporción. No estira la imagen ni consume créditos.</span></label>}{!generated && <><label>Color del marco<input type="color" value={project.composition.background} onChange={(event) => onComposition({ background: event.target.value })} /></label><label>Escala de la fotografía<input type="range" min={.4} max={1.2} step={.02} value={project.composition.imageScale} onChange={(event) => onComposition({ imageScale: Number(event.target.value) })} /></label><button type="button" onClick={() => onComposition({ imageScale: .65 })}>Más espacio negativo</button><label className="post-upload-button"><Upload size={15} />Cargar fondo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onBackgroundUpload(file); }} /></label>{project.composition.backgroundImage && <button type="button" onClick={() => onComposition({ backgroundImage: null })}>Quitar fondo cargado</button>}</>}</div></details>
            </div></details>
            {generated && <button className="post-text-button" type="button" disabled={busy || generating} onClick={() => onComposition({ generatedImage: null, aiReviewed: false })}><RotateCcw size={14} aria-hidden="true" />Usar la fotografía original</button>}
            {project.generation && <details className="post-advanced post-task-info"><summary><span className="post-setting-label"><Info size={15} aria-hidden="true" />Información de la tarea</span><ChevronDown size={14} /></summary><div><small>{project.generation.taskId}</small><span>{project.generation.model === "nano-banana-pro" ? "Nano Banana Pro" : "Nano Banana Pro Flash"}. Consultar esta tarea no inicia otra generación.</span></div></details>}
          </>}
          {panel === "download" && <>
            <div className="post-panel-heading"><h3>Descargá tu posteo</h3><p>Descargá la imagen y llevate el caption. No se publica nada automáticamente.</p></div>
            <div className="post-output-info"><ImageIcon size={22} /><div><strong>{dimensions.width} × {dimensions.height} px</strong><span>Texto y logo incluidos en la descarga</span></div></div>
            <div className="post-segmented" role="group" aria-label="Formato de descarga">{([{ id: "png", title: "PNG", detail: "Máxima nitidez" }, { id: "jpeg", title: "JPG", detail: "Archivo liviano" }] as const).map((option) => <button type="button" key={option.id} aria-pressed={fileFormat === option.id} onClick={() => setFileFormat(option.id)}><strong>{option.title}</strong><span>{option.detail}</span></button>)}</div>
            {generated && <div className={`post-review ${needsReview ? "pending" : "done"}`}><div><Eye size={16} /><strong>Revisá la prenda antes de descargar</strong></div><p>Compará color, construcción y detalles con la foto original.</p><button type="button" className="post-text-button" onClick={() => setComparison(true)}>Ver comparación</button><label className="social-check"><input type="checkbox" checked={project.composition.aiReviewed} onChange={(event) => onComposition({ aiReviewed: event.target.checked })} />Revisé la prenda y apruebo el resultado</label></div>}
            <section className="post-caption"><div className="post-caption-heading"><h4>Caption para redes</h4><div className="post-language" role="group" aria-label="Idioma del caption"><button type="button" aria-pressed={language === "es"} onClick={() => setLanguage("es")}>ES</button><button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button></div></div><textarea aria-label={language === "es" ? "Caption en español" : "Caption en inglés"} maxLength={2200} rows={4} value={project.concept.caption[language]} onChange={(event) => onProject({ concept: { ...project.concept, caption: { ...project.concept.caption, [language]: event.target.value } } })} /><button type="button" onClick={() => void copyCaption()}><Copy size={14} />Copiar caption bilingüe</button></section>
            <details className="post-advanced"><summary><span className="post-setting-label"><Save size={15} aria-hidden="true" />Conservar una copia editable</span><ChevronDown size={14} /></summary><div><p>Guardá en este navegador o descargá el proyecto para importarlo después con todas sus capas.</p><button type="button" onClick={onSave}><Save size={14} />Guardar proyecto</button><button type="button" onClick={onProjectDownload}><Download size={14} />Descargar proyecto JSON</button></div></details>
          </>}
        </div>
        {panel === "image" && <footer className="post-inspector-footer">
            <div className="post-generate-heading"><span className="post-step-title"><i className="post-step-number" aria-hidden="true"><Sparkles size={14} /></i>Generá tu imagen</span><span>1 imagen por clic</span></div>
            <label className="post-model-choice"><span className="post-setting-label"><Cpu size={14} aria-hidden="true" />Modelo de IA</span><select disabled={busy || generating || pending} value={settings.model} onChange={(event) => onProject({ generationSettings: { ...settings, model: event.target.value as typeof settings.model } })}><option value="auto">Automático · según las referencias</option><option value="nano-banana-pro-flash">Nano Banana Pro Flash · hasta 3 fotos</option><option value="nano-banana-pro">Nano Banana Pro · hasta 14 fotos</option></select></label>

            <div className="post-credit-note"><span>{pending ? "Consultar no genera otra imagen" : `${plan.model === "nano-banana-pro" ? "Nano Banana Pro" : "Nano Banana Pro Flash"} · 1 imagen · 1K`}</span><strong><Coins size={12} aria-hidden="true" />{pending ? "Sin nuevos créditos" : plan.model === "nano-banana-pro" ? "Usa créditos Pro" : "Usa créditos Flash"}</strong></div>
            <button type="button" className="social-primary post-generate-button" disabled={busy || generating || (!pending && missingModel)} onClick={onGenerate}>{generating || busy ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{generating ? "Generando imagen…" : pending ? "Consultar resultado" : generated ? "Generar otra versión" : "Generar imagen"}</button>

          {missingModel && !pending && <p className="post-field-hint">Agregá una foto o describí la nueva persona para generar.</p>}
        </footer>}
        {panel === "download" && <footer className="post-inspector-footer">
            {needsReview && <button type="button" className="post-text-button" onClick={() => { setComparison(true); inspectorContent.current?.querySelector(".post-review")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><Eye size={14} />Revisá y aprobá la prenda para descargar</button>}
            <button type="button" className="social-primary post-download-button" disabled={busy || generating || pending || needsReview} onClick={() => void onExport(fileFormat)}>{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowDownToLine size={17} />}Descargar {fileFormat === "png" ? "PNG" : "JPG"}</button>
            {pending && <p className="post-field-hint">Primero recuperá la imagen pendiente desde Imagen.</p>}
        </footer>}
      </aside>
    </div>
    <SubjectMaskEditor open={maskOpen} onOpenChange={setMaskOpen} controls={false} composition={project.composition} brand={project.brand} onChange={onComposition} onError={onError} />
    <Dialog open={confirmBack} onOpenChange={setConfirmBack}><DialogContent className="post-leave-dialog"><DialogHeader><DialogTitle>Tenés cambios sin guardar</DialogTitle><DialogDescription>Guardá el proyecto para conservar la imagen, el texto y el logo antes de volver al brief.</DialogDescription></DialogHeader><div className="post-leave-actions"><button type="button" onClick={() => setConfirmBack(false)}>Seguir editando</button><button type="button" onClick={() => { setConfirmBack(false); onBack(); }}>Volver sin guardar</button><button type="button" className="social-primary" disabled={busy} onClick={async () => { const saved = await onSave(); if (saved) { setConfirmBack(false); onBack(); } }}>Guardar y volver</button></div></DialogContent></Dialog>
  </section>;
}
