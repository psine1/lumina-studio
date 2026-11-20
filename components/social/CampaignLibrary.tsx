"use client";

import { ArrowRight, Layers3, Plus, Trash2 } from "lucide-react";
import type { Campaign } from "@/lib/social/campaigns";
import { mediaUrl } from "@/lib/social/composition";

type Props = {
  campaigns: Campaign[];
  ready: boolean;
  busy: boolean;
  activeId?: string;
  onOpen: (campaign: Campaign) => void;
  onCreate: () => void;
  onDelete: (campaign: Campaign) => void;
};

export function CampaignLibrary({ campaigns, ready, busy, activeId, onOpen, onCreate, onDelete }: Props) {
  return <section className="campaign-library" aria-label="Mis campañas">
    <div className="social-section-heading">
      <div><span className="eyebrow">BIBLIOTECA</span><h2>Mis campañas</h2><p className="social-muted">Tus campañas con sus piezas, dirección de arte y ajustes. Guardadas en este navegador.</p></div>
      <button className="social-primary" disabled={!ready || busy} onClick={onCreate}><Plus size={15} />Crear campaña</button>
    </div>
    {!ready ? <div className="social-empty" role="status">Cargando tus campañas…</div> : campaigns.length === 0 ? <div className="social-empty"><Layers3 /><h2>Tu primera campaña empieza acá.</h2><p>Ponele un nombre y reuní todas sus piezas en un mismo lugar.</p><button disabled={busy} onClick={onCreate}>Crear mi primera campaña</button></div> : <div className="campaign-library-grid">
      {campaigns.map(campaign => {
        const approved = campaign.projects.filter(project => project.composition.aiReviewed).length;
        const generated = campaign.projects.filter(project => project.composition.generatedImage).length;
        const previewPieces = [...campaign.projects].sort((a, b) => Number(!!b.composition.generatedImage) - Number(!!a.composition.generatedImage)).slice(0, 3);
        return <article className="campaign-library-card" key={campaign.id}>
          <button className="campaign-library-open" disabled={busy} onClick={() => onOpen(campaign)} aria-label={`Abrir campaña ${campaign.name}`}>
            <div className={`campaign-library-cover cover-count-${previewPieces.length}`}>
              <div className="campaign-library-mosaic">{previewPieces.map(piece => <img key={piece.id} loading="lazy" src={piece.composition.generatedImage || mediaUrl(piece.composition.productImage)} alt={piece.product.title} />)}</div>
              <span className="campaign-library-piece-count"><Layers3 size={13} aria-hidden="true" />{campaign.projects.length} piezas</span>
              {campaign.id === activeId && <span className="campaign-library-active"><i />En curso</span>}
            </div>
            <div className="campaign-library-info">
              <span className="eyebrow">{campaign.projects[0].brand.name}{campaign.id === activeId ? " · EN CURSO" : ""}</span>
              <h3>{campaign.name}</h3>
              <p>{campaign.projects.length} piezas · {approved} aprobadas</p>
              <span className="campaign-library-status">{approved === campaign.projects.length ? "Lista para descargar" : generated === campaign.projects.length ? "Pendiente de revisión" : `${generated} imágenes generadas`}</span>
              {campaign.directionName && <span className="campaign-library-direction">DA: {campaign.directionName}</span>}
              <div className="campaign-library-footer"><time dateTime={campaign.updatedAt}>{new Date(campaign.updatedAt).toLocaleDateString("es-AR")}</time><span>Ver campaña <ArrowRight size={14} /></span></div>
            </div>
          </button>
          <div className="campaign-library-actions"><button type="button" className="campaign-delete" disabled={busy} onClick={() => onDelete(campaign)} aria-label={`Eliminar campaña ${campaign.name}`}><Trash2 size={14} />Eliminar campaña</button></div>
        </article>;
      })}
    </div>}
  </section>;
}
