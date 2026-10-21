"use client";

import { useState, type ReactNode } from "react";
import { AlignLeft, AlignCenter, AlignRight, AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Bold, Italic, Type, Move, Palette, Layers3, ImageIcon, Upload, Trash2, Eye, EyeOff, ChevronDown, SunDim, type LucideIcon } from "lucide-react";
import { blendModes, formats, logoStyleSchema, textStyleSchema, type Brand, type Composition } from "@/lib/social/schema";
import { alignLayerBox, layoutLogo, layoutText } from "@/lib/social/overlays";
import { hasSubjectMask } from "@/lib/social/composition";
import { SubjectMaskEditor } from "./SubjectMaskEditor";

type Props = {
  mode?: "text" | "logo";
  imageLayer?: boolean;
  onRemove?: () => void;
  layerVisible?: boolean;
  onVisibility?: () => void;
  composition: Composition;
  brand: Brand;
  onChange: (patch: Partial<Composition>) => void;
  onLogoChange: (logo: string | null) => void;
  onError: (message: string) => void;
};

function PropertySection({ title, icon: Icon, children, collapsible = false }: { title: string; icon: LucideIcon; children: ReactNode; collapsible?: boolean }) {
  const heading = <span className="property-section-title"><Icon size={15} aria-hidden="true" />{title}</span>;
  return collapsible ? <details className="property-section property-disclosure"><summary>{heading}<ChevronDown size={14} aria-hidden="true" /></summary><div className="property-section-body">{children}</div></details> : <section className="property-section"><h4>{heading}</h4><div className="property-section-body">{children}</div></section>;
}

