"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { formats, type Brand, type Composition } from "@/lib/social/schema";
import { hasSubjectMask, renderComposition, subjectMaskKey } from "@/lib/social/composition";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = { composition: Composition; brand: Brand; onChange: (patch: Partial<Composition>) => void; onError: (message: string) => void };
export function SubjectMaskEditor({ composition, brand, onChange, onError }: Props) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [erase, setErase] = useState(false), [size, setSize] = useState(35);
  const preview = useRef<HTMLCanvasElement>(null), mask = useRef<HTMLCanvasElement | null>(null), photo = useRef<HTMLCanvasElement | null>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const valid = hasSubjectMask(composition);
  function redraw() {
    const canvas = preview.current, source = photo.current, selection = mask.current;
    if (!canvas || !source || !selection) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(source, 0, 0);
    const tint = document.createElement("canvas"); tint.width = canvas.width; tint.height = canvas.height;
    const paint = tint.getContext("2d")!; paint.drawImage(selection, 0, 0); paint.globalCompositeOperation = "source-in";
    paint.fillStyle = "rgba(50,240,200,.55)"; paint.fillRect(0, 0, tint.width, tint.height); ctx.drawImage(tint, 0, 0);
  }
  useEffect(() => {
    if (!open) return;
    let cancelled = false; setReady(false);
    async function prepare() {
      const source = document.createElement("canvas");
      await renderComposition(source, { ...composition, text: "", logoVisible: false, subjectMask: null }, brand);
      const selection = document.createElement("canvas"); selection.width = source.width; selection.height = source.height;
      if (valid) {
        const image = new Image(); image.src = composition.subjectMask!; await image.decode(); selection.getContext("2d")!.drawImage(image, 0, 0, source.width, source.height);
      }
      if (cancelled || !preview.current) return;
      photo.current = source; mask.current = selection; preview.current.width = source.width; preview.current.height = source.height;
      setReady(true); redraw();
    }
    void prepare().catch(() => onError("No se pudo abrir el recorte."));
    return () => { cancelled = true; };
  // The dialog edits a snapshot; Save commits it to the project.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  async function detect() {
    if (!photo.current || !mask.current) return;
    setBusy(true);
    try {
      const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm");
      const segmenter = await ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite" }, runningMode: "IMAGE", outputCategoryMask: false, outputConfidenceMasks: true });
      try {
        segmenter.segment(photo.current, (result) => {
          const confidence = result.confidenceMasks?.[0];
          if (!confidence) throw new Error("No se obtuvo una máscara.");
          const values = confidence.getAsFloat32Array();
          const small = document.createElement("canvas"); small.width = confidence.width; small.height = confidence.height;
          const context = small.getContext("2d")!, pixels = context.createImageData(small.width, small.height);
          for (let i = 0; i < values.length; i++) { pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = 255; pixels.data[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, (values[i] - .2) / .6)) * 255); }
          context.putImageData(pixels, 0, 0);
          const target = mask.current!, ctx = target.getContext("2d")!; ctx.clearRect(0, 0, target.width, target.height); ctx.drawImage(small, 0, 0, target.width, target.height);
        });
      } finally { segmenter.close(); }
      redraw();
    } catch { onError("No se pudo detectar la modelo. Revisá tu conexión o marcá la silueta con el pincel."); }
    finally { setBusy(false); }
  }
  function paint(event: PointerEvent<HTMLCanvasElement>, start = false) {
    if (!ready || busy || !mask.current || (!start && !dragging.current)) return;
    const bounds = event.currentTarget.getBoundingClientRect(), target = mask.current;
    const point = { x: (event.clientX - bounds.left) * target.width / bounds.width, y: (event.clientY - bounds.top) * target.height / bounds.height };
    if (start) { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); dragging.current = point; }
    const ctx = target.getContext("2d")!; ctx.globalCompositeOperation = erase ? "destination-out" : "source-over"; ctx.strokeStyle = "white"; ctx.fillStyle = "white"; ctx.lineWidth = size; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(dragging.current!.x, dragging.current!.y); ctx.lineTo(point.x, point.y); ctx.stroke(); ctx.beginPath(); ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = "source-over";
    dragging.current = point; redraw();
  }
  return <section className="subject-mask-controls"><strong>Capas y profundidad</strong><p>{valid ? "Recorte listo. Elegí qué elementos quedan detrás de la modelo." : "Prepará el recorte para colocar texto o logo detrás de la modelo."}</p><button type="button" onClick={() => setOpen(true)}>{valid ? "Ajustar recorte de la modelo" : "Preparar recorte de la modelo"}</button>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}><DialogContent className="subject-mask-dialog"><DialogHeader><DialogTitle>Recorte de la modelo</DialogTitle><DialogDescription>La zona verde tapará los elementos que pongas detrás. Detectá la persona y corregí la silueta con el pincel. Procesamiento local, sin créditos; la primera detección descarga el motor.</DialogDescription></DialogHeader>
      <div className="subject-mask-actions"><button type="button" disabled={!ready || busy} onClick={() => void detect()}>{busy ? "Detectando…" : "Detectar modelo"}</button><button type="button" disabled={busy} aria-pressed={!erase} onClick={() => setErase(false)}>Incluir</button><button type="button" disabled={busy} aria-pressed={erase} onClick={() => setErase(true)}>Borrar</button><label>Pincel · {size} px<input type="range" min={5} max={160} value={size} onChange={(event) => setSize(Number(event.target.value))} /></label></div>
      <canvas ref={preview} className="subject-mask-canvas" style={{ aspectRatio: `${formats[composition.format].width}/${formats[composition.format].height}` }} onPointerDown={(event) => paint(event, true)} onPointerMove={(event) => paint(event)} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }} onLostPointerCapture={() => { dragging.current = null; }} />
      <div className="subject-mask-actions"><button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button><button type="button" className="social-primary" disabled={!ready || busy} onClick={() => { onChange({ subjectMask: mask.current!.toDataURL("image/png"), subjectMaskKey: subjectMaskKey(composition) }); setOpen(false); }}>Guardar recorte</button></div>
    </DialogContent></Dialog>
  </section>;
}
