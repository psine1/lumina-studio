"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Hand, Maximize2, Minimize2, MousePointer2, ZoomIn, ZoomOut } from "lucide-react";
import { zoomViewport } from "@/lib/social/viewport";

type Props = { width: number; height: number; children: ReactNode; toolbarActions?: ReactNode; floatingPanel?: ReactNode };

export function CanvasViewport({ width, height, children, toolbarActions, floatingPanel }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [size, setSize] = useState({ width: 800, height: 550 });
  const [zoom, setZoom] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hand, setHand] = useState(false), [space, setSpace] = useState(false);
  const [expanded, setExpanded] = useState(false), [dragging, setDragging] = useState(false);
  const fit = Math.min((size.width - 48) / width, (size.height - 48) / height, 1);
  const scale = zoom ?? Math.max(.01, fit);
  const moving = hand || space;
  const view = useRef({ scale, pan });
  useEffect(() => { view.current = { scale, pan }; }, [scale, pan]);

  function adjustZoom(next: number, anchor = { x: 0, y: 0 }) {
    const current = view.current;
    const updated = zoomViewport(current.scale, current.pan, next, anchor);
    view.current = updated;
    setZoom(updated.scale); setPan(updated.pan);
  }
  function reset() { setZoom(null); setPan({ x: 0, y: 0 }); }

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    function wheel(event: WheelEvent) {
      if ((event.target as HTMLElement).closest?.("[data-viewport-ui]")) return;
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const bounds = element!.getBoundingClientRect();
      adjustZoom(view.current.scale * Math.exp(-event.deltaY * .003), { x: event.clientX - bounds.left - bounds.width / 2, y: event.clientY - bounds.top - bounds.height / 2 });
    }
    element.addEventListener("wheel", wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener("wheel", wheel); };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", escape); };
  }, [expanded]);

  return <div className={`post-viewport-shell ${expanded ? "expanded" : ""}`}>
    <div className="post-viewport-toolbar" role="toolbar" aria-label="Herramientas del lienzo">
      <button type="button" aria-label="Seleccionar texto o logo" title="Seleccionar" aria-pressed={!hand} onClick={() => setHand(false)}><MousePointer2 size={15} /></button>
      <button type="button" aria-label="Mano para desplazar la vista" title="Mano · también podés mantener Espacio sobre el lienzo" aria-pressed={hand} onClick={() => setHand(!hand)}><Hand size={15} /></button>
      <button type="button" aria-label="Alejar" disabled={scale <= .05} onClick={() => adjustZoom(scale / 1.25)}><ZoomOut size={15} /></button>
      <select aria-label="Zoom del lienzo" value={zoom === null ? "fit" : String(zoom)} onChange={(event) => event.target.value === "fit" ? reset() : adjustZoom(Number(event.target.value))}>
        <option value="fit">Ajustar · {Math.round(fit * 100)}%</option>
        {zoom !== null && ![.25, .5, 1, 1.5, 2, 3, 4].includes(zoom) && <option value={zoom}>{Math.round(zoom * 100)}%</option>}
        {[.25, .5, 1, 1.5, 2, 3, 4].map((value) => <option value={value} key={value}>{value * 100}%</option>)}
      </select>
      <button type="button" aria-label="Acercar" disabled={scale >= 4} onClick={() => adjustZoom(scale * 1.25)}><ZoomIn size={15} /></button>
      <button type="button" onClick={reset}>Ajustar</button>
      <button type="button" aria-label={expanded ? "Cerrar vista ampliada" : "Ampliar lienzo"} aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}{expanded ? "Cerrar" : "Ampliar"}</button>
      {toolbarActions && <div className="post-viewport-actions">{toolbarActions}</div>}
    </div>
    <div ref={viewport} className={`post-viewport ${moving ? "hand" : ""} ${dragging ? "dragging" : ""}`} tabIndex={0} aria-label="Lienzo. Usá Mano para desplazar, Control o Comando más rueda para zoom, y Espacio para activar la mano temporalmente."
      onBlur={() => setSpace(false)}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).matches("input, textarea, select, button, [contenteditable=true], [role=button]")) return;
        if (event.code === "Space") { event.preventDefault(); setSpace(true); }
        if (event.key === "+" || event.key === "=") { event.preventDefault(); adjustZoom(scale * 1.25); }
        if (event.key === "-") { event.preventDefault(); adjustZoom(scale / 1.25); }
        if (event.key === "0") { event.preventDefault(); reset(); }
      }} onKeyUp={(event) => { if (event.code === "Space") { event.preventDefault(); setSpace(false); } }}
      onPointerDownCapture={(event) => {
        if ((event.target as HTMLElement).closest("[data-viewport-ui]")) return;
        if ((!moving && event.button !== 1) || (event.button !== 0 && event.button !== 1)) return;
        event.preventDefault(); event.stopPropagation(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, left: pan.x, top: pan.y }; setDragging(true);
      }} onPointerMove={(event) => { if (drag.current) setPan({ x: drag.current.left + event.clientX - drag.current.x, y: drag.current.top + event.clientY - drag.current.y }); }}
      onPointerUp={() => { drag.current = null; setDragging(false); }} onPointerCancel={() => { drag.current = null; setDragging(false); }} onLostPointerCapture={() => { drag.current = null; setDragging(false); }}>
      <div className="post-canvas-position" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}><div className="post-canvas-content" style={{ width, height, transform: `scale(${scale})`, "--view-scale": scale } as CSSProperties}>{children}</div></div>
      {floatingPanel}
    </div>
    <div className="post-viewport-hint">{moving ? "Arrastrá para mover la vista" : "Ctrl / ⌘ + rueda: zoom · Mano o Espacio: mover · 0: ajustar"}</div>
  </div>;
}
