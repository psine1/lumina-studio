"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Copy,
  FileClock,
  Film,
  ImageIcon,
  Layers3,
  LoaderCircle,
  Maximize2,
  MoreHorizontal,
  PencilLine,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { APP_MODELS } from "@/lib/magnific/models";
import type { AppModel, GenerationRecord, StudioMode } from "@/types/generation";

type UiModel = Omit<AppModel, "endpoint" | "statusEndpoint">;
type UploadAsset = { name: string; data: string; preview: string };
type ApiTask = { data?: { task_id?: string; status?: string }; error?: string };

const MODEL_FALLBACKS = APP_MODELS.map(({ endpoint: _endpoint, statusEndpoint: _statusEndpoint, ...model }) => model);
const HISTORY_KEY = "luma-studio-history-v1";

const modeCopy: Record<Exclude<StudioMode, "history">, { eyebrow: string; title: string; description: string; placeholder: string; action: string }> = {
  image: { eyebrow: "CREAR", title: "Nueva imagen", description: "Da forma a una idea con texto y referencias visuales.", placeholder: "Describe la escena, composición, luz y estilo que quieres crear…", action: "Generar imagen" },
  edit: { eyebrow: "TRANSFORMAR", title: "Editar imagen", description: "Usa una imagen como base y describe el cambio con precisión.", placeholder: "Describe qué debe cambiar y qué partes conservar…", action: "Aplicar edición" },
  video: { eyebrow: "MOVIMIENTO", title: "Generar video", description: "Crea una secuencia desde texto o anima un fotograma inicial.", placeholder: "Describe la acción, el movimiento de cámara y la atmósfera…", action: "Generar video" },
};

const navItems = [
  { href: "/image", mode: "image" as const, label: "Imagen", icon: ImageIcon },
  { href: "/edit", mode: "edit" as const, label: "Editar", icon: PencilLine },
  { href: "/video", mode: "video" as const, label: "Video", icon: Film },
  { href: "/history", mode: "history" as const, label: "Historial", icon: FileClock },
];

const ratioLabels: Record<string, string> = {
  auto: "Automática",
  square_1_1: "1:1",
  widescreen_16_9: "16:9",
  social_story_9_16: "9:16",
  traditional_3_4: "3:4",
  classic_4_3: "4:3",
  portrait_2_3: "2:3",
  standard_3_2: "3:2",
  cinematic_21_9: "21:9",
  horizontal_2_1: "2:1",
  vertical_1_2: "1:2",
  social_post_4_5: "4:5",
  "1:1": "1:1",
  "2:3": "2:3",
  "3:2": "3:2",
  "4:3": "4:3",
  "3:4": "3:4",
  "5:4": "5:4",
  "4:5": "4:5",
  "16:9": "16:9",
  "9:16": "9:16",
  "21:9": "21:9",
  "1280:720": "16:9",
  "720:1280": "9:16",
  "1104:832": "4:3",
  "960:960": "1:1",
  "832:1104": "3:4",
};

function readFile(file: File): Promise<UploadAsset> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("El archivo debe ser una imagen."));
    if (file.size > 10 * 1024 * 1024) return reject(new Error("La imagen supera el límite de 10 MB."));
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: String(reader.result), preview: String(reader.result) });
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

function loadHistory() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as GenerationRecord[];
  } catch {
    return [];
  }
}