function Slider({ label, value, min = 0, max = 100, step = 1, unit = "", onChange }: { label: string; value: number; min?: number; max?: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  return <label className="social-overlay-slider"><span>{label}<output>{Number(value.toFixed(2))}{unit}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

const blendLabels: Record<typeof blendModes[number], string> = { "source-over": "Normal", multiply: "Multiplicar", screen: "Trama", overlay: "Superponer", darken: "Oscurecer", lighten: "Aclarar", "soft-light": "Luz suave", "hard-light": "Luz fuerte", difference: "Diferencia", exclusion: "Exclusión" };
function BlendControl({ value, onChange }: { value: typeof blendModes[number]; onChange: (value: typeof blendModes[number]) => void }) {
  return <label>Modo de fusión<select value={value} onChange={(event) => onChange(event.target.value as typeof value)}>{blendModes.map((mode) => <option key={mode} value={mode}>{blendLabels[mode]}</option>)}</select><span className="post-field-hint">Se combina con los colores de la imagen. Normal conserva el color original.</span></label>;
}

function SpacingField({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const parse = (raw: string) => Number(raw.replace(",", "."));
  return <label>{label} · {unit}<input type="text" inputMode="decimal" aria-label={label} value={draft ?? String(value)} onFocus={() => setDraft(String(value))} onChange={(event) => { const raw = event.target.value; if (!/^-?\d*[.,]?\d*$/.test(raw)) return; setDraft(raw); const next = parse(raw); if (raw.trim() && Number.isFinite(next) && next >= min && next <= max) onChange(next); }} onBlur={() => { const next = draft?.trim() ? parse(draft) : NaN; if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, next))); setDraft(null); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} /><span className="post-field-hint">{min} a {max}{unit === "×" ? " · entre líneas" : unit === "px" ? " · entre letras" : ""}</span></label>;
}

function PositionButtons({ label, disabled = false, onAlign }: { label: string; disabled?: boolean; onAlign: (axis: "horizontal" | "vertical", alignment: "start" | "center" | "end") => void }) {
  return <div className="social-position-controls"><span>{label}</span><div role="group" aria-label={`${label} · horizontal`}>{[{ value: "start", label: "Izquierda", icon: AlignHorizontalJustifyStart }, { value: "center", label: "Centro", icon: AlignHorizontalJustifyCenter }, { value: "end", label: "Derecha", icon: AlignHorizontalJustifyEnd }].map(({ value, label: title, icon: Icon }) => <button type="button" key={value} disabled={disabled} aria-label={`Alinear a ${title.toLowerCase()} del lienzo`} title={`Alinear a ${title.toLowerCase()} del lienzo`} onClick={() => onAlign("horizontal", value as "start" | "center" | "end")}><Icon size={16} /><span>{title}</span></button>)}</div><div role="group" aria-label={`${label} · vertical`}>{[{ value: "start", label: "Arriba", icon: AlignVerticalJustifyStart }, { value: "center", label: "Medio", icon: AlignVerticalJustifyCenter }, { value: "end", label: "Abajo", icon: AlignVerticalJustifyEnd }].map(({ value, label: title, icon: Icon }) => <button type="button" key={value} disabled={disabled} aria-label={`Alinear ${title.toLowerCase()} en el lienzo`} title={`Alinear ${title.toLowerCase()} en el lienzo`} onClick={() => onAlign("vertical", value as "start" | "center" | "end")}><Icon size={16} /><span>{title}</span></button>)}</div></div>;
}

export function OverlayControls({ imageLayer = false, onRemove, layerVisible = true, onVisibility, mode, composition, brand, onChange, onLogoChange, onError }: Props) {
  const text = textStyleSchema.parse(composition.textStyle || {}), logo = logoStyleSchema.parse(composition.logoStyle || {});
  const [uploading, setUploading] = useState(false);
  const [fontSizeDraft, setFontSizeDraft] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState<{ source: string; width: number; height: number } | null>(null);
  const changeText = (patch: Partial<typeof text>) => onChange({ textStyle: { ...text, ...patch } });
  const changeLogo = (patch: Partial<typeof logo>) => onChange({ logoStyle: { ...logo, ...patch } });
  function alignText(axis: "horizontal" | "vertical", alignment: "start" | "center" | "end") {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return onError("No se pudo calcular la posición del texto.");
    const { width, height } = formats[composition.format];
    const { box } = layoutText(context, composition, width, height);
    changeText(alignLayerBox(box, width, height, axis, alignment));
  }
  function alignLogo(axis: "horizontal" | "vertical", alignment: "start" | "center" | "end") {
    if (!logoSize || logoSize.source !== brand.logo) return;
    const { width, height } = formats[composition.format];
    const box = layoutLogo(composition, width, height, logoSize.width, logoSize.height);
    changeLogo(alignLayerBox(box, width, height, axis, alignment));
  }
  async function upload(file: File) {
    setUploading(true);
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1_000_000) throw new Error("Usá un logo PNG, JPG o WebP de hasta 1 MB. PNG conserva la transparencia.");
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("No se pudo leer el logo.")); reader.readAsDataURL(file);
      });
      onLogoChange(data);
    } catch (error) { onError(error instanceof Error ? error.message : "No se pudo cargar el logo."); }
    finally { setUploading(false); }
  }
  return <div className={`social-overlay-controls property-controls ${mode ? "single-mode" : ""}`}>
    {mode !== "logo" && <div className="property-layer">
      <div className="property-layer-header"><span className="property-layer-icon"><Type size={18} /></span><div><strong>Capa de texto</strong><span>{layerVisible ? "Texto editable sobre la imagen" : "Capa oculta"}</span></div>{onVisibility && <button type="button" className="property-icon-button" aria-label={layerVisible ? "Ocultar texto" : "Mostrar texto"} title={layerVisible ? "Ocultar texto" : "Mostrar texto"} onClick={onVisibility}>{layerVisible ? <Eye size={16} /> : <EyeOff size={16} />}</button>}<button type="button" className="property-icon-button" aria-label="Eliminar capa de texto" title="Eliminar texto" disabled={!onRemove && !composition.text} onClick={() => onRemove ? onRemove() : onChange({ text: "" })}><Trash2 size={15} /></button></div>
      <PropertySection title="Contenido" icon={Type}>
        <label className="property-text-content"><span className="sr-only">Texto en el posteo</span><textarea rows={3} maxLength={160} value={composition.text} onChange={(event) => onChange({ text: event.target.value })} placeholder="Escribí una frase para tu imagen…" /></label><div className="post-input-meta"><span>El caption de redes se edita al descargar.</span><span>{composition.text.length}/160</span></div>
      </PropertySection>
      <PropertySection title="Tipografía" icon={Type}>
        <label>Fuente<select value={composition.font} onChange={(event) => onChange({ font: event.target.value as Composition["font"] })}><option>Arial</option><option>Georgia</option><option>Times New Roman</option></select></label>
        <div className="social-overlay-columns">
      <label>Tamaño · px<input aria-label="Tamaño de fuente en píxeles" type="text" inputMode="numeric" value={fontSizeDraft ?? String(text.fontSize)} onFocus={() => setFontSizeDraft(String(text.fontSize))} onChange={(event) => { const raw = event.target.value; if (!/^\d*$/.test(raw)) return; setFontSizeDraft(raw); const value = Number(raw); if (raw && value >= 12 && value <= 180) changeText({ fontSize: value }); }} onBlur={() => { if (fontSizeDraft?.trim()) changeText({ fontSize: Math.max(12, Math.min(180, Number(fontSizeDraft))) }); setFontSizeDraft(null); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} /></label>
          <label>Color<input type="color" value={composition.textColor} onChange={(event) => onChange({ textColor: event.target.value })} /></label>
        </div>
        <div className="property-format-bar"><div className="social-overlay-toggles" role="group" aria-label="Estilo tipográfico"><button type="button" title="Negrita" aria-label="Negrita" aria-pressed={text.bold} onClick={() => changeText({ bold: !text.bold })}><Bold size={17} /></button><button type="button" title="Cursiva" aria-label="Cursiva" aria-pressed={text.italic} onClick={() => changeText({ italic: !text.italic })}><Italic size={17} /></button></div><div className="property-inline-alignment" role="group" aria-label="Alineación del texto">{[{ value: "left", label: "Alinear texto a la izquierda", icon: AlignLeft }, { value: "center", label: "Centrar texto", icon: AlignCenter }, { value: "right", label: "Alinear texto a la derecha", icon: AlignRight }].map(({ value, label, icon: Icon }) => <button type="button" key={value} title={label} aria-label={label} aria-pressed={text.align === value} onClick={() => changeText({ align: value as typeof text.align })}><Icon size={17} /></button>)}</div></div>
        <div className="social-overlay-columns"><SpacingField label="Entre letras" value={text.letterSpacing} min={-2} max={20} unit="px" onChange={(letterSpacing) => changeText({ letterSpacing })} /><SpacingField label="Entre líneas" value={text.lineHeight} min={.9} max={2} unit="×" onChange={(lineHeight) => changeText({ lineHeight })} /></div>
      </PropertySection>
      <PropertySection title="Posición y tamaño" icon={Move}>
        <PositionButtons label="Alinear bloque al lienzo" onAlign={alignText} />
        <Slider label="Ancho del bloque" value={text.width * 100} min={10} max={100} unit="%" onChange={(width) => changeText({ width: width / 100, x: Math.min(text.x, 1 - width / 100) })} />
        <div className="social-overlay-columns"><SpacingField label="X · horizontal" value={Number((text.x * 100).toFixed(1))} min={0} max={Number(((1 - text.width) * 100).toFixed(1))} unit="%" onChange={(x) => changeText({ x: x / 100 })} /><SpacingField label="Y · vertical" value={Number((text.y * 100).toFixed(1))} min={0} max={100} unit="%" onChange={(y) => changeText({ y: y / 100 })} /></div>
        <p className="post-field-hint">También podés arrastrar el texto sobre el lienzo o moverlo con las flechas.</p>
      </PropertySection>
      <PropertySection title="Apariencia" icon={Palette}>
        <Slider label="Opacidad" value={text.opacity * 100} unit="%" onChange={(opacity) => changeText({ opacity: opacity / 100 })} />
        <button type="button" className="property-effect-toggle" aria-pressed={text.shadow} onClick={() => changeText({ shadow: !text.shadow })}><SunDim size={17} /><span>Sombra suave</span><span>{text.shadow ? "Activada" : "Desactivada"}</span></button>
      </PropertySection>
      <PropertySection title="Fusión y profundidad" icon={Layers3} collapsible>
        <BlendControl value={text.blendMode} onChange={(blendMode) => changeText({ blendMode })} />
        <label>Orden de la capa<select value={text.behindSubject ? "behind" : "front"} onChange={(event) => changeText({ behindSubject: event.target.value === "behind" })}><option value="front">Delante del sujeto</option><option value="behind" disabled={!hasSubjectMask(composition)}>Detrás del sujeto</option></select></label>
        <SubjectMaskEditor composition={composition} brand={brand} onChange={onChange} onError={onError} />
      </PropertySection>
    </div>}
    {mode !== "text" && <div className="property-layer">
      <div className="property-layer-header"><span className="property-layer-icon"><ImageIcon size={18} /></span><div><strong>{imageLayer ? "Capa de imagen" : "Capa de logo"}</strong><span>{brand.logo ? composition.logoVisible ? "Visible en la imagen" : "Oculta en la imagen" : imageLayer ? "Agregá una imagen" : "Cargá el archivo de tu marca"}</span></div>{brand.logo && <button type="button" className="property-icon-button" title={composition.logoVisible ? "Ocultar imagen" : "Mostrar imagen"} aria-label={composition.logoVisible ? "Ocultar imagen" : "Mostrar imagen"} aria-pressed={composition.logoVisible} onClick={() => onChange({ logoVisible: !composition.logoVisible })}>{composition.logoVisible ? <Eye size={17} /> : <EyeOff size={17} />}</button>}</div>
      <PropertySection title={imageLayer ? "Archivo de imagen" : "Archivo del logo"} icon={ImageIcon}>
        {brand.logo && <div className="social-logo-checker"><img src={brand.logo} alt={imageLayer ? "Imagen de la capa" : "Logo original del proyecto"} onLoad={(event) => setLogoSize({ source: brand.logo!, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} /></div>}
        <div className="property-file-actions"><label className="social-file"><Upload size={16} />{uploading ? "Cargando logo…" : brand.logo ? "Reemplazar" : imageLayer ? "Cargar imagen" : "Cargar logo original"}<input disabled={uploading} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} /></label>{brand.logo && <button type="button" className="property-icon-button" aria-label={imageLayer ? "Eliminar imagen" : "Quitar archivo de logo"} title="Quitar archivo" onClick={() => onLogoChange(null)}><Trash2 size={16} /></button>}</div>
        <p className="post-field-hint">PNG transparente recomendado · hasta 1 MB. Se guarda en este proyecto.</p>
      </PropertySection>
      {brand.logo && <>
        <PropertySection title="Posición y tamaño" icon={Move}>
          <Slider label={imageLayer ? "Ancho de la imagen" : "Ancho del logo"} value={logo.width * 100} min={3} max={70} unit="%" onChange={(width) => changeLogo({ width: width / 100, x: Math.min(logo.x, 1 - width / 100) })} />
          <PositionButtons label={imageLayer ? "Alinear imagen al lienzo" : "Alinear logo al lienzo"} disabled={!logoSize || logoSize.source !== brand.logo} onAlign={alignLogo} />
          <div className="social-overlay-columns"><SpacingField label="X · horizontal" value={Number((logo.x * 100).toFixed(1))} min={0} max={Number(((1 - logo.width) * 100).toFixed(1))} unit="%" onChange={(x) => changeLogo({ x: x / 100 })} /><SpacingField label="Y · vertical" value={Number((logo.y * 100).toFixed(1))} min={0} max={100} unit="%" onChange={(y) => changeLogo({ y: y / 100 })} /></div>
          <p className="post-field-hint">Arrastrá la imagen en el lienzo para ubicarla libremente.</p>
        </PropertySection>
        <PropertySection title="Apariencia" icon={Palette}><Slider label="Opacidad" value={logo.opacity * 100} unit="%" onChange={(opacity) => changeLogo({ opacity: opacity / 100 })} /></PropertySection>
        <PropertySection title="Fusión y profundidad" icon={Layers3} collapsible>
          <BlendControl value={logo.blendMode} onChange={(blendMode) => changeLogo({ blendMode })} />
          <label>Orden de la capa<select value={logo.behindSubject ? "behind" : "front"} onChange={(event) => changeLogo({ behindSubject: event.target.value === "behind" })}><option value="front">Delante del sujeto</option><option value="behind" disabled={!hasSubjectMask(composition)}>Detrás del sujeto</option></select></label>
          <SubjectMaskEditor composition={composition} brand={brand} onChange={onChange} onError={onError} />
        </PropertySection>
      </>}
    </div>}
    {!mode && <p className="social-muted">Los cambios quedan guardados con el proyecto y se aplican al PNG/JPG. No gastan créditos.</p>}
  </div>;
}
