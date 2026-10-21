"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { formats, type OverlayLayer, type Brand, type Composition } from "@/lib/social/schema";
import { renderComposition } from "@/lib/social/composition";
import { compositionLayers, patchCompositionLayer } from "@/lib/social/layers";
import { scaleLayerFromCorner, type ResizeCorner } from "@/lib/social/resize";
import type { LayerBox, OverlayGeometry } from "@/lib/social/overlays";

type Layer = string;
type Props = { composition: Composition; brand: Brand; onChange?: (patch: Partial<Composition>) => void; onSelectLayer?: (layer: Layer) => void; showTools?: boolean; guidesVisible?: boolean; selectedLayerId?: string | null; onSelectBackground?: () => void };

type HandleProps = {
  id: string; name: string; box: LayerBox; active: boolean; width: number; height: number;
  onSelect: (id: string) => void; onFinish: () => void;
  onStart: (event: PointerEvent<HTMLDivElement>, id: string, box: LayerBox) => void;
  onMove: (event: PointerEvent<HTMLDivElement>) => void;
  onKeyMove: (event: KeyboardEvent<HTMLDivElement>, id: string, box: LayerBox) => void;
  onStartResize: (event: PointerEvent<HTMLSpanElement>, id: string, box: LayerBox, corner: ResizeCorner) => void;
  onKeyResize: (event: KeyboardEvent<HTMLSpanElement>, id: string, box: LayerBox, corner: ResizeCorner) => void;
};
function LayerHandle({ id, name, box, active, width, height, onSelect, onFinish, onStart, onMove, onKeyMove, onStartResize, onKeyResize }: HandleProps) {
  const style: CSSProperties = { left: `${box.x / width * 100}%`, top: `${box.y / height * 100}%`, width: `${box.width / width * 100}%`, height: `${box.height / height * 100}%` };
  return <div className={`social-layer-handle ${active ? "selected" : ""}`} style={style} role="button" tabIndex={0} aria-label={`Mover ${name}. Arrastrá o usá las flechas; Shift mueve 10 píxeles.`} onFocus={() => onSelect(id)} onPointerDown={(event) => onStart(event, id, box)} onPointerMove={onMove} onPointerUp={onFinish} onPointerCancel={onFinish} onLostPointerCapture={onFinish} onKeyDown={(event) => onKeyMove(event, id, box)}><span>{name}</span>{active && (["nw", "ne", "sw", "se"] as const).map((corner) => <span key={corner} role="button" tabIndex={0} className={`social-resize-handle ${corner}`} aria-label={`Escalar ${name} desde la esquina ${corner === "nw" ? "superior izquierda" : corner === "ne" ? "superior derecha" : corner === "sw" ? "inferior izquierda" : "inferior derecha"}. Usá las flechas para cambiar el tamaño.`} title="Arrastrá para escalar proporcionalmente" onPointerDown={(event) => onStartResize(event, id, box, corner)} onKeyDown={(event) => onKeyResize(event, id, box, corner)} />)}</div>;
}