function saveRecord(record: GenerationRecord) {
  const history = loadHistory();
  const next = [record, ...history.filter((item) => item.id !== record.id)].slice(0, 48);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

function deleteRecord(id: string) {
  const next = loadHistory().filter((item) => item.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

function friendlyStatus(status: GenerationRecord["status"]) {
  return { pending: "En cola", processing: "Generando", completed: "Listo", failed: "Error" }[status];
}

export function StudioShell({ mode }: { mode: StudioMode }) {
  const [models, setModels] = useState<UiModel[]>(MODEL_FALLBACKS);
  const [modelId, setModelId] = useState(mode === "video" ? "runway-4-5" : mode === "edit" ? "flux-2-pro" : "mystic");
  const [modelSearch, setModelSearch] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState("square_1_1");
  const [resolution, setResolution] = useState("2k");
  const [duration, setDuration] = useState("5");
  const [promptEnhancement, setPromptEnhancement] = useState(false);
  const [seed, setSeed] = useState("");
  const [references, setReferences] = useState<UploadAsset[]>([]);
  const [baseImage, setBaseImage] = useState<UploadAsset | null>(null);
  const [startImage, setStartImage] = useState<UploadAsset | null>(null);
  const [endImage, setEndImage] = useState<UploadAsset | null>(null);
  const [active, setActive] = useState<GenerationRecord | null>(null);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"all" | "image" | "edit" | "video">("all");
  const [error, setError] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const availableModels = useMemo(() => models.filter((model) => model.modes.includes(mode as Exclude<StudioMode, "history">)), [models, mode]);
  const selectedModel = availableModels.find((model) => model.id === modelId) ?? availableModels[0];
  const filteredModels = availableModels.filter((model) => `${model.label} ${model.provider} ${model.badges.join(" ")}`.toLowerCase().includes(modelSearch.toLowerCase()));

  useEffect(() => {
    // The persisted browser history is an external store synchronized after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(loadHistory());
    fetch("/api/models")
      .then((response) => response.ok ? response.json() as Promise<{ models: UiModel[] }> : Promise.reject(new Error("Models unavailable")))
      .then((payload) => setModels(payload.models))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const initial = mode === "video" ? "runway-4-5" : mode === "edit" ? "flux-2-pro" : "mystic";
    // Route transitions reuse this shell, so reset the controls for the new mode.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModelId(initial);
    setRatio(mode === "video" ? "1280:720" : mode === "edit" ? "1:1" : "square_1_1");
    setError("");
  }, [mode]);

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!modelContext?.registerTool || mode === "history") return;
    const lifecycle = new AbortController();
    Promise.resolve(modelContext.registerTool({
      name: "stage_generation",
      title: "Preparar generación",
      description: "Prepara un prompt en el estudio visible sin iniciar una generación ni consumir créditos.",
      inputSchema: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        const value = input as { prompt?: unknown };
        if (typeof value.prompt !== "string" || value.prompt.trim().length < 3) throw new Error("El prompt debe tener al menos 3 caracteres.");
        setPrompt(value.prompt.trim());
        promptRef.current?.focus();
        return { staged: true, mode };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [mode]);

  const chooseModel = (model: UiModel) => {
    setModelId(model.id);
    const ratios = model.supportedAspectRatios ?? [];
    setRatio(mode === "edit" && ratios.includes("auto") ? "auto" : ratios.find((value) => value !== "auto") ?? "1:1");
    setResolution(model.supportedResolutions?.find((value) => value.toLowerCase() === "2k") ?? model.supportedResolutions?.[0] ?? "1440");
    setDuration(model.supportedDurations?.[0] ?? "5");
    setReferences([]);
    setStartImage(null);
    setEndImage(null);
    setModelOpen(false);
  };

  const addReference = async (file?: File) => {
    if (!file || !selectedModel) return;
    try {
      const asset = await readFile(file);
      const limit = selectedModel.capabilities.maxReferences ?? 0;
      setReferences((items) => [...items, asset].slice(0, limit));
      setError("");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "No se pudo añadir la referencia.");
    }
  };

  const replaceUpload = async (file: File | undefined, setter: (asset: UploadAsset | null) => void) => {
    if (!file) return;
    try {
      setter(await readFile(file));
      setError("");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "No se pudo añadir la imagen.");
    }
  };

  const updateActive = (patch: Partial<GenerationRecord>) => {
    setActive((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      setHistory(saveRecord(next));
      return next;
    });
  };

  const poll = async (taskId: string, model: string, attempt = 0) => {
    if (attempt > 100) {
      updateActive({ status: "failed", error: "La generación superó el tiempo de espera. Puedes reintentarla." });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      const response = await fetch(`/api/generations/${encodeURIComponent(taskId)}?model=${encodeURIComponent(model)}`);
      const payload = await response.json() as { status?: GenerationRecord["status"]; generated?: string[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo consultar el estado.");
      if (payload.status === "completed") {
        updateActive({ status: "completed", resultUrl: payload.generated?.[0] });
        return;
      }
      if (payload.status === "failed") {
        updateActive({ status: "failed", error: "Magnific no pudo completar esta generación." });
        return;
      }
      updateActive({ status: "processing" });
      void poll(taskId, model, attempt + 1);
    } catch (problem) {
      updateActive({ status: "failed", error: problem instanceof Error ? problem.message : "No se pudo consultar el estado." });
    }
  };

  const submit = async () => {
    if (!selectedModel || mode === "history") return;
    if (prompt.trim().length < 3) {
      setError("Describe primero lo que quieres crear.");
      promptRef.current?.focus();
      return;
    }
    if (mode === "edit" && !baseImage) {
      setError("Añade una imagen base para editar.");
      return;
    }
    if (mode === "video" && selectedModel.id === "kling-1-6" && !startImage) {
      setError("Kling necesita una imagen inicial.");
      return;
    }
    setError("");
    const localId = crypto.randomUUID();
    const record: GenerationRecord = {
      id: localId,
      type: mode,
      provider: selectedModel.provider,
      model: selectedModel.id,
      modelLabel: selectedModel.label,
      prompt: prompt.trim(),
      status: "pending",
      createdAt: new Date().toISOString(),
      aspectRatio: ratio,
      summary: [ratioLabels[ratio] ?? ratio, mode !== "video" && selectedModel.capabilities.resolution ? resolution : "", mode === "video" ? `${duration}s` : ""].filter(Boolean),
    };
    setActive(record);
    setHistory(saveRecord(record));

    const route = `/api/generations/${mode}`;
    const body = mode === "image" ? {
      model: selectedModel.id,
      prompt: prompt.trim(),
      aspectRatio: ratio,
      resolution,
      ...(seed ? { seed: Number(seed) } : {}),
      promptEnhancement,
      referenceImages: references.map((reference) => reference.data),
    } : mode === "edit" ? {
      model: selectedModel.id,
      prompt: prompt.trim(),
      image: baseImage?.data,
      aspectRatio: ratio,
      resolution,
      ...(seed ? { seed: Number(seed) } : {}),
      promptEnhancement,
    } : {
      model: selectedModel.id,
      prompt: prompt.trim(),
      aspectRatio: ratio,
      duration,
      startImage: startImage?.data,
      endImage: endImage?.data,
    };

    try {
      const response = await fetch(route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as ApiTask;
      if (!response.ok) throw new Error(payload.error ?? "No se pudo iniciar la generación.");
      const taskId = payload.data?.task_id;
      if (!taskId) throw new Error("Magnific no devolvió un identificador de tarea.");
      updateActive({ taskId, status: "processing" });
      void poll(taskId, selectedModel.id);
    } catch (problem) {
      const message = problem instanceof Error ? problem.message : "No se pudo iniciar la generación.";
      updateActive({ status: "failed", error: message });
      setError(message);
    }
  };

  if (mode === "history") {
    const filtered = historyFilter === "all" ? history : history.filter((item) => item.type === historyFilter);
    return <HistoryView history={filtered} filter={historyFilter} setFilter={setHistoryFilter} onDelete={(id) => setHistory(deleteRecord(id))} />;
  }

  const copy = modeCopy[mode];
  return (
    <div className="studio-shell">
      <StudioNav mode={mode} />
      <aside className="control-panel">
        <div className="control-scroll">
          <header className="panel-heading">
            <span className="eyebrow">{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
          </header>

          <section className="field-section">
            <label className="field-label">MODELO</label>
            <Dialog open={modelOpen} onOpenChange={setModelOpen}>
              <DialogTrigger asChild>
                <button className="model-trigger" type="button">
                  <span className="model-mark">{selectedModel?.provider.slice(0, 1)}</span>
                  <span className="model-trigger-copy"><strong>{selectedModel?.label}</strong><small>{selectedModel?.provider}</small></span>
                  <span className="model-badge">{selectedModel?.badges[0]}</span>
                  <ChevronDown size={16} />
                </button>
              </DialogTrigger>
              <DialogContent className="model-dialog">
                <DialogHeader>
                  <DialogTitle>Seleccionar modelo</DialogTitle>
                  <DialogDescription>Solo aparecen modelos conectados a una ruta documentada de la API.</DialogDescription>
                </DialogHeader>
                <div className="model-search"><Search size={16} /><input value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} placeholder="Buscar modelo o proveedor" autoFocus /></div>
                <div className="model-list">
                  {filteredModels.map((model) => (
                    <button type="button" key={model.id} onClick={() => chooseModel(model)} className={`model-option ${model.id === selectedModel?.id ? "selected" : ""}`}>
                      <span className="model-mark large">{model.provider.slice(0, 1)}</span>
                      <span className="model-option-copy"><strong>{model.label}</strong><small>{model.provider}</small><p>{model.description}</p><span className="badge-row">{model.badges.map((badge) => <em key={badge}>{badge}</em>)}</span></span>
                      {model.id === selectedModel?.id && <Check size={18} />}
                    </button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </section>

          {mode === "edit" ? (
            <UploadBlock label="IMAGEN BASE" asset={baseImage} onChange={(file) => replaceUpload(file, setBaseImage)} onClear={() => setBaseImage(null)} tall />
          ) : mode === "video" && selectedModel?.capabilities.startImage ? (
            <section className="field-section">
              <div className="field-label-row"><label className="field-label">FOTOGRAMAS</label><span>Máx. 10 MB</span></div>
              <div className="frame-grid">
                <UploadTile label="Inicial" asset={startImage} onChange={(file) => replaceUpload(file, setStartImage)} onClear={() => setStartImage(null)} />
                {selectedModel.capabilities.endImage && <UploadTile label="Final" asset={endImage} onChange={(file) => replaceUpload(file, setEndImage)} onClear={() => setEndImage(null)} />}
              </div>
            </section>
          ) : selectedModel?.capabilities.references ? (
            <section className="field-section">
              <div className="field-label-row"><label className="field-label">REFERENCIAS</label><span>{references.length}/{selectedModel.capabilities.maxReferences}</span></div>
              <div className="reference-grid">
                {references.map((asset, index) => (
                  <div className="reference-preview" key={`${asset.name}-${index}`} style={{ backgroundImage: `url(${asset.preview})` }}>
                    <button aria-label="Quitar referencia" type="button" onClick={() => setReferences((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={13} /></button>
                    <span>{selectedModel.id === "mystic" ? (index === 0 ? "Estilo" : "Estructura") : `Referencia ${index + 1}`}</span>
                  </div>
                ))}
                {references.length < (selectedModel.capabilities.maxReferences ?? 0) && <UploadTile label={references.length ? "Añadir" : "Referencia"} onChange={addReference} compact />}
              </div>
            </section>
          ) : mode === "image" ? (
            <p className="model-capability-note">Este modelo genera solo desde texto. Para usar imágenes, elige un modelo con badge Refs.</p>
          ) : null}

          <section className="field-section prompt-section">
            <div className="field-label-row"><label className="field-label" htmlFor="prompt">PROMPT</label><span>{prompt.length}/2500</span></div>
            <div className="prompt-box">
              <textarea ref={promptRef} id="prompt" value={prompt} maxLength={2500} onChange={(event) => setPrompt(event.target.value)} placeholder={copy.placeholder} />
              <div className="prompt-footer">
                {selectedModel?.capabilities.promptEnhancement ? <label><Switch size="sm" checked={promptEnhancement} onCheckedChange={setPromptEnhancement} /> Mejorar prompt</label> : <span className="hint-chip"><Sparkles size={13} /> Precisión primero</span>}
                <div><button title="Copiar prompt" type="button" onClick={() => navigator.clipboard.writeText(prompt)}><Copy size={15} /></button><button title="Limpiar prompt" type="button" onClick={() => setPrompt("")}><X size={17} /></button></div>
              </div>
            </div>
          </section>

          <section className="field-section">
            <label className="field-label">AJUSTES RÁPIDOS</label>
            <div className="quick-options">
              {selectedModel?.capabilities.aspectRatio && <OptionSelect icon={<Maximize2 size={14} />} value={ratio} setValue={setRatio} options={selectedModel.supportedAspectRatios ?? []} format={(value) => ratioLabels[value] ?? value} />}
              {selectedModel?.capabilities.resolution && <OptionSelect icon={<Layers3 size={14} />} value={resolution} setValue={setResolution} options={selectedModel.supportedResolutions ?? []} format={(value) => value.toUpperCase()} />}
              {selectedModel?.capabilities.duration && <OptionSelect icon={<Clock3 size={14} />} value={duration} setValue={setDuration} options={selectedModel.supportedDurations ?? []} format={(value) => `${value}s`} />}
            </div>
          </section>

          {(selectedModel?.capabilities.seed || selectedModel?.capabilities.promptEnhancement) && (
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="advanced">
              <CollapsibleTrigger className="advanced-trigger"><span><Settings2 size={15} /> Opciones avanzadas</span><ChevronDown size={15} /></CollapsibleTrigger>
              <CollapsibleContent className="advanced-content">
                {selectedModel.capabilities.seed && <label><span>Seed</span><input value={seed} onChange={(event) => setSeed(event.target.value.replace(/\D/g, ""))} placeholder="Aleatoria" inputMode="numeric" /></label>}
                <p>Se envían únicamente parámetros que este modelo documenta.</p>
              </CollapsibleContent>
            </Collapsible>
          )}

          {error && <div className="inline-error"><CircleAlert size={15} /><span>{error}</span></div>}
        </div>
        <div className="generate-bar">
          <button type="button" onClick={submit} disabled={active?.status === "pending" || active?.status === "processing"}>
            {active?.status === "pending" || active?.status === "processing" ? <LoaderCircle className="spin" size={18} /> : <WandSparkles size={18} />}
            {active?.status === "pending" || active?.status === "processing" ? "Generando…" : copy.action}
          </button>
          <p>La generación consume créditos de tu cuenta Magnific.</p>
        </div>
      </aside>
      <ResultPanel mode={mode} active={active} history={history} baseImage={baseImage} onReuse={(record) => { setPrompt(record.prompt); setModelId(record.model); }} />
    </div>
  );
}

function StudioNav({ mode }: { mode: StudioMode }) {
  return (
    <nav className="studio-nav" aria-label="Secciones del estudio">
      <Link href="/image" className="brand-mark" aria-label="Luma Studio"><span>L</span><i /></Link>
      <div className="nav-stack">
        {navItems.map((item) => {
          const Icon = item.icon;
          return <Link href={item.href} key={item.mode} aria-current={mode === item.mode ? "page" : undefined} className={mode === item.mode ? "active" : ""}><Icon size={20} /><span>{item.label}</span></Link>;
        })}
      </div>
      <button className="nav-avatar" type="button" title="Estudio personal">TU</button>
    </nav>
  );
}

function UploadTile({ label, asset, onChange, onClear, compact = false }: { label: string; asset?: UploadAsset | null; onChange: (file?: File) => void; onClear?: () => void; compact?: boolean }) {
  return (
    <label className={`upload-tile ${compact ? "compact" : ""} ${asset ? "has-asset" : ""}`} style={asset ? { backgroundImage: `url(${asset.preview})` } : undefined}>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onChange(event.target.files?.[0])} />
      {!asset && <><Plus size={18} /><span>{label}</span></>}
      {asset && <span className="asset-label">{label}</span>}
      {asset && onClear && <button type="button" aria-label={`Quitar ${label}`} onClick={(event) => { event.preventDefault(); onClear(); }}><X size={13} /></button>}
    </label>
  );
}

function UploadBlock({ label, asset, onChange, onClear, tall = false }: { label: string; asset: UploadAsset | null; onChange: (file?: File) => void; onClear: () => void; tall?: boolean }) {
  return (
    <section className="field-section">
      <div className="field-label-row"><label className="field-label">{label}</label><span>PNG, JPG o WebP · 10 MB</span></div>
      <label className={`upload-block ${tall ? "tall" : ""} ${asset ? "has-asset" : ""}`} style={asset ? { backgroundImage: `url(${asset.preview})` } : undefined}>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onChange(event.target.files?.[0])} />
        {!asset && <><span className="upload-icon"><Upload size={20} /></span><strong>Suelta una imagen o explora</strong><small>Se usará como base de la transformación</small></>}
        {asset && <><span className="file-pill">{asset.name}</span><button type="button" aria-label="Quitar imagen" onClick={(event) => { event.preventDefault(); onClear(); }}><X size={14} /></button></>}
      </label>
    </section>
  );
}

function OptionSelect({ icon, value, setValue, options, format }: { icon: React.ReactNode; value: string; setValue: (value: string) => void; options: string[]; format: (value: string) => string }) {
  return <label className="quick-select">{icon}<select value={value} onChange={(event) => setValue(event.target.value)}>{options.map((option) => <option value={option} key={option}>{format(option)}</option>)}</select><ChevronDown size={13} /></label>;
}

function ResultPanel({ mode, active, history, baseImage, onReuse }: { mode: Exclude<StudioMode, "history">; active: GenerationRecord | null; history: GenerationRecord[]; baseImage: UploadAsset | null; onReuse: (record: GenerationRecord) => void }) {
  const recent = history.filter((item) => item.status === "completed").slice(0, 5);
  return (
    <main className="result-panel">
      <header className="result-header">
        <div><span className="live-dot" /><strong>LIENZO</strong><span>{mode === "image" ? "Imagen" : mode === "edit" ? "Edición" : "Video"}</span></div>
        <div><button type="button" title="Ajustar a pantalla"><Maximize2 size={17} /></button><button type="button" title="Más opciones"><MoreHorizontal size={19} /></button></div>
      </header>
      <div className="canvas-wrap">
        {active ? (
          <div className="active-result">
            <div className="status-line">
              <span className={`status-pill ${active.status}`}>{active.status === "pending" || active.status === "processing" ? <LoaderCircle size={13} className="spin" /> : active.status === "completed" ? <Check size={13} /> : <CircleAlert size={13} />}{friendlyStatus(active.status)}</span>
              <span>{active.modelLabel}</span><span>{active.summary.join(" · ")}</span>
            </div>
            <div className={`asset-stage ratio-${(ratioLabels[active.aspectRatio ?? ""] ?? active.aspectRatio ?? "1:1").replace(":", "-")}`}>
              {active.status === "completed" && active.resultUrl ? (
                mode === "video" ? <video controls autoPlay muted loop src={active.resultUrl} /> : mode === "edit" && baseImage ? <div className="compare-grid"><figure><img src={baseImage.preview} alt="Imagen original" /><figcaption>Original</figcaption></figure><figure><img src={active.resultUrl} alt="Resultado editado" /><figcaption>Resultado</figcaption></figure></div> : <img src={active.resultUrl} alt="Resultado generado" />
              ) : active.status === "failed" ? (
                <div className="failed-state"><CircleAlert size={28} /><strong>La generación se detuvo</strong><p>{active.error}</p></div>
              ) : (
                <div className="processing-state"><div className="orb"><span /><i /></div><strong>Convirtiendo tu idea en {mode === "video" ? "movimiento" : "imagen"}</strong><p>Magnific está procesando la tarea. Puedes mantener esta vista abierta.</p><div className="progress-track"><span /></div></div>
              )}
            </div>
            <div className="result-details">
              <div><span>Prompt</span><p>{active.prompt}</p></div>
              <div className="result-actions">
                <button type="button" onClick={() => navigator.clipboard.writeText(active.prompt)}><Copy size={15} /> Copiar prompt</button>
                {active.resultUrl && <a href={active.resultUrl} download><ArrowDownToLine size={15} /> Descargar</a>}
                <button type="button" onClick={() => onReuse(active)}><RotateCcw size={15} /> Reutilizar</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-canvas">
            <div className="canvas-aura" />
            <div className="empty-symbol"><Sparkles size={24} /></div>
            <h2>Tu próxima idea empieza aquí</h2>
            <p>Configura el modelo, escribe un prompt y genera sin salir del estudio.</p>
            <div className="empty-steps"><span><b>1</b> Elige modelo</span><i /><span><b>2</b> Describe</span><i /><span><b>3</b> Genera</span></div>
          </div>
        )}
      </div>
      <aside className="recent-rail">
        <div className="recent-heading"><span>RECIENTES</span><Link href="/history">Ver historial</Link></div>
        <div className="recent-list">
          {recent.length ? recent.map((item) => <button key={item.id} type="button" className="recent-card" onClick={() => onReuse(item)}>{item.resultUrl ? item.type === "video" ? <span className="video-thumb"><Play size={18} /></span> : <img src={item.resultUrl} alt="" /> : <span />}<div><strong>{item.prompt}</strong><small>{item.modelLabel} · {new Date(item.createdAt).toLocaleDateString("es-AR")}</small></div></button>) : <p className="no-recent">Los resultados completados aparecerán aquí.</p>}
        </div>
      </aside>
    </main>
  );
}

function HistoryView({ history, filter, setFilter, onDelete }: { history: GenerationRecord[]; filter: "all" | "image" | "edit" | "video"; setFilter: (value: "all" | "image" | "edit" | "video") => void; onDelete: (id: string) => void }) {
  const [selected, setSelected] = useState<GenerationRecord | null>(null);
  const filters = [{ id: "all", label: "Todo" }, { id: "image", label: "Imágenes" }, { id: "edit", label: "Ediciones" }, { id: "video", label: "Videos" }] as const;
  const remove = (record: GenerationRecord) => {
    if (!window.confirm(`¿Eliminar esta ${record.type === "video" ? "generación de video" : "imagen"} del historial? Esta acción no se puede deshacer.`)) return;
    onDelete(record.id);
    setSelected((current) => current?.id === record.id ? null : current);
  };
  return (
    <div className="history-shell">
      <StudioNav mode="history" />
      <main className="history-main">
        <header className="history-header"><div><span className="eyebrow">BIBLIOTECA</span><h1>Historial creativo</h1><p>Tus generaciones se guardan localmente en este navegador.</p></div><Link href="/image"><Plus size={16} /> Nueva creación</Link></header>
        <div className="history-tabs">{filters.map((item) => <button type="button" key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
        {history.length ? <div className="history-grid">{history.map((item) => <article key={item.id} className="history-card" onClick={() => setSelected(item)}><button className="history-delete" type="button" title="Eliminar del historial" aria-label="Eliminar del historial" onClick={(event) => { event.stopPropagation(); remove(item); }}><Trash2 size={15} /></button><div className="history-thumb">{item.resultUrl && item.type !== "video" ? <img src={item.resultUrl} alt="" /> : item.type === "video" ? <Film size={24} /> : item.status === "failed" ? <CircleAlert size={24} /> : <LoaderCircle className={item.status === "processing" ? "spin" : ""} size={24} />}</div><div className="history-card-body"><div><span className={`status-dot ${item.status}`} />{friendlyStatus(item.status)}<small>{item.type === "edit" ? "Edición" : item.type === "video" ? "Video" : "Imagen"}</small></div><h2>{item.prompt}</h2><p>{item.modelLabel} · {new Date(item.createdAt).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}</p></div></article>)}</div> : <div className="history-empty"><FileClock size={28} /><h2>Todavía no hay creaciones</h2><p>Cuando generes un asset, podrás volver a él desde aquí.</p><Link href="/image">Crear la primera imagen</Link></div>}
        <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
          <DialogContent className="history-dialog">
            <DialogHeader><DialogTitle>Detalle de la creación</DialogTitle><DialogDescription>{selected?.modelLabel} · {selected ? new Date(selected.createdAt).toLocaleString("es-AR") : ""}</DialogDescription></DialogHeader>
            {selected?.resultUrl ? selected.type === "video" ? <video controls src={selected.resultUrl} /> : <img src={selected.resultUrl} alt="Resultado seleccionado" /> : <div className="history-dialog-placeholder"><CircleAlert size={22} /><span>{selected?.error ?? "Este resultado todavía no tiene un asset disponible."}</span></div>}
            <div className="history-dialog-copy"><span>PROMPT</span><p>{selected?.prompt}</p></div>
            <div className="result-actions">{selected && <button type="button" onClick={() => navigator.clipboard.writeText(selected.prompt)}><Copy size={15} /> Copiar prompt</button>}{selected?.resultUrl && <a href={selected.resultUrl} download><ArrowDownToLine size={15} /> Descargar</a>}{selected && <button className="danger" type="button" onClick={() => remove(selected)}><Trash2 size={15} /> Eliminar</button>}</div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
