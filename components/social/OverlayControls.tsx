"use client";

import { useState } from "react";
import { AlignLeft, AlignCenter, AlignRight, AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd } from "lucide-react";
import { formats, logoStyleSchema, textStyleSchema, type Brand, type Composition } from "@/lib/social/schema";
import { alignLayerBox, layoutLogo, layoutText } from "@/lib/social/overlays";

type Props = {
  mode?: "text" | "logo";
  composition: Composition;
  brand: Brand;
  onChange: (patch: Partial<Composition>) => void;
  onLogoChange: (logo: string | null) => void;
  onError: (message: string) => void;
};

function Slider({ label, value, min = 0, max = 100, step = 1, unit = "", onChange }: { label: string; value: number; min?: number; max?: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  return <label className="social-overlay-slider"><span>{label}<output>{Number(value.toFixed(2))}{unit}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function PositionButtons({ label, disabled = false, onAlign }: { label: string; disabled?: boolean; onAlign: (axis: "horizontal" | "vertical", alignment: "start" | "center" | "end") => void }) {
  return <div className="social-position-controls"><span>{label}</span><div role="group" aria-label={`${label} · horizontal`}>{[{ value: "start", label: "Izquierda", icon: AlignHorizontalJustifyStart }, { value: "center", label: "Centro", icon: AlignHorizontalJustifyCenter }, { value: "end", label: "Derecha", icon: AlignHorizontalJustifyEnd }].map(({ value, label: title, icon: Icon }) => <button type="button" key={value} disabled={disabled} title={`Alinear a ${title.toLowerCase()} del lienzo`} onClick={() => onAlign("horizontal", value as "start" | "center" | "end")}><Icon size={16} /><span>{title}</span></button>)}</div><div role="group" aria-label={`${label} · vertical`}>{[{ value: "start", label: "Arriba", icon: AlignVerticalJustifyStart }, { value: "center", label: "Medio", icon: AlignVerticalJustifyCenter }, { value: "end", label: "Abajo", icon: AlignVerticalJustifyEnd }].map(({ value, label: title, icon: Icon }) => <button type="button" key={value} disabled={disabled} title={`Alinear ${title.toLowerCase()} en el lienzo`} onClick={() => onAlign("vertical", value as "start" | "center" | "end")}><Icon size={16} /><span>{title}</span></button>)}</div></div>;
}

export function OverlayControls({ mode, composition, brand, onChange, onLogoChange, onError }: Props) {
  const text = textStyleSchema.parse(composition.textStyle || {}), logo = logoStyleSchema.parse(composition.logoStyle || {});
  const [uploading, setUploading] = useState(false);
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
  return <div className={`social-overlay-controls ${mode ? "single-mode" : ""}`}>
    {mode !== "logo" && <details open><summary>Texto · posición y estilo</summary><div className="social-overlay-body">
      <label>Texto en el posteo<textarea maxLength={160} value={composition.text} onChange={(event) => onChange({ text: event.target.value })} placeholder="Texto opcional; el caption se edita por separado." /></label>
      <div className="social-overlay-columns"><label>Tipografía<select value={composition.font} onChange={(event) => onChange({ font: event.target.value as Composition["font"] })}><option>Arial</option><option>Georgia</option><option>Times New Roman</option></select></label><label>Color<input type="color" value={composition.textColor} onChange={(event) => onChange({ textColor: event.target.value })} /></label></div>
      <label>Tamaño de fuente · px<input aria-label="Tamaño de fuente en píxeles" type="number" min={12} max={180} value={text.fontSize} onChange={(event) => { const value = Number(event.target.value); if (value >= 12 && value <= 180) changeText({ fontSize: value }); }} /></label>
      <div className="social-text-alignment"><span>Alineación del texto</span><div role="group" aria-label="Alineación del texto">{[{ value: "left", label: "Izquierda", icon: AlignLeft }, { value: "center", label: "Centrado", icon: AlignCenter }, { value: "right", label: "Derecha", icon: AlignRight }].map(({ value, label, icon: Icon }) => <button type="button" key={value} aria-pressed={text.align === value} onClick={() => changeText({ align: value as typeof text.align })}><Icon size={17} /><span>{label}</span></button>)}</div></div>
      <div className="social-overlay-toggles"><button type="button" aria-pressed={text.bold} onClick={() => changeText({ bold: !text.bold })}><strong>Negrita</strong></button><button type="button" aria-pressed={text.italic} onClick={() => changeText({ italic: !text.italic })}><em>Cursiva</em></button><button type="button" aria-pressed={text.shadow} onClick={() => changeText({ shadow: !text.shadow })}>Sombra suave</button></div>
      <PositionButtons label="Posición del bloque en el lienzo" onAlign={alignText} />
      <details className="post-advanced"><summary>Espaciado y posición precisa</summary><div>
      <Slider label="Ancho del bloque" value={text.width * 100} min={10} max={100} unit="%" onChange={(width) => changeText({ width: width / 100, x: Math.min(text.x, 1 - width / 100) })} />
      <div className="social-overlay-columns"><Slider label="Texto · horizontal" value={text.x * 100} max={Math.max(0, (1 - text.width) * 100)} step={.1} unit="%" onChange={(x) => changeText({ x: x / 100 })} /><Slider label="Texto · vertical" value={text.y * 100} unit="%" onChange={(y) => changeText({ y: y / 100 })} /></div>
      <div className="social-overlay-columns"><Slider label="Espaciado de letras" value={text.letterSpacing} min={-2} max={20} step={.5} unit=" px" onChange={(letterSpacing) => changeText({ letterSpacing })} /><Slider label="Interlineado" value={text.lineHeight} min={.9} max={2} step={.05} unit="×" onChange={(lineHeight) => changeText({ lineHeight })} /></div>
      <Slider label="Opacidad del texto" value={text.opacity * 100} unit="%" onChange={(opacity) => changeText({ opacity: opacity / 100 })} />
      </div></details>
      <button type="button" onClick={() => onChange({ text: "" })}>Quitar texto de la imagen</button>
    </div></details>}
    {mode !== "text" && <details open><summary>Logo · archivo y posición</summary><div className="social-overlay-body">
      <label className="social-file">{uploading ? "Cargando logo…" : brand.logo ? "Reemplazar logo" : "Cargar logo original"}<input disabled={uploading} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} /></label>
      <p className="social-muted">PNG transparente recomendado · hasta 1 MB. Se guarda en este proyecto; no se envía a Magnific ni a Shopify.</p>
      {brand.logo && <><div className="social-logo-checker"><img src={brand.logo} alt="Logo original del proyecto" onLoad={(event) => setLogoSize({ source: brand.logo!, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} /></div><label className="social-check"><input type="checkbox" checked={composition.logoVisible} onChange={(event) => onChange({ logoVisible: event.target.checked })} />Mostrar logo</label>
        <Slider label="Tamaño del logo" value={logo.width * 100} min={3} max={70} unit="%" onChange={(width) => changeLogo({ width: width / 100, x: Math.min(logo.x, 1 - width / 100) })} />
        <div className="social-overlay-columns"><Slider label="Logo · horizontal" value={logo.x * 100} max={(1 - logo.width) * 100} step={.1} unit="%" onChange={(x) => changeLogo({ x: x / 100 })} /><Slider label="Logo · vertical" value={logo.y * 100} unit="%" onChange={(y) => changeLogo({ y: y / 100 })} /></div>
        <Slider label="Opacidad del logo" value={logo.opacity * 100} unit="%" onChange={(opacity) => changeLogo({ opacity: opacity / 100 })} />
        <PositionButtons label="Posición del logo en el lienzo" disabled={!logoSize || logoSize.source !== brand.logo} onAlign={alignLogo} />
        <button type="button" onClick={() => onLogoChange(null)}>Quitar archivo de logo</button>
      </>}
    </div></details>}
    {!mode && <p className="social-muted">Posiciones y estilos quedan guardados con el proyecto y se aplican al PNG/JPG. Estos controles no gastan créditos.</p>}
  </div>;
}
