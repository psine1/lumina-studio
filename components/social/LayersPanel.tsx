"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Copy, Eye, EyeOff, GripHorizontal, ImageIcon, Layers3, LockKeyhole, LockKeyholeOpen, Scissors, Trash2, Type } from "lucide-react";
import type { OverlayLayer } from "@/lib/social/schema";
import { compositionStack } from "@/lib/social/layers";

type Props = {
  layers: OverlayLayer[]; selectedId: string | null;
  maskReady?: boolean; maskStale?: boolean;
  onLock: (id: string) => void;
  onEditMask?: () => void;
  onSelect: (id: string | null) => void; onToggle: (id: string) => void;
  onDuplicate: (id: string) => void; onRemove: (id: string) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
};

export function LayersPanel({ layers, selectedId, maskReady = false, maskStale = false, onLock, onEditMask, onSelect, onToggle, onDuplicate, onRemove, onReorder }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const stack = compositionStack(layers, maskReady);
  const selectedLocked = layers.find((layer) => layer.id === selectedId)?.locked;
  const selectedIndex = stack.findIndex((entry) => entry.type === "layer" && entry.layer.id === selectedId);
  useEffect(() => {
    const element = panel.current, parent = element?.parentElement;
    if (!element || !parent) return;
    const observer = new ResizeObserver(() => setPosition((current) => current ? { x: Math.max(8, Math.min(current.x, parent.clientWidth - element.offsetWidth - 8)), y: Math.max(8, Math.min(current.y, parent.clientHeight - element.offsetHeight - 8)) } : current));
    observer.observe(parent); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={panel} data-viewport-ui className={`canvas-layers-panel ${collapsed ? "collapsed" : ""}`} style={position ? { left: position.x, top: position.y, right: "auto" } : undefined} aria-label="Panel de capas">
    <div className="canvas-layers-header"
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
        const rect = panel.current!.getBoundingClientRect(), bounds = panel.current!.parentElement!.getBoundingClientRect();
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, left: rect.left - bounds.left, top: rect.top - bounds.top };
      }} onPointerMove={(event) => {
        if (!drag.current || !panel.current) return;
        const parent = panel.current.parentElement!;
        setPosition({ x: Math.max(8, Math.min(drag.current.left + event.clientX - drag.current.x, parent.clientWidth - panel.current.offsetWidth - 8)), y: Math.max(8, Math.min(drag.current.top + event.clientY - drag.current.y, parent.clientHeight - panel.current.offsetHeight - 8)) });
      }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
      <Layers3 size={15} /><strong>Capas</strong><span>{layers.length}</span><GripHorizontal size={14} className="layers-grip" aria-hidden="true" /><button type="button" aria-label={collapsed ? "Expandir capas" : "Colapsar capas"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><ChevronDown size={15} /></button>
    </div>
    {!collapsed && <>
      {onEditMask && <button type="button" className="canvas-mask-action" onClick={onEditMask}><Scissors size={15} /><span>{maskReady ? "Ajustar recorte del sujeto" : maskStale ? "Actualizar recorte del sujeto" : "Crear máscara del sujeto"}</span></button>}
      <div className="canvas-layers-list" role="group" aria-label="Capas, de arriba hacia abajo">
        {[...stack].reverse().map((entry) => {
          if (entry.type === "subject") return <div key="subject-mask" className="canvas-subject-layer"><span className="canvas-layer-thumbnail"><Scissors size={16} /></span><span><strong>Sujeto · máscara</strong><small>Lo de abajo queda detrás</small></span><LockKeyhole size={12} aria-hidden="true" /></div>;
          const layer = entry.layer;
          return <div className={`canvas-layer-row ${selectedId === layer.id ? "selected" : ""} ${!layer.visible ? "hidden-layer" : ""}`} key={`layer-${layer.id}`}>
          <button type="button" className="canvas-layer-select" aria-pressed={selectedId === layer.id} onClick={() => onSelect(layer.id)}>
            <span className="canvas-layer-thumbnail">{layer.type === "text" ? <Type size={17} /> : <img src={layer.src} alt="" />}</span>
            <span><strong>{layer.name}</strong><small>{layer.type === "text" ? layer.text || "Texto vacío" : "Imagen"}{maskReady ? layer.style.behindSubject ? " · detrás" : " · delante" : ""}</small></span>
          </button>
          <button type="button" aria-label={`${layer.locked ? "Desbloquear" : "Bloquear"} ${layer.name}`} title={layer.locked ? "Desbloquear capa" : "Bloquear capa"} aria-pressed={layer.locked} onClick={() => onLock(layer.id)}>{layer.locked ? <LockKeyhole size={14} /> : <LockKeyholeOpen size={14} />}</button>
          <button type="button" aria-label={`${layer.visible ? "Ocultar" : "Mostrar"} ${layer.name}`} title={layer.visible ? "Ocultar capa" : "Mostrar capa"} disabled={layer.locked} onClick={() => onToggle(layer.id)}>{layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
        </div>; })}
        <button type="button" className={`canvas-background-layer ${selectedId === null ? "selected" : ""}`} onClick={() => onSelect(null)}><ImageIcon size={16} /><span>Imagen de fondo</span><LockKeyhole size={12} /></button>
      </div>
      {maskStale && <p className="canvas-mask-notice">Actualizá el recorte: la imagen o el formato cambió. Por ahora todas las capas se muestran delante.</p>}
      <div className="canvas-layer-actions" role="toolbar" aria-label="Acciones de la capa seleccionada">
        <button type="button" aria-label="Subir capa" title="Subir capa" disabled={selectedLocked || selectedIndex < 0 || selectedIndex === stack.length - 1} onClick={() => selectedId && onReorder(selectedId, "up")}><ArrowUp size={15} /></button>
        <button type="button" aria-label="Bajar capa" title="Bajar capa" disabled={selectedLocked || selectedIndex <= 0} onClick={() => selectedId && onReorder(selectedId, "down")}><ArrowDown size={15} /></button>
        <button type="button" aria-label="Duplicar capa" title="Duplicar capa" disabled={selectedLocked || selectedIndex < 0 || layers.length >= 40} onClick={() => selectedId && onDuplicate(selectedId)}><Copy size={14} /></button>
        <button type="button" aria-label="Eliminar capa" title="Eliminar capa" disabled={selectedLocked || selectedIndex < 0} onClick={() => selectedId && onRemove(selectedId)}><Trash2 size={14} /></button>
      </div>
    </>}
  </div>;
}
