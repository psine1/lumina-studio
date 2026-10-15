"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { formats, logoStyleSchema, textStyleSchema, type Brand, type Composition } from "@/lib/social/schema";
import { renderComposition } from "@/lib/social/composition";
import type { LayerBox, OverlayGeometry } from "@/lib/social/overlays";

type Layer = "text" | "logo";
type Props = { composition: Composition; brand: Brand; onChange?: (patch: Partial<Composition>) => void; onSelectLayer?: (layer: Layer) => void };

export function CompositionPreview({ composition, brand, onChange, onSelectLayer }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null), container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ layer: Layer; x: number; y: number; box: LayerBox } | null>(null);
  const [error, setError] = useState("");
  const [geometry, setGeometry] = useState<OverlayGeometry | null>(null);
  const [selected, setSelected] = useState<Layer>("text"), [guides, setGuides] = useState(true);
  const { width, height } = formats[composition.format];
  useEffect(() => {
    let stopped = false;
    if (canvas.current) void renderComposition(canvas.current, composition, brand, () => stopped).then((value) => { if (!stopped && value) { setGeometry(value); setError(""); } }).catch((failure: Error) => { if (!stopped) { setGeometry(null); setError(failure.message); } });
    return () => { stopped = true; };
  }, [composition, brand]);

  function move(layer: Layer, x: number, y: number, box: LayerBox) {
    const position = { x: Math.max(0, Math.min(1 - box.width / width, x / width)), y: Math.max(0, Math.min(1 - box.height / height, y / height)) };
    if (layer === "text") onChange?.({ textStyle: { ...textStyleSchema.parse(composition.textStyle || {}), ...position } });
    else onChange?.({ logoStyle: { ...logoStyleSchema.parse(composition.logoStyle || {}), ...position } });
  }
  function start(event: PointerEvent<HTMLDivElement>, layer: Layer, box: LayerBox) {
    if (event.button !== 0) return;
    event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(layer); onSelectLayer?.(layer); drag.current = { layer, x: event.clientX, y: event.clientY, box };
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current, bounds = container.current?.getBoundingClientRect();
    if (!current || !bounds) return;
    move(current.layer, current.box.x + (event.clientX - current.x) * width / bounds.width, current.box.y + (event.clientY - current.y) * height / bounds.height, current.box);
  }
  function keyMove(event: KeyboardEvent<HTMLDivElement>, layer: Layer, box: LayerBox) {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = directions[event.key]; if (!direction) return;
    event.preventDefault(); const step = event.shiftKey ? 10 : 1;
    move(layer, box.x + direction[0] * step, box.y + direction[1] * step, box);
  }
  function overlay(layer: Layer, box: LayerBox | null) {
    if (!box || !onChange) return null;
    const style: CSSProperties = { left: `${box.x / width * 100}%`, top: `${box.y / height * 100}%`, width: `${box.width / width * 100}%`, height: `${box.height / height * 100}%` };
    return <div key={layer} className={`social-layer-handle ${selected === layer ? "selected" : ""}`} style={style} role="button" tabIndex={0} aria-label={`Mover ${layer === "text" ? "texto" : "logo"}. Arrastrá o usá las flechas; Shift mueve 10 píxeles.`} onFocus={() => { setSelected(layer); onSelectLayer?.(layer); }} onPointerDown={(event) => start(event, layer, box)} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} onKeyDown={(event) => keyMove(event, layer, box)}><span>{layer === "text" ? "Texto" : "Logo"}</span></div>;
  }
  return <>
    <div ref={container} className="social-preview" style={{ aspectRatio: `${width}/${height}` }}>
      <canvas ref={canvas} aria-label="Vista previa de la composición" />
      {onChange && guides && <div className="social-canvas-guides" aria-hidden="true"><i /><b /></div>}
      {!error && geometry && <>{overlay("text", geometry.text)}{overlay("logo", geometry.logo)}</>}
      {error && <span className="social-preview-error">{error}</span>}
    </div>
    {onChange && <div className="social-preview-tools"><span>Arrastrá el texto o el logo. También podés moverlos con las flechas.</span><label><input type="checkbox" checked={guides} onChange={(event) => setGuides(event.target.checked)} />Guías</label></div>}
    {onChange && geometry?.textOverflow && <p className="social-text-overflow" role="alert">El texto excede el lienzo. Reducí el tamaño de fuente o aumentá el ancho del bloque antes de descargar.</p>}
  </>;
}
