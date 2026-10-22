"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { Brush, Eraser, Eye, ImageIcon, Layers3, LoaderCircle, Redo2, Scissors, Undo2, WandSparkles } from "lucide-react";
import { type Brand, type Composition } from "@/lib/social/schema";
import { hasSubjectMask, renderComposition, subjectMaskKey } from "@/lib/social/composition";
import { confidenceAlpha, foregroundConfidence, refineMaskAlpha } from "@/lib/social/mask";
import { EditHistory } from "@/lib/social/history";
import { CanvasViewport } from "./CanvasViewport";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = { open?: boolean; onOpenChange?: (open: boolean) => void; controls?: boolean; composition: Composition; brand: Brand; onChange: (patch: Partial<Composition>) => void; onError: (message: string) => void };
type View = "overlay" | "mask" | "cutout";
export function SubjectMaskEditor({ open: controlledOpen, onOpenChange, controls = true, composition, brand, onChange, onError }: Props) {
  const [localOpen, setLocalOpen] = useState(false), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const open = controlledOpen ?? localOpen;
  const [erase, setErase] = useState(false), [size, setSize] = useState(35), [hardness, setHardness] = useState(75);
  const [view, setView] = useState<View>("overlay"), [overlayOpacity, setOverlayOpacity] = useState(50);
  const [shift, setShift] = useState(0), [feather, setFeather] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 1080, height: 1920 });
  const [hasPixels, setHasPixels] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [history] = useState(() => new EditHistory<ImageData | null>(null, Object.is, 8));
  useSyncExternalStore(history.subscribe, history.getVersion, history.getVersion);
  const preview = useRef<HTMLCanvasElement>(null), mask = useRef<HTMLCanvasElement | null>(null), photo = useRef<HTMLCanvasElement | null>(null);
  const overlay = useRef<HTMLCanvasElement | null>(null);
  const sourceKey = useRef("");
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const valid = hasSubjectMask(composition);
  const setOpen = (value: boolean) => { setReady(false); setCursor(null); setLocalOpen(value); onOpenChange?.(value); };
  const redraw = useCallback(() => {
    const canvas = preview.current, source = photo.current, selection = mask.current;
    if (!canvas || !source || !selection) return;
    const ctx = canvas.getContext("2d")!; ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (view === "mask") { ctx.fillStyle = "black"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(selection, 0, 0); return; }
    ctx.drawImage(source, 0, 0);
    if (view === "cutout") { ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(selection, 0, 0); ctx.globalCompositeOperation = "source-over"; return; }
    if (!overlay.current) overlay.current = document.createElement("canvas");
    const tint = overlay.current;
    if (tint.width !== canvas.width || tint.height !== canvas.height) { tint.width = canvas.width; tint.height = canvas.height; }
    const paint = tint.getContext("2d")!; paint.globalCompositeOperation = "source-over"; paint.clearRect(0, 0, tint.width, tint.height); paint.drawImage(selection, 0, 0); paint.globalCompositeOperation = "source-in";
    paint.fillStyle = `rgba(50,240,200,${overlayOpacity / 100})`; paint.fillRect(0, 0, tint.width, tint.height); ctx.drawImage(tint, 0, 0);
  }, [view, overlayOpacity]);
  useEffect(() => { redraw(); }, [redraw]);
  function record() {
    if (!mask.current) return;
    const data = mask.current.getContext("2d")!.getImageData(0, 0, mask.current.width, mask.current.height);
    history.commit(data); setHasPixels(data.data.some((value, index) => index % 4 === 3 && value > 0));
  }
  function restore(direction: "undo" | "redo") {
    const data = history[direction](); if (!data || !mask.current) return;
    mask.current.getContext("2d")!.putImageData(data, 0, 0); setHasPixels(data.data.some((value, index) => index % 4 === 3 && value > 0)); redraw();
  }
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function prepare() {
      const source = document.createElement("canvas");
      await renderComposition(source, { ...composition, layers: [], text: "", logoVisible: false, subjectMask: null }, brand);
      const selection = document.createElement("canvas"); selection.width = source.width; selection.height = source.height;
      if (valid) { const image = new Image(); image.src = composition.subjectMask!; await image.decode(); selection.getContext("2d")!.drawImage(image, 0, 0, source.width, source.height); }
      if (cancelled || !preview.current) return;
      sourceKey.current = subjectMaskKey(composition); photo.current = source; mask.current = selection;
      preview.current.width = source.width; preview.current.height = source.height; setDimensions({ width: source.width, height: source.height });
      const data = selection.getContext("2d")!.getImageData(0, 0, source.width, source.height);
      history.reset(data); setHasPixels(data.data.some((value, index) => index % 4 === 3 && value > 0)); setReady(true); redraw();
    }
    void prepare().catch(() => { if (!cancelled) onError("No se pudo abrir el recorte."); });
    return () => { cancelled = true; dragging.current = null; history.reset(null); };
  // The dialog edits a snapshot; opening prepares it and saving commits it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  async function detect() {
    if (!photo.current || !mask.current) return;
    setBusy(true);
    try {
      const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm");
      const segmenter = await ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite" }, runningMode: "IMAGE", outputCategoryMask: false, outputConfidenceMasks: true });
      try {
        const labels = segmenter.getLabels();
        segmenter.segment(photo.current, (result) => {
          const maps = result.confidenceMasks; if (!maps?.length) throw new Error("No se obtuvo una máscara.");
          const alpha = confidenceAlpha(foregroundConfidence(maps.map((item) => item.getAsFloat32Array()), labels));
          const small = document.createElement("canvas"); small.width = maps[0].width; small.height = maps[0].height;
          const context = small.getContext("2d")!, pixels = context.createImageData(small.width, small.height);
          for (let i = 0; i < alpha.length; i++) { pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = 255; pixels.data[i * 4 + 3] = alpha[i]; }
          context.putImageData(pixels, 0, 0);
          const target = mask.current!, ctx = target.getContext("2d")!; ctx.clearRect(0, 0, target.width, target.height); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(small, 0, 0, target.width, target.height);
        });
      } finally { segmenter.close(); }
      record(); redraw();
    } catch { onError("No se pudo detectar el sujeto. Revisá la conexión o corregí la silueta con el pincel."); }
    finally { setBusy(false); }
  }
  function paint(event: PointerEvent<HTMLCanvasElement>, start = false) {
    if (!ready || busy || !mask.current || (!start && !dragging.current)) return;
    const bounds = event.currentTarget.getBoundingClientRect(), target = mask.current;
    const point = { x: (event.clientX - bounds.left) * target.width / bounds.width, y: (event.clientY - bounds.top) * target.height / bounds.height };
    setCursor(point);
    if (start) { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); dragging.current = point; }
    const ctx = target.getContext("2d")!, previous = dragging.current!;
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y), steps = Math.max(1, Math.ceil(distance / Math.max(1, size * .12)));
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    for (let i = 1; i <= steps; i++) {
      const x = previous.x + (point.x - previous.x) * i / steps, y = previous.y + (point.y - previous.y) * i / steps, radius = size / 2;
      if (hardness < 100) { const gradient = ctx.createRadialGradient(x, y, radius * hardness / 100, x, y, radius); gradient.addColorStop(0, "white"); gradient.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = gradient; } else ctx.fillStyle = "white";
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over"; dragging.current = point; redraw();
  }
  function finishPaint() { if (!dragging.current) return; dragging.current = null; record(); }
  function refine() {
    if (!mask.current || !hasPixels) return;
    const ctx = mask.current.getContext("2d")!, data = ctx.getImageData(0, 0, mask.current.width, mask.current.height);
    const alpha = new Uint8ClampedArray(data.width * data.height); for (let i = 0; i < alpha.length; i++) alpha[i] = data.data[i * 4 + 3];
    const refined = refineMaskAlpha(alpha, data.width, data.height, shift, feather);
    for (let i = 0; i < refined.length; i++) { data.data[i * 4] = data.data[i * 4 + 1] = data.data[i * 4 + 2] = 255; data.data[i * 4 + 3] = refined[i]; }
    ctx.putImageData(data, 0, 0); record(); redraw();
  }
  function save() {
    if (!mask.current || !hasPixels) return;
    if (sourceKey.current !== subjectMaskKey(composition)) { onError("La imagen cambió mientras editabas. Cerrá y volvé a abrir el recorte para trabajar sobre el resultado actual."); return; }
    onChange({ subjectMask: mask.current.toDataURL("image/png"), subjectMaskKey: sourceKey.current }); setOpen(false);
  }
  return <>{controls && <section className="subject-mask-controls"><strong>Capas y profundidad</strong><p>{valid ? "Recorte listo. Elegí qué elementos quedan detrás del sujeto." : "Prepará el recorte para colocar texto o imágenes detrás del sujeto."}</p><button type="button" onClick={() => setOpen(true)}><Scissors size={15} />{valid ? "Ajustar recorte" : "Recortar sujeto"}</button></section>}
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}><DialogContent className="subject-mask-dialog mask-refine-dialog" showCloseButton={!busy} onKeyDown={(event) => {
      if (busy || (!event.ctrlKey && !event.metaKey) || (event.target as Element).matches("textarea, input:not([type=range])")) return;
      if (["z", "y"].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation(); finishPaint(); restore(event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo"); }
    }}><DialogHeader><DialogTitle>Recortar sujeto</DialogTitle><DialogDescription>Detectá la persona, acercate a los bordes y corregí con el pincel. El blanco de la máscara queda delante de las capas.</DialogDescription></DialogHeader>
      <div className="mask-refine-workspace">
        <div className="mask-refine-viewport"><CanvasViewport width={dimensions.width} height={dimensions.height} allowExpand={false} selectionLabel="Pincel de corrección" toolbarActions={<div className="mask-view-modes" role="group" aria-label="Vista del recorte">{([{ id: "overlay", label: "Superposición", icon: Eye }, { id: "mask", label: "Máscara", icon: Layers3 }, { id: "cutout", label: "Recorte", icon: ImageIcon }] as const).map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-pressed={view === id} disabled={busy} onClick={() => setView(id)}><Icon size={14} />{label}</button>)}</div>}><div className="mask-paint-surface" style={{ width: dimensions.width, height: dimensions.height }}><canvas ref={preview} className="subject-mask-canvas" onPointerDown={(event) => paint(event, true)} onPointerMove={(event) => { paint(event); if (!dragging.current) { const bounds = event.currentTarget.getBoundingClientRect(); setCursor({ x: (event.clientX - bounds.left) * dimensions.width / bounds.width, y: (event.clientY - bounds.top) * dimensions.height / bounds.height }); } }} onPointerLeave={() => { if (!dragging.current) setCursor(null); }} onPointerUp={finishPaint} onPointerCancel={finishPaint} onLostPointerCapture={finishPaint} />{cursor && ready && !busy && <i className="mask-brush-cursor" style={{ left: cursor.x - size / 2, top: cursor.y - size / 2, width: size, height: size }} aria-hidden="true" />}</div></CanvasViewport></div>
        <aside className="mask-refine-tools">
          <div className="mask-tool-section"><h3><WandSparkles size={15} />Detección</h3><p>Incluye pelo, piel y ropa. Podés corregir el resultado a mano.</p><button type="button" className="social-primary" disabled={!ready || busy} onClick={() => void detect()}>{busy ? <LoaderCircle size={15} className="spin" /> : <WandSparkles size={15} />}{busy ? "Detectando sujeto…" : hasPixels ? "Volver a detectar" : "Detectar sujeto"}</button></div>
          <div className="mask-tool-section"><h3><Brush size={15} />Corregir a mano</h3><div className="subject-mask-actions"><button type="button" disabled={!ready || busy} aria-pressed={!erase} onClick={() => setErase(false)}><Brush size={15} />Incluir</button><button type="button" disabled={!ready || busy} aria-pressed={erase} onClick={() => setErase(true)}><Eraser size={15} />Borrar</button></div><label>Tamaño <output>{size} px</output><input disabled={busy} type="range" min={2} max={180} value={size} onChange={(event) => setSize(Number(event.target.value))} /></label><label>Dureza <output>{hardness}%</output><input disabled={busy} type="range" min={0} max={100} value={hardness} onChange={(event) => setHardness(Number(event.target.value))} /></label><div className="subject-mask-actions"><button type="button" disabled={busy || !history.canUndo} title="Deshacer · Ctrl/⌘ + Z" onClick={() => restore("undo")}><Undo2 size={15} />Deshacer</button><button type="button" disabled={busy || !history.canRedo} title="Rehacer" onClick={() => restore("redo")}><Redo2 size={15} />Rehacer</button></div></div>
          <details className="mask-tool-section"><summary>Refinar bordes</summary><label>Expandir / contraer <output>{shift} px</output><input disabled={busy} type="range" min={-6} max={6} value={shift} onChange={(event) => setShift(Number(event.target.value))} /></label><label>Suavizado <output>{feather} px</output><input disabled={busy} type="range" min={0} max={6} value={feather} onChange={(event) => setFeather(Number(event.target.value))} /></label><button type="button" disabled={busy || !ready || !hasPixels || (!shift && !feather)} onClick={refine}>Aplicar a bordes</button><p>Se aplica al recorte actual. Podés deshacerlo.</p></details>
          {view === "overlay" && <div className="mask-tool-section"><label>Opacidad de la guía verde <output>{overlayOpacity}%</output><input disabled={busy} type="range" min={10} max={90} value={overlayOpacity} onChange={(event) => setOverlayOpacity(Number(event.target.value))} /></label></div>}
        </aside>
      </div>
      <footer className="mask-refine-footer"><span>{hasPixels ? "Revisá pelo, manos y bordes de la prenda antes de guardar." : "Detectá el sujeto o pintá la zona que querés conservar."} · Sin créditos</span><div className="subject-mask-actions"><button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button><button type="button" className="social-primary" disabled={!ready || busy || !hasPixels} onClick={save}><Scissors size={15} />Guardar recorte</button></div></footer>
    </DialogContent></Dialog>
  </>;
}
