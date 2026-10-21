"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, GripHorizontal, SlidersHorizontal, X } from "lucide-react";

type Props = { children: ReactNode; selectionId?: string; collapsed: boolean; onCollapse: () => void; onClose: () => void };

export function PropertiesPanel({ children, selectionId, collapsed, onCollapse, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => { content.current?.scrollTo({ top: 0 }); }, [selectionId]);
  useEffect(() => {
    const element = panel.current, parent = element?.parentElement;
    if (!element || !parent) return;
    const observer = new ResizeObserver(() => setPosition((current) => current ? { x: Math.max(8, Math.min(current.x, parent.clientWidth - element.offsetWidth - 8)), y: Math.max(8, Math.min(current.y, parent.clientHeight - element.offsetHeight - 8)) } : current));
    observer.observe(parent); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={panel} data-viewport-ui className={`canvas-properties-panel ${collapsed ? "collapsed" : ""}`} style={position ? { left: position.x, top: position.y } : undefined} aria-label="Panel de propiedades">
    <div className="canvas-properties-header"
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
      <SlidersHorizontal size={15} /><strong>Propiedades</strong><GripHorizontal size={14} className="properties-grip" aria-hidden="true" />
      <button type="button" aria-label={collapsed ? "Expandir propiedades" : "Colapsar propiedades"} aria-expanded={!collapsed} onClick={onCollapse}><ChevronDown size={15} /></button>
      <button type="button" aria-label="Cerrar propiedades" onClick={onClose}><X size={14} /></button>
    </div>
    <div ref={content} className="post-inspector-content canvas-properties-content" hidden={collapsed}>{children}</div>
  </div>;
}
