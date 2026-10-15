"use client";

import { useState } from "react";
import { ArrowRight, Check, ChevronDown, Sparkles } from "lucide-react";
import { formats, type Composition, type Product } from "@/lib/social/schema";
import { mediaUrl } from "@/lib/social/composition";

type Props = {
  product: Product; image: string; format: Composition["format"]; contentType: string; approach: string;
  textMode: string; customText: string; instructions: string; prepared: boolean;
  onImage: (image: string) => void; onFormat: (format: Composition["format"]) => void;
  onContentType: (value: string) => void; onApproach: (value: string) => void; onTextMode: (value: string) => void;
  onCustomText: (value: string) => void; onInstructions: (value: string) => void; onPrepare: () => void;
};
const starters = [
  { name: "Cinemático", text: "Luz lateral cinematográfica, sombras profundas y un espacio íntimo. Conservar la prenda y sus detalles." },
  { name: "Brutalista", text: "Concreto envejecido, líneas arquitectónicas y una silueta protagonista. Reemplazar el fondo de estudio sin cambiar la prenda." },
  { name: "Minimalista", text: "Un entorno sobrio y limpio, composición asimétrica y mucho espacio negativo. La prenda conserva su color y construcción." },
];

export function CreativeSetup(props: Props) {
  const [editing, setEditing] = useState(false);
  const collapsed = props.prepared && !editing;
  if (collapsed) return <div className="creative-brief-summary"><div><Check size={17} /><div><strong>Tu brief está listo</strong><span>{formats[props.format].label} · {props.approach} · {props.textMode === "none" ? "Sin texto" : "Texto editable"}</span></div></div><button type="button" onClick={() => setEditing(true)}>Editar brief</button></div>;
  const referenceIndex = props.product.images.nodes.findIndex((image) => image.url === props.image);
  return <section className="creative-setup" aria-label="Preparar un posteo">
    <div className="creative-reference"><div className="creative-field-heading"><span>01</span><h3>La fotografía</h3><small>{referenceIndex + 1}/{props.product.images.nodes.length}</small></div><div className="creative-reference-main">{props.image && <img src={mediaUrl(props.image)} alt={props.product.title} />}</div><div className="creative-reference-thumbs">{props.product.images.nodes.map((asset, index) => <button type="button" key={asset.id} aria-pressed={props.image === asset.url} aria-label={`Usar referencia ${index + 1}`} onClick={() => props.onImage(asset.url)}><img loading="lazy" src={mediaUrl(asset.url)} alt={asset.altText || `Referencia ${index + 1}`} /></button>)}</div><p>Elegí la toma que mejor muestra la prenda. Siempre conservamos el original.</p></div>
    <div className="creative-brief-fields">
      <div className="creative-field-heading"><span>02</span><h3>El formato</h3></div>
      <div className="creative-format-grid" role="group" aria-label="Formato del posteo">{Object.entries(formats).map(([key, value]) => <button type="button" key={key} aria-pressed={props.format === key} onClick={() => props.onFormat(key as Composition["format"])}><i className={`creative-format-icon ${key}`} /><strong>{key === "square" ? "Cuadrado" : key === "portrait" ? "Retrato" : "Stories"}</strong><span>{value.width} × {value.height}</span>{props.format === key && <Check size={13} />}</button>)}</div>
      <div className="creative-field-heading"><span>03</span><h3>La idea</h3><small>Opcional</small></div>
      <label className="creative-brief-input"><span className="sr-only">Instrucciones visuales para Magnific</span><textarea maxLength={1500} rows={4} value={props.instructions} onChange={(event) => props.onInstructions(event.target.value)} placeholder="¿Qué imaginás? Por ejemplo: un corredor de concreto, luz lateral y espacio para una frase…" /><span>{props.instructions.length}/1500</span></label>
      <div className="creative-starters"><span>Para arrancar</span>{starters.map((starter) => <button type="button" key={starter.name} onClick={() => { props.onApproach(starter.name); props.onInstructions((props.instructions ? `${props.instructions}\n\n${starter.text}` : starter.text).slice(0, 1500)); }}><Sparkles size={12} />{starter.name}</button>)}</div>
      <details className="post-advanced creative-options"><summary>Más opciones creativas<ChevronDown size={14} /></summary><div className="social-config"><label>Tipo de contenido<select value={props.contentType} onChange={(event) => props.onContentType(event.target.value)}>{["Campaña editorial", "Producto protagonista", "Material y detalle", "Manifiesto de marca", "Historia de colección", "Composición mínima"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Enfoque<select value={props.approach} onChange={(event) => props.onApproach(event.target.value)}>{["Automático", "Cinemático", "Brutalista", "Minimalista", "Experimental"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Texto en la imagen<select value={props.textMode} onChange={(event) => props.onTextMode(event.target.value)}><option value="auto">Sugerido por la dirección</option><option value="custom">Escribir mi texto</option><option value="none">Sin texto</option></select></label>{props.textMode === "custom" && <label>Tu texto<input value={props.customText} maxLength={160} onChange={(event) => props.onCustomText(event.target.value)} /></label>}</div></details>
      <div className="creative-prepare"><button type="button" className="social-primary" disabled={!props.image} onClick={() => { props.onPrepare(); setEditing(false); }}>Ver tres direcciones<ArrowRight size={16} /></button><span>Exploración sin créditos. Elegís qué imagen generar después.</span></div>
    </div>
  </section>;
}
