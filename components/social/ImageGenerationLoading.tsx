import { Sparkles } from "lucide-react";

export function ImageGenerationLoading() {
  return <div className="image-generation-loading" role="status" aria-live="polite">
    <div className="image-generation-art" aria-hidden="true">
      <div className="image-generation-frame"><Sparkles size={28} strokeWidth={1.2} /></div>
      <span className="image-generation-orbit" />
    </div>
    <span className="image-generation-kicker">TU CAMPAÑA TOMA FORMA</span>
    <strong>Creando tu imagen</strong>
    <p>Estamos trabajando en tu dirección de arte.<br />El resultado aparecerá acá cuando esté listo.</p>
    <div className="image-generation-track" aria-hidden="true"><span /></div>
    <small>Puede tardar unos minutos</small>
  </div>;
}