export function CompositionPreview({ composition, brand, onChange, onSelectLayer, showTools = true, guidesVisible, selectedLayerId, onSelectBackground }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null), container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ layer: Layer; x: number; y: number; box: LayerBox; corner?: ResizeCorner; original?: OverlayLayer } | null>(null);
  const [error, setError] = useState("");
  const [geometry, setGeometry] = useState<OverlayGeometry | null>(null);
  const [selected, setSelected] = useState<Layer>("legacy-text"), [guides, setGuides] = useState(true);
  const { width, height } = formats[composition.format];
  useEffect(() => {
    let stopped = false;
    if (canvas.current) void renderComposition(canvas.current, composition, brand, () => stopped).then((value) => { if (!stopped && value) { setGeometry(value); setError(""); } }).catch((failure: Error) => { if (!stopped) { setGeometry(null); setError(failure.message); } });
    return () => { stopped = true; };
  }, [composition, brand]);

  function move(layer: Layer, x: number, y: number, box: LayerBox) {
    const position = { x: Math.max(0, Math.min(1 - box.width / width, x / width)), y: Math.max(0, Math.min(1 - box.height / height, y / height)) };
    const target = compositionLayers(composition, brand).find((item) => item.id === layer);
    if (!target) return;
    onChange?.(patchCompositionLayer(composition, brand, layer, target.type === "text" ? { textStyle: { ...target.style, ...position } } : { logoStyle: { ...target.style, ...position } }));
  }
  function start(event: PointerEvent<HTMLDivElement>, layer: Layer, box: LayerBox) {
    if (event.button !== 0) return;
    event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(layer); onSelectLayer?.(layer); drag.current = { layer, x: event.clientX, y: event.clientY, box };
  }
  function applyScale(original: OverlayLayer, box: LayerBox, corner: ResizeCorner, dx: number, dy: number) {
    const resized = scaleLayerFromCorner(original, box, corner, dx, dy, width, height);
    onChange?.({ layers: compositionLayers(composition, brand).map((layer) => layer.id === original.id ? resized : layer) });
  }
  function startResize(event: PointerEvent<HTMLSpanElement>, layer: Layer, box: LayerBox, corner: ResizeCorner) {
    if (event.button !== 0) return;
    const original = compositionLayers(composition, brand).find((item) => item.id === layer);
    if (!original) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(layer); onSelectLayer?.(layer);
    drag.current = { layer, x: event.clientX, y: event.clientY, box: { ...box }, corner, original: structuredClone(original) };
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current, bounds = container.current?.getBoundingClientRect();
    if (!current || !bounds) return;
    if (current.corner && current.original) {
      applyScale(current.original, current.box, current.corner, (event.clientX - current.x) * width / bounds.width, (event.clientY - current.y) * height / bounds.height);
      return;
    }
    move(current.layer, current.box.x + (event.clientX - current.x) * width / bounds.width, current.box.y + (event.clientY - current.y) * height / bounds.height, current.box);
  }
  function keyMove(event: KeyboardEvent<HTMLDivElement>, layer: Layer, box: LayerBox) {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = directions[event.key]; if (!direction) return;
    event.preventDefault(); const step = event.shiftKey ? 10 : 1;
    move(layer, box.x + direction[0] * step, box.y + direction[1] * step, box);
  }
  function finishDrag() { drag.current = null; }
  function selectHandle(id: string) { setSelected(id); onSelectLayer?.(id); }
  function keyResize(event: KeyboardEvent<HTMLSpanElement>, layer: Layer, box: LayerBox, corner: ResizeCorner) {
    if (!["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const original = compositionLayers(composition, brand).find((item) => item.id === layer); if (!original) return;
    const amount = (event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? .1 : .02);
    applyScale(original, box, corner, (corner.endsWith("e") ? 1 : -1) * box.width * amount, (corner.startsWith("s") ? 1 : -1) * box.height * amount);
  }
  return <>
    <div ref={container} className="social-preview" style={{ aspectRatio: `${width}/${height}` }}>
      <canvas onPointerDown={() => onSelectBackground?.()} ref={canvas} aria-label="Vista previa de la composición" />
      {onChange && (guidesVisible ?? guides) && <div className="social-canvas-guides" aria-hidden="true"><i /><b /></div>}
      {!error && onChange && geometry?.layers?.map((layer) => <LayerHandle key={layer.id} {...layer} active={(selectedLayerId === undefined ? selected : selectedLayerId) === layer.id} width={width} height={height} onSelect={selectHandle} onFinish={finishDrag} onStart={start} onMove={pointerMove} onKeyMove={keyMove} onStartResize={startResize} onKeyResize={keyResize} />)}
      {error && <span className="social-preview-error">{error}</span>}
    </div>
    {onChange && showTools && <div className="social-preview-tools"><span>Arrastrá el texto o el logo. También podés moverlos con las flechas.</span><label><input type="checkbox" checked={guides} onChange={(event) => setGuides(event.target.checked)} />Guías</label></div>}
    {onChange && geometry?.textOverflow && <p className="social-text-overflow" role="alert">El texto excede el lienzo. Reducí el tamaño de fuente o aumentá el ancho del bloque antes de descargar.</p>}
  </>;
}
