"use client";

import { useState } from "react";
import { Copy, LoaderCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CompositionPreview } from "./CompositionPreview";
import { copyDesign } from "@/lib/social/design";
import { compositionLayers } from "@/lib/social/layers";
import { hasSubjectMask } from "@/lib/social/composition";
import { formats, type Project } from "@/lib/social/schema";

type Props = {
  source: Project;
  targets: Project[];
  busy: boolean;
  onClose: () => void;
  onApply: (ids: string[]) => Promise<void>;
};

export function ApplyDesignDialog({ source, targets, busy, onClose, onApply }: Props) {
  const available = targets.filter(piece => piece.generation?.status !== "pending");
  const [selected, setSelected] = useState(() => available.map(piece => piece.id));
  const [showApplied, setShowApplied] = useState(true);
  const [error, setError] = useState("");
  const needsMask = compositionLayers(source.composition, source.brand).some(layer => layer.visible && layer.style.behindSubject);
  async function apply() {
    if (busy || !selected.length) return;
    setError("");
    try { await onApply(selected); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo aplicar el diseño. Reintentá."); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="apply-design-dialog" showCloseButton={!busy}>
    <DialogHeader><DialogTitle>Aplicar diseño a otras piezas</DialogTitle><DialogDescription>Copiá textos, imágenes superpuestas, logos y posiciones desde {source.product.title}. Cada pieza conserva su foto, encuadre y formato.</DialogDescription></DialogHeader>
    <div className="apply-design-options"><strong>{selected.length} de {targets.length} piezas seleccionadas</strong><button type="button" disabled={busy || !available.length} onClick={() => setSelected(selected.length === available.length ? [] : available.map(piece => piece.id))}>{selected.length === available.length ? "Deseleccionar todas" : "Seleccionar todas"}</button><div role="group" aria-label="Vista previa del diseño"><button type="button" aria-pressed={showApplied} disabled={busy} onClick={() => setShowApplied(true)}>Con este diseño</button><button type="button" aria-pressed={!showApplied} disabled={busy} onClick={() => setShowApplied(false)}>Diseño actual</button></div></div>
    <div className="apply-design-grid">{targets.map(piece => {
      const checked = selected.includes(piece.id);
      const pending = piece.generation?.status === "pending";
      const composition = showApplied && checked ? copyDesign(source, piece.composition) : piece.composition;
      return <label className={`apply-design-piece ${checked ? "selected" : ""}`} key={piece.id}>
        <input type="checkbox" checked={checked} disabled={busy || pending} aria-label={`Aplicar diseño a ${piece.product.title}`} onChange={event => setSelected(current => event.target.checked ? [...current, piece.id] : current.filter(id => id !== piece.id))} />
        <div className="apply-design-preview"><CompositionPreview composition={composition} brand={piece.brand} showTools={false} /></div>
        <strong>{piece.product.title}</strong><small>{pending ? "Generación pendiente" : formats[piece.composition.format].label}</small>
        {checked && needsMask && !hasSubjectMask(piece.composition) && <span className="apply-design-mask-note">Para colocar capas detrás del sujeto, recortalo en esta pieza.</span>}
      </label>;
    })}</div>
    <p className="apply-design-note">Se reemplazarán las capas de las piezas seleccionadas. Después podés ajustarlas por separado o deshacer la última aplicación. No usa créditos.</p>
    {error && <p className="apply-design-error" role="alert">{error}</p>}
    <div className="apply-design-actions"><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="social-primary" disabled={busy || !selected.length} onClick={() => void apply()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Copy size={15} />}{busy ? "Aplicando…" : `Aplicar a ${selected.length} ${selected.length === 1 ? "pieza" : "piezas"}`}</button></div>
  </DialogContent></Dialog>;
}
