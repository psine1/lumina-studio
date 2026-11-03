"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileClock, Film, ImageIcon, Layers3, PencilLine, RefreshCw, Search, Sparkles } from "lucide-react";
import { SADAELS, SADAELS_DAYLIGHT } from "@/lib/social/brands";
import { brandSchema, generationSettingsSchema, projectSchema, type Brand, type Composition, type Product, type Project, type SocialImageModel, formats } from "@/lib/social/schema";
import { compose, editorialPresets } from "@/lib/social/presets";
import { referencePlan } from "@/lib/social/generation";
import { downloadComposition, mediaUrl } from "@/lib/social/composition";
import { CompositionPreview as Preview } from "@/components/social/CompositionPreview";
import { CreativeSetup } from "@/components/social/CreativeSetup";
import { ModelPresets } from "@/components/social/ModelPresets";
import { exportSession } from "@/lib/social/batch";
import { loadSessionData, saveSessionData } from "@/lib/social/storage";
import { PostEditor } from "@/components/social/PostEditor";
import { loadSocialStorage, saveStoredProject, deleteStoredProject, saveStoredBrand, deleteStoredBrand, savePendingProject, clearPendingProject } from "@/lib/social/storage";

type Tab = "products" | "creative" | "brand" | "projects";
type Catalog = { products: Product[]; currency: string; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
type Collection = { id: string; title: string };

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "No se pudo completar la solicitud.");
  return data as T;
}

async function readAsset(file: File, max = 1_000_000) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > max) throw new Error(`Usá PNG, JPG o WebP de hasta ${Math.round(max / 1_000_000)} MB.`);
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("No se pudo leer el archivo.")); reader.readAsDataURL(file);
  });
}

export function SocialStudio() {
  const [tab, setTab] = useState<Tab>("products");
  const [brand, setBrand] = useState<Brand>(SADAELS);
  const [brands, setBrands] = useState<Brand[]>([SADAELS, SADAELS_DAYLIGHT]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [catalog, setCatalog] = useState<Catalog>({ products: [], currency: "", pageInfo: { hasNextPage: false, endCursor: null } });
  const [collections, setCollections] = useState<Collection[]>([]);
  const [search, setSearch] = useState(""), [appliedSearch, setAppliedSearch] = useState("");
  const [collection, setCollection] = useState("");
  const [refresh, setRefresh] = useState(0), [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [product, setProduct] = useState<Product | null>(null), [image, setImage] = useState("");
  const [format, setFormat] = useState<Composition["format"]>("portrait");
  const [contentType, setContentType] = useState("Campaña editorial"), [approach, setApproach] = useState("Automático");
  const [textMode, setTextMode] = useState("auto"), [customText, setCustomText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [generationSettings, setGenerationSettings] = useState(() => generationSettingsSchema.parse({}));
  const [refinement, setRefinement] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false), [generation, setGeneration] = useState<{ id: string; projectId: string; model: SocialImageModel } | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [batch, setBatch] = useState<Project[]>([]);
  const [sessionReady, setSessionReady] = useState(false);
  const [directions, setDirections] = useState<{ name: string; instructions: string; approach: string; contentType: string; brand: Brand }[]>([]);
  const [directionName, setDirectionName] = useState("");
  const generationLock = useRef(false);
  const storageLock = useRef(false);
  const sessionWrites = useRef<Promise<void>>(Promise.resolve());
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let stopped = false;
    void Promise.all([loadSessionData("batch"), loadSessionData("directions")]).then(([saved, looks]) => {
      if (stopped) return;
      if (saved) setBatch(projectSchema.array().parse(saved));
      if (looks) {
        const entries = looks as typeof directions;
        if (!Array.isArray(entries) || entries.some(v => typeof v.name !== "string" || typeof v.instructions !== "string" || typeof v.approach !== "string" || typeof v.contentType !== "string")) throw new Error("Invalid directions");
        setDirections(entries.map(entry => ({ ...entry, brand: brandSchema.parse(entry.brand) })));
      }
      setSessionReady(true);
    }).catch(() => setError("No se pudo recuperar la sesi?n. Las copias guardadas se conservaron."));
    return () => { stopped = true; };
  }, []);

  useEffect(() => {
    if (!project) return;
    setBatch(current => current.some(p => p.id === project.id) ? current.map(p => p.id === project.id ? project : p) : current);
  }, [project]);

  useEffect(() => {
    if (!sessionReady) return;
    let cancelled = false;
    // Serialize writes so a slower old snapshot cannot overwrite the latest edit.
    sessionWrites.current = sessionWrites.current.catch(() => {}).then(() => saveSessionData("batch", batch));
    void sessionWrites.current.catch(() => { if (!cancelled) setError("No se pudo guardar la sesi?n. Descarg? tus proyectos antes de cerrar."); });
    return () => { cancelled = true; };
  }, [batch, sessionReady]);

  useEffect(() => {
    let stopped = false;
    void loadSocialStorage().then(({ projects: savedProjects, brand: savedBrand, brands: savedBrands, pending: value }) => {
      if (stopped) return;
      setProjects(savedProjects); setBrands(savedBrands); if (savedBrand) setBrand(savedBrand);
      setStorageReady(true);
      if (value) {
        if (value.generation?.status === "pending") {
          setProject(value); setProduct(value.product); setImage(value.composition.productImage); setTab("creative");
          setGeneration({ id: value.generation.taskId, projectId: value.id, model: value.generation.model });
          setNotice("Consultando la tarea pendiente. No se inicia otra generación ni se gastan créditos nuevos.");
        }
      }
    }).catch(() => { if (!stopped) setError("No se pudo abrir el almacenamiento de proyectos. Las copias anteriores se conservaron. Descargá el JSON de cualquier trabajo abierto antes de cerrar."); });
    return () => { stopped = true; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const query = new URLSearchParams();
    if (appliedSearch) query.set("search", appliedSearch);
    if (collection) query.set("collection", collection);
    if (cursor) query.set("after", cursor);
    void jsonRequest<Catalog>(`/api/social/catalog?${query}`, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setCatalog((previous) => ({ ...data, products: cursor ? [...previous.products, ...data.products] : data.products }));
    }).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [appliedSearch, collection, cursor, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const all: Collection[] = []; let after: string | null = null;
      do {
        const data: { nodes: Collection[]; pageInfo: Catalog["pageInfo"] } = await jsonRequest(`/api/social/catalog?resource=collections${after ? `&after=${encodeURIComponent(after)}` : ""}`, { signal: controller.signal });
        all.push(...data.nodes); after = data.pageInfo.hasNextPage ? data.pageInfo.endCursor : null;
      } while (after && !controller.signal.aborted);
      if (!controller.signal.aborted) setCollections(all);
    })().catch((e: Error) => { if (!controller.signal.aborted) setNotice(`Colecciones: ${e.message}`); });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!generation) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const poll = async () => {
      try {
        const task = await jsonRequest<{ status: string; hasImage: boolean; failureReason?: string }>(`/api/social/generations/${encodeURIComponent(generation.id)}?model=${generation.model}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (task.status === "completed") {
          if (!task.hasImage) throw new Error("Magnific terminó sin devolver una imagen.");
          const response = await fetch(`/api/social/generations/${encodeURIComponent(generation.id)}?asset=1&model=${generation.model}`, { signal: controller.signal });
          if (!response.ok) throw new Error("No se pudo descargar el resultado. Usá Consultar resultado para recuperarlo sin pagar otra generación.");
          const blob = await response.blob();
          if (!["image/png", "image/jpeg", "image/webp"].includes(blob.type) || blob.size > 10_000_000) throw new Error("El resultado no tiene un formato o tamaño compatible.");
          const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
          if (controller.signal.aborted) return;
          setProject((current) => current?.id === generation.projectId ? { ...current, updatedAt: new Date().toISOString(), generation: { ...current.generation, taskId: generation.id, model: generation.model, status: "completed" }, composition: { ...current.composition, generatedImage: data, aiReviewed: false } } : current);
          try { await clearPendingProject(); } catch { /* Download remains available. */ }
          setNotice("Posteo generado con Magnific. Compará la prenda con el original antes de descargar; el texto y el logo siguen editables."); setGeneration(null);
        } else if (task.status === "failed") {
          setProject((current) => current?.id === generation.projectId ? { ...current, generation: { ...current.generation, taskId: generation.id, model: generation.model, status: "failed", failureReason: task.failureReason } } : current);
          try { await clearPendingProject(); } catch { /* Keep visible failure. */ }
          throw new Error("Magnific no pudo generar el posteo. No se reintentó ni se inició otra generación.");
        } else if (Date.now() - started > 10 * 60_000) throw new Error("La tarea sigue pendiente. Usá Consultar resultado para revisar su estado sin generar otra imagen.");
        else timer = setTimeout(poll, 4000);
      } catch (e) { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : "No se pudo consultar la tarea. Conservá el ID para recuperarla."); setGeneration(null); } }
    };
    timer = setTimeout(poll, 1500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [generation]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!project || projects.some((saved) => saved.id === project.id && saved.updatedAt === project.updatedAt)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [project, projects]);

  useEffect(() => {
    if (!product || project) return;
    const controller = new AbortController();
    const id = product.id;
    void jsonRequest<{ product: Product }>(`/api/social/catalog?product=${encodeURIComponent(id)}`, { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      setProduct((current) => current?.id === id ? data.product : current);
      setImage((current) => data.product.images.nodes.some((asset) => asset.url === current) ? current : data.product.images.nodes[0]?.url || "");
    }).catch((failure: Error) => { if (!controller.signal.aborted) setNotice(`No se pudieron completar las fotos: ${failure.message}`); });
    return () => controller.abort();
  }, [product?.id, Boolean(project)]);

  function chooseProduct(value: Product) {
    setProduct(value); setImage(value.images.nodes[0]?.url || ""); setProject(null); setError("");
  }
  function updateComposition(patch: Partial<Composition>) { setProject((current) => current ? { ...current, composition: { ...current.composition, ...patch }, updatedAt: new Date().toISOString() } : null); }
  async function openEditor() {
    if (!product || !image || !sessionReady) return;
    let next = editorialPresets(product, brand, textMode === "custom" ? customText : "", textMode === "none", textMode === "custom");
    if (contentType === "Material y detalle") next = [next[1], next[0], next[2]];
    if (contentType === "Composición mínima" || approach === "Minimalista") next = [next[2], next[0], next[1]];
    const backgroundDirections: Record<string, string> = {
      Cinemático: "Empty weathered architectural interior, dramatic chiaroscuro, deep shadows and subtle analog film grain.",
      Brutalista: "Empty raw brutalist concrete structure, severe geometric shadows, desaturated neutral palette.",
      Minimalista: "Empty minimalist matte wall, subtle directional light, ample clean negative space.",
      Experimental: "Empty abstract architectural space, asymmetrical metallic reflections, dark brown and crimson accents.",
    };
    if (backgroundDirections[approach]) next = next.map((item) => ({ ...item, imagePrompt: item.imagePrompt ? `${backgroundDirections[approach]} Background only, no people, garments, products, typography or logos.` : null }));
    next = next.map((item) => ({ ...item, visualDirection: `${item.visualDirection}\nBrief: ${contentType}. Enfoque: ${approach}.${instructions ? `\nNotas del usuario: ${instructions}` : ""}`.slice(0, 2000) }));
    // Preserve the previous session's editable pieces before replacing its active queue.
    try { for (const piece of batch) await saveStoredProject(piece); }
    catch { setError("No se pudo conservar la sesi?n anterior. Guard? sus piezas antes de iniciar otra."); return; }
    if (batch.length) setProjects(current => [...batch, ...current.filter(p => !batch.some(piece => piece.id === p.id))]);
    const concept = next[0];
    const date = new Date().toISOString();
    const value: Project = { id: crypto.randomUUID(), brand: { ...brand }, product, concept, creativeBrief: `${contentType}. Enfoque: ${approach}.\n${instructions}`.slice(0, 1500), generationSettings, composition: compose(concept, image, brand, format), createdAt: date, updatedAt: date };
    const sessionId = crypto.randomUUID();
    const chosen = selectedProducts.length ? selectedProducts : [product];
    const pieces = chosen.map(item => {
      const ownConcepts = editorialPresets(item, brand, textMode === "custom" ? customText : "", textMode === "none", textMode === "custom");
      const ownConcept = { ...(ownConcepts.find(candidate => candidate.layout === concept.layout) || ownConcepts[0]), visualDirection: concept.visualDirection };
      return { ...value, id: crypto.randomUUID(), sessionId, product: item, concept: ownConcept, composition: compose(ownConcept, item.id === product.id ? image : item.images.nodes[0].url, brand, format) };
    });
    setBatch(pieces); setProject(pieces[0]); setProduct(pieces[0].product); setImage(pieces[0].composition.productImage); setTab("creative");
  }
  async function downloadBatch(zip: boolean) {
    setBusy(true); setError("");
    try { await exportSession(batch.map(p => project?.id === p.id ? project : p), zip); setNotice("Batch descargado."); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo exportar el batch."); }
    finally { setBusy(false); }
  }
  async function saveDirection() {
    if (!directionName.trim()) { setError("Escrib? un nombre para la direcci?n de arte."); return; }
    const next = [...directions.filter(d => d.name !== directionName.trim()), { name: directionName.trim(), instructions: project?.creativeBrief ?? instructions, approach, contentType, brand: project?.brand ?? brand }];
    try { await saveSessionData("directions", next); setDirections(next); setNotice("Direcci?n de arte guardada en este navegador."); }
    catch { setError("No se pudo guardar la direcci?n de arte."); }
  }
  async function saveProject(value = project) {
    if (!value || storageLock.current) return false;
    if (!storageReady) { setError("El almacenamiento todavía no está disponible. Descargá el proyecto JSON para conservarlo."); return false; }
    storageLock.current = true; setBusy(true);
    try {
      const parsed = projectSchema.parse(value);
      await saveStoredProject(parsed);
      setProjects((current) => [parsed, ...current.filter((p) => p.id !== parsed.id)]); setError(""); setNotice("Proyecto guardado. Podés retomarlo desde Mis creaciones."); return true;
    } catch { setError("No se pudo guardar el proyecto. Revisá el espacio o los permisos del navegador; descargá el JSON como respaldo."); return false; }
    finally { storageLock.current = false; setBusy(false); }
  }
  async function deleteProject(value: Project) {
    if (!storageReady || storageLock.current) return;
    if (!window.confirm(`¿Eliminar "${value.concept.name}" de Mis creaciones? Se borrará la copia guardada en este navegador. Esta acción no se puede deshacer.`)) return;
    storageLock.current = true; setBusy(true);
    try {
      await deleteStoredProject(value.id);
      setProjects((current) => current.filter((saved) => saved.id !== value.id)); setError("");
      setNotice("Creación eliminada. Se liberó el espacio de su copia guardada.");
    } catch { setError("No se pudo eliminar la creación. Probá de nuevo."); }
    finally { storageLock.current = false; setBusy(false); }
  }
  async function exportImage(kind: "png" | "jpeg") {
    if (!project) return;
    if (project.composition.generatedImage && !project.composition.aiReviewed) { setError("Compará la prenda con el original y marcá la revisión antes de descargar."); return; }
    setBusy(true); setError("");
    try { await downloadComposition(project.composition, project.brand, `${project.brand.name}-${project.product.title}-${project.concept.name}`, kind); setNotice("Imagen descargada. No se publicó ni se subió a Shopify."); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo exportar."); } finally { setBusy(false); }
  }
  async function saveBrand(value = brand) {
    if (!storageReady || storageLock.current) return;
    storageLock.current = true; setBusy(true);
    try { const parsed = brandSchema.parse(value); await saveStoredBrand(parsed); setBrand(parsed); setBrands((current) => current.some((item) => item.id === parsed.id) ? current.map((item) => item.id === parsed.id ? parsed : item) : [...current, parsed]); setError(""); setNotice("Brand Kit guardado en este navegador. Disponible en el brief y en el editor."); }
    catch { setError("No se pudo guardar el Brand Kit. Revisá los campos y los permisos del navegador."); }
    finally { storageLock.current = false; setBusy(false); }
  }
  async function deleteBrand() {
    if (!storageReady || storageLock.current || generation) return;
    if (!window.confirm(`¿Eliminar "${brand.name}"? Se quitará de tus Brand Kits. Los proyectos existentes conservarán su copia. Los cambios sin guardar de este kit se perderán.`)) return;
    storageLock.current = true; setBusy(true);
    try {
      const remaining = await deleteStoredBrand(brand.id);
      setBrands(remaining); setBrand(remaining[0]); setError("");
      setNotice("Brand Kit eliminado. Los proyectos existentes conservan su identidad.");
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudo eliminar el Brand Kit."); }
    finally { storageLock.current = false; setBusy(false); }
  }
  function selectBrand(id: string, inEditor = false) {
    const selected = brands.find((item) => item.id === id);
    if (!selected) return;
    setBrand(selected);
    if (inEditor) setProject((current) => current ? { ...current, brand: { ...selected }, composition: { ...current.composition, font: selected.typography, ...(!current.composition.generatedImage ? { background: current.composition.layout === "detail" ? selected.colors[2] || "#eee9df" : selected.colors[0], textColor: current.composition.layout === "detail" ? selected.colors[0] : selected.colors[2] || "#eee9df" } : {}), logoVisible: current.composition.logoVisible && Boolean(selected.logo) }, updatedAt: new Date().toISOString() } : null);
  }
  function brandSelector(inEditor = false) {
    const selected = inEditor && project ? project.brand : brand;
    return <label>Brand Kit<select disabled={!storageReady || busy || !!generation} value={selected.id} onChange={(event) => selectBrand(event.target.value, inEditor)}>{!brands.some((item) => item.id === selected.id) && <option value={selected.id}>{selected.name} (del proyecto)</option>}{brands.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.name}</option>)}</select><span className="post-field-hint">{inEditor ? "Este kit guía la próxima generación. Las capas se editan por separado." : "Elegí la identidad visual para este posteo."}</span></label>;
  }
  async function generatePost(value = project) {
    if (!value || generationLock.current || generation) return;
    const index = batch.findIndex(p => p.id === value.id);
    if (index > 0 && batch.slice(0, index).some(p => !p.composition.aiReviewed)) { setError("Aprob? las im?genes anteriores antes de generar esta pieza."); return; }
    if (value.generation?.status === "pending") {
      setGeneration({ id: value.generation.taskId, projectId: value.id, model: value.generation.model });
      setNotice("Consultando la tarea existente; no se gastan créditos en otra imagen."); return;
    }
    generationLock.current = true; setBusy(true); setError("");
    try {
      const task = await jsonRequest<{ taskId: string; model: SocialImageModel; productReferenceCount: number; totalProductImages: number }>("/api/social/generations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), productId: value.product.id, imageUrl: value.composition.productImage,
          brand: { name: value.brand.name, description: value.brand.description, direction: value.brand.direction, prohibited: value.brand.prohibited, instructions: value.brand.instructions },
          format: value.composition.format, layout: value.composition.layout, brief: value.creativeBrief || instructions || "", refinement, generationSettings: generationSettingsSchema.parse(value.generationSettings || {}), expectedModel: referencePlan(value.product, value.composition.productImage, generationSettingsSchema.parse(value.generationSettings || {})).model }),
      });
      const pending: Project = { ...value, generation: { taskId: task.taskId, model: task.model, productReferenceCount: task.productReferenceCount, totalProductImages: task.totalProductImages, status: "pending" } };
      setProject((current) => current?.id === value.id ? { ...current, generation: pending.generation } : pending); setGeneration({ id: task.taskId, projectId: value.id, model: task.model }); setRefinement("");
      try { await savePendingProject(pending); } catch { setNotice(`Tarea ${task.taskId} iniciada. No cierres esta página: no se pudo guardar la tarea pendiente.`); }
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo generar el posteo. No se reintentó automáticamente."); }
    finally { generationLock.current = false; setBusy(false); }
  }

  function projectJson() {
    if (!project) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `social-${project.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importProject(file: File) {
    try {
      if (file.size > 150_000_000) throw new Error("El proyecto supera 150 MB.");
      const value = projectSchema.parse(JSON.parse(await file.text()));
      setProject({ ...value, id: crypto.randomUUID() }); setProduct(value.product); setImage(value.composition.productImage); setTab("creative"); setNotice("Proyecto importado como una nueva copia. Guardalo para conservarlo en este navegador.");
    } catch { setError("El archivo no es un proyecto Social Studio válido."); }
  }

  return <div className="social-shell">
    <nav className="studio-nav" aria-label="Secciones del estudio"><Link href="/image" className="brand-mark" aria-label="Lumina Studio"><span>L</span><i /></Link><div className="nav-stack">
      <Link href="/image"><ImageIcon size={20} /><span>Imagen</span></Link><Link href="/edit"><PencilLine size={20} /><span>Editar</span></Link><Link href="/video"><Film size={20} /><span>Video</span></Link><Link href="/history"><FileClock size={20} /><span>Historial</span></Link><Link href="/social" className="active" aria-current="page"><Layers3 size={20} /><span>Social</span></Link>
    </div><span className="nav-avatar">TU</span></nav>
    <main className={`social-main ${tab === "creative" && project ? "is-editing" : ""}`}>
      <header className="social-header"><div><span className="eyebrow">DIRECCIÓN CREATIVA · {brand.name}</span><h1>Social Studio<span>.</span></h1><p>Del catálogo a una nueva mirada.</p></div><span className="social-readonly">Shopify · solo lectura</span></header>
      <div className="social-tabs" role="tablist" aria-label="Social Studio">{([{ id: "products", name: "Nueva sesi?n" }, { id: "creative", name: "Piezas de la sesi?n" }, { id: "brand", name: "Marca" }, { id: "projects", name: "Mis creaciones" }] as const).map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setError(""); }}>{item.name}</button>)}</div>
      {error && <div className="social-message error" role="alert">{error}<button aria-label="Cerrar error" onClick={() => setError("")}>×</button></div>}
      {notice && <div className="social-message" role="status">{notice}<button aria-label="Cerrar aviso" onClick={() => setNotice("")}>×</button></div>}

      {tab === "products" && <>
        <section className="session-start"><span className="eyebrow">01 ? CONFIGURAR SESI?N</span><h2>Una direcci?n de arte. Varias piezas.</h2>{batch.length > 0 && <button className="social-primary" disabled={!!generation} onClick={() => { const p = batch.find(piece => !piece.composition.aiReviewed) || batch[0]; setProject(p); setProduct(p.product); setImage(p.composition.productImage); setTab("creative"); }}>Retomar sesi?n ? {batch.length} piezas</button>}<h3>Primero, el formato</h3><div className="creative-format-grid">{Object.entries(formats).map(([key, value]) => <button key={key} aria-pressed={format === key} disabled={!!generation} onClick={() => setFormat(key as Composition["format"])}><strong>{value.label}</strong></button>)}</div>
        <h3>Prendas de la sesi?n ? {selectedProducts.length} seleccionadas</h3><p>Seleccion? hasta 20 prendas. Se prepara una pieza por prenda, con el mismo formato, modelo y direcci?n de arte.</p>
        <div className="social-inline-actions">{selectedProducts.map(p => <button key={p.id} disabled={!!generation} onClick={() => setSelectedProducts(items => items.filter(item => item.id !== p.id))}>{p.title} ?</button>)}</div>
        <ModelPresets settings={generationSettings} onChange={setGenerationSettings} onError={setError} />
        <label>Reutilizar direcci?n de arte<select value="" onChange={e => { const d = directions[Number(e.target.value)]; if (d) { setInstructions(d.instructions); setApproach(d.approach); setContentType(d.contentType); setBrand(d.brand); } }}><option value="">Eleg? una direcci?n guardada</option>{directions.map((d, i) => <option key={d.name} value={i}>{d.name}</option>)}</select></label>
        {selectedProducts.length > 0 && <button className="social-primary" disabled={!!generation} onClick={() => { chooseProduct(selectedProducts[0]); setTab("creative"); }}>Preparar {selectedProducts.length} piezas</button>}</section>
        <div className="social-toolbar"><form onSubmit={(event) => { event.preventDefault(); setCursor(null); setCatalog((c) => ({ ...c, products: [] })); setAppliedSearch(search); }}><Search size={17} /><input aria-label="Buscar productos" placeholder="Buscar en el catálogo…" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={150} /><button type="submit">Buscar</button></form><select aria-label="Filtrar colección" value={collection} onChange={(event) => { setCollection(event.target.value); setCursor(null); setCatalog((c) => ({ ...c, products: [] })); }}><option value="">Todas las colecciones</option>{collections.map((value) => <option key={value.id} value={value.id}>{value.title}</option>)}</select><button disabled={loading} onClick={() => { setCursor(null); setRefresh((r) => r + 1); }}><RefreshCw size={16} /> Actualizar</button></div>
        {product ? <section className="social-product-detail"><button className="social-back" onClick={() => setProduct(null)}><ArrowLeft size={16} /> Volver al catálogo</button><div className="social-product-columns"><div><img className="social-product-photo" src={mediaUrl(image)} alt={product.title} /><div className="social-thumbnails">{product.images.nodes.map((asset) => <button key={asset.id} className={image === asset.url ? "selected" : ""} onClick={() => setImage(asset.url)} aria-label={asset.altText || "Seleccionar referencia"}><img src={mediaUrl(asset.url)} alt={asset.altText || product.title} /></button>)}</div></div><div><span className="eyebrow">FOTOGRAFÍA ORIGINAL · {product.status}</span><h2>{product.title}</h2><p className="social-description">{product.description || "Sin descripción en el catálogo."}</p><p>{product.productType} {product.collections.nodes.length > 0 && `· ${product.collections.nodes.map((c) => c.title).join(" / ")}`}</p><div className="social-tags">{product.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><h3>Variantes</h3><div className="social-variants">{product.variants.nodes.map((variant) => <div key={variant.id}><span>{variant.title}</span><strong>{variant.price} {catalog.currency}</strong></div>)}</div>{(product.variants.pageInfo.hasNextPage || product.images.pageInfo.hasNextPage || product.collections.pageInfo.hasNextPage) && <p className="social-muted">Vista limitada a 30 imágenes, 50 variantes y 20 colecciones por producto.</p>}<button className="social-primary" disabled={!image} onClick={() => { setTab("creative"); setProject(null); }}><Sparkles size={17} /> Crear contenido</button></div></div></section> : <>
          <div className="social-section-heading"><span>{catalog.products.length} productos cargados</span><span>Imágenes originales de Shopify</span></div>
          {loading && !catalog.products.length ? <div className="social-catalog-skeleton" role="status" aria-label="Cargando productos"><span className="sr-only">Leyendo el catálogo de Shopify…</span><div className="social-product-grid" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <div className="social-skeleton-card" key={index}><i /><span /><b /></div>)}</div></div> : <div className="social-product-grid">{catalog.products.map((value) => <button className="social-product-card" key={value.id} disabled={!!generation} aria-pressed={selectedProducts.some(p => p.id === value.id)} onClick={() => { if (!value.images.nodes.length) { setError("Este producto no tiene fotograf?as."); return; } setSelectedProducts(items => items.some(p => p.id === value.id) ? items.filter(p => p.id !== value.id) : items.length < 20 ? [...items, value] : items); }}><div>{value.images.nodes[0] ? <img loading="lazy" src={mediaUrl(value.images.nodes[0].url)} alt={value.title} /> : <ImageIcon size={32} />}</div><span>{value.productType || brand.name}</span><h3>{value.title}</h3><p>{value.variants.nodes[0]?.price} {catalog.currency}</p></button>)}</div>}
          {!loading && !catalog.products.length && <div className="social-empty"><Layers3 /><h2>{error ? "El catálogo todavía no está disponible" : "No encontramos productos"}</h2><p>{collection && appliedSearch ? "La búsqueda filtra cada página de la colección. Cargá la siguiente para seguir buscando." : "Probá otra búsqueda o actualizá el catálogo."}</p></div>}
          {catalog.pageInfo.hasNextPage && <button className="social-loadmore" disabled={loading} onClick={() => setCursor(catalog.pageInfo.endCursor)}>{loading ? "Cargando…" : "Cargar más productos"}</button>}
        </>}
      </>}

      {tab === "creative" && <>
        {!product ? <div className="social-empty"><Sparkles /><h2>Creá tu próximo posteo.</h2><p>Elegí un producto y su fotografía de referencia para comenzar.</p><button className="social-primary" onClick={() => setTab("products")}>Explorar productos</button></div> : <>
          <ol className="social-workflow" aria-label="Progreso del posteo">{["Formato, prendas y modelos", "Generar y aprobar", "Dise?ar y exportar"].map((label, index) => <li key={label} className={index === (project?.composition.aiReviewed ? 2 : 1) ? "current" : index < (project?.composition.aiReviewed ? 2 : 1) ? "complete" : ""} aria-current={index === (project?.composition.aiReviewed ? 2 : 1) ? "step" : undefined}><span>{index < (project?.composition.aiReviewed ? 2 : 1) ? "✓" : `0${index + 1}`}</span>{label}</li>)}</ol>
          {!project && <div className="social-selected-product"><img src={mediaUrl(image)} alt={product.title} /><div><span className="eyebrow">TU PRODUCTO</span><h2>{product.title}</h2></div><button disabled={!!generation} onClick={() => { setTab("products"); setProject(null); }}>Cambiar producto</button></div>}
          {!project && brandSelector()}
          {!project && <CreativeSetup generationSettings={generationSettings} onGenerationSettings={setGenerationSettings} onError={setError} product={product} image={image} format={format} contentType={contentType} approach={approach} textMode={textMode} customText={customText} instructions={instructions} onImage={setImage} onFormat={setFormat} onContentType={setContentType} onApproach={setApproach} onTextMode={setTextMode} onCustomText={setCustomText} onInstructions={setInstructions} onPrepare={() => void openEditor()} />}
          {project && !(project.composition.generatedImage && project.composition.aiReviewed && project.generation?.status !== "pending") && <section className="session-review"><div className="social-section-heading"><div><span className="eyebrow">02 ? GENERAR Y APROBAR</span><h2>{project.product.title}</h2><p>Revis? color, calce, rostro y detalles antes de dise?ar.</p></div><button disabled={busy || !!generation} onClick={() => { setGenerationSettings(project.generationSettings); setInstructions(project.creativeBrief); setProject(null); }}>Volver al brief</button></div><div className="session-comparison"><figure><img src={mediaUrl(project.composition.productImage)} alt="Prenda original" /><figcaption>Referencia original</figcaption></figure><figure>{project.composition.generatedImage ? <img src={project.composition.generatedImage} alt="Resultado para aprobar" /> : <div className="social-empty">{generation ? "Generando imagen?" : "Tu imagen aparecer? ac?"}</div>}<figcaption>Imagen generada ? {project.composition.aiReviewed ? "Aprobada" : "Pendiente de aprobaci?n"}</figcaption></figure></div>{project.generation && <div className="social-message" role="status"><div><strong>{project.generation.status === "failed" ? "La generaci?n fall?" : "Tarea de Magnific"}</strong><p>ID: {project.generation.taskId}</p>{project.generation.failureReason && <p>{project.generation.failureReason === "The AI model did not return a generated result" ? "El modelo de IA no devolvi? una imagen. Pod?s ajustar el brief o probar Nano Banana Pro." : project.generation.failureReason}</p>}<button disabled={busy || !!generation} onClick={() => setGeneration({ id: project.generation!.taskId, projectId: project.id, model: project.generation!.model })}>Consultar esta tarea ? sin generar otra</button></div></div>}<label>Modelo de IA para la pr?xima generaci?n<select disabled={busy || !!generation || project.generation?.status === "pending"} value={project.generationSettings.model} onChange={e => setProject(current => current ? { ...current, generationSettings: { ...current.generationSettings, model: e.target.value as typeof current.generationSettings.model }, updatedAt: new Date().toISOString() } : current)}><option value="auto">Autom?tico ? seg?n referencias</option><option disabled={project.generationSettings.creativeMode === "new-model" && project.generationSettings.modelViews.length > 2} value="nano-banana-pro-flash">Nano Banana Pro Flash</option><option value="nano-banana-pro">Nano Banana Pro</option></select><span className="social-muted">Consultar una tarea no genera otra imagen. Generar o probar otro modelo usa cr?ditos.</span></label><label>Ajustes para la pr?xima versi?n<textarea rows={2} maxLength={700} value={refinement} disabled={busy || !!generation} onChange={e => setRefinement(e.target.value)} /></label><div className="social-inline-actions"><button className="social-primary" disabled={busy || !!generation} onClick={() => void generatePost()}>{generation ? "Generando?" : project.generation?.status === "pending" ? "Consultar resultado" : project.composition.generatedImage ? "Regenerar esta pieza" : "Generar esta imagen"}</button><button disabled={busy || !!generation || !project.composition.generatedImage || project.generation?.status === "pending"} onClick={() => updateComposition({ aiReviewed: true })}>Aprobar imagen y abrir editor</button></div><p className="social-muted">Generar o regenerar usa cr?ditos. La pr?xima pieza se genera despu?s de aprobar esta imagen.</p></section>}
          {project && project.composition.generatedImage && project.composition.aiReviewed && project.generation?.status !== "pending" && <PostEditor brandControl={brandSelector(true)} key={project.id} project={project} busy={busy} generating={Boolean(generation)} refinement={refinement} savedAt={projects.find((value) => value.id === project.id)?.updatedAt} onRefinement={setRefinement} onComposition={updateComposition} onProject={(patch) => setProject((current) => current ? { ...current, ...patch, updatedAt: new Date().toISOString() } : null)} onGenerate={() => { updateComposition({ aiReviewed: false }); void generatePost(); }} onBack={() => { setGenerationSettings(project.generationSettings); setInstructions(project.creativeBrief); setFormat(project.composition.format); setImage(project.composition.productImage); setRefinement(""); setProject(null); }} onSave={() => saveProject()} onExport={exportImage} onProjectDownload={projectJson} onBackgroundUpload={async (file) => { try { updateComposition({ backgroundImage: await readAsset(file, 3_000_000) }); } catch (failure) { setError((failure as Error).message); } }} onNotice={setNotice} onError={setError} />}
        </>}
      </>}

      {tab === "creative" && batch.length > 0 && <section className="session-batch"><div className="social-section-heading"><div><span className="eyebrow">SESI?N ? {batch.length} PIEZAS</span><h2>{batch.filter(p => p.composition.aiReviewed).length} aprobadas</h2></div><button disabled={busy || !!generation} onClick={() => { setProject(null); setProduct(null); setSelectedProducts([]); setTab("products"); }}>Nueva sesi?n</button></div><div className="session-piece-grid">{batch.map((p, index) => <button key={p.id} disabled={busy || !!generation || batch.slice(0, index).some(previous => !previous.composition.aiReviewed)} aria-pressed={project?.id === p.id} onClick={() => { setProject(p); setProduct(p.product); setImage(p.composition.productImage); setRefinement(""); }}>{p.composition.generatedImage ? <img src={p.composition.generatedImage} alt={p.product.title} /> : <img src={mediaUrl(p.composition.productImage)} alt={p.product.title} />}<strong>{index + 1}. {p.product.title}</strong><span>{p.generation?.status === "pending" ? "Generando" : p.composition.aiReviewed ? "Aprobada ? editar pieza" : "Pendiente de aprobaci?n"}</span></button>)}</div><div className="social-inline-actions"><button className="social-primary" disabled={busy || !!generation || batch.some(p => !p.composition.generatedImage || !p.composition.aiReviewed)} onClick={() => void downloadBatch(true)}>Descargar batch ZIP</button><button disabled={busy || !!generation || batch.some(p => !p.composition.generatedImage || !p.composition.aiReviewed)} onClick={() => void downloadBatch(false)}>Descargar im?genes sueltas</button></div><label>Guardar direcci?n de arte<input maxLength={80} placeholder="Nombre de la direcci?n" value={directionName} onChange={e => setDirectionName(e.target.value)} /></label><button disabled={busy || !sessionReady} onClick={() => void saveDirection()}>Guardar direcci?n de esta sesi?n</button><p className="social-muted">La sesi?n y sus piezas se conservan en este navegador. Pod?s editar cada imagen aprobada antes de exportar.</p></section>}

      {tab === "brand" && <section className="social-brand">{brandSelector()}<div className="social-inline-actions"><button disabled={!storageReady || busy} onClick={() => void saveBrand({ ...brand, id: crypto.randomUUID(), name: `${brand.name.slice(0, 85)} (copia)` })}>Crear otro Brand Kit</button><button disabled={!storageReady || busy || !!generation || brands.length < 2} title={brands.length < 2 ? "Creá otro kit antes de eliminar el último" : undefined} onClick={() => void deleteBrand()}>Eliminar Brand Kit</button><span className="social-muted">Se crea una copia editable. Guardá los cambios para conservarla.</span></div><div className="social-section-heading"><div><span className="eyebrow">IDENTIDAD Y CRITERIO</span><h2>{brand.name} / Brand Kit</h2></div><span>Configuración exclusiva de Social Studio</span></div><div className="social-config"><label>Nombre<input value={brand.name} maxLength={100} onChange={(e) => setBrand({ ...brand, name: e.target.value })} /></label><label>Tipografía<select value={brand.typography} onChange={(e) => setBrand({ ...brand, typography: e.target.value as Brand["typography"] })}><option>Arial</option><option>Georgia</option><option>Times New Roman</option></select></label><label className="social-wide">Descripción<textarea value={brand.description} onChange={(e) => setBrand({ ...brand, description: e.target.value })} /></label><label className="social-wide">Tono de voz<textarea value={brand.tone} onChange={(e) => setBrand({ ...brand, tone: e.target.value })} /></label><label className="social-wide">Dirección visual<textarea rows={5} value={brand.direction} onChange={(e) => setBrand({ ...brand, direction: e.target.value })} /></label><label className="social-wide">Estilos y expresiones prohibidas<textarea value={brand.prohibited} onChange={(e) => setBrand({ ...brand, prohibited: e.target.value })} /></label><label className="social-wide">Instrucciones creativas<textarea rows={5} value={brand.instructions} onChange={(e) => setBrand({ ...brand, instructions: e.target.value })} /></label></div><h3>Paleta</h3><div className="social-palette">{brand.colors.map((color, index) => <label key={index}><input type="color" value={color} onChange={(e) => setBrand({ ...brand, colors: brand.colors.map((c, i) => i === index ? e.target.value : c) })} />{color}</label>)}</div><h3>Logo original</h3>{brand.logo && <><img className="social-logo-preview" src={brand.logo} alt="Logo original" /><button onClick={() => setBrand({ ...brand, logo: null })}>Quitar logo</button></>}<label className="social-file">Cargar logo · PNG, JPG o WebP, hasta 1 MB<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const file = e.target.files?.[0]; if (file) try { setBrand({ ...brand, logo: await readAsset(file) }); } catch (err) { setError((err as Error).message); } }} /></label><h3>Referencias aprobadas</h3><div className="social-thumbnails">{brand.references.map((reference, index) => <button key={index} onClick={() => setBrand({ ...brand, references: brand.references.filter((_, i) => i !== index) })} aria-label="Quitar referencia"><img src={reference} alt={`Referencia ${index + 1}`} /></button>)}</div><label className="social-file">Agregar referencia · hasta 6 imágenes<input disabled={brand.references.length >= 6} type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const file = e.target.files?.[0]; if (file) try { setBrand({ ...brand, references: [...brand.references, await readAsset(file, 500_000)] }); } catch (err) { setError((err as Error).message); } }} /></label><p className="social-muted">Las referencias se guardan para consulta; los presets no hacen análisis visual automático. Las credenciales Shopify se configuran exclusivamente en el servidor.</p><button className="social-primary" disabled={busy || !storageReady} onClick={() => void saveBrand()}>Guardar Brand Kit</button></section>}

      {tab === "projects" && <><div className="social-section-heading"><div><h2>Mis creaciones</h2><p className="social-muted">{storageReady ? "Proyectos guardados en este navegador · IndexedDB" : "Abriendo el almacenamiento de proyectos…"}</p></div><label className="social-file">Importar proyecto JSON<input type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importProject(file); }} /></label></div>{!storageReady ? <div className="social-empty" role="status">Esperando el almacenamiento local. Si aparece un error, conservá tus copias JSON.</div> : projects.length ? <div className="social-concepts social-library">{projects.map((value) => <article key={value.id}><Preview composition={value.composition} brand={value.brand} /><div><span className="eyebrow">{value.brand.name} · {value.composition.generatedImage ? "IMAGEN GENERADA" : "BOCETO EDITABLE"}</span><h2>{value.concept.name}</h2><p>{value.product.title}</p><small>{new Date(value.updatedAt).toLocaleDateString("es-AR")}</small><div className="social-inline-actions"><button disabled={!!generation} onClick={() => { setProject(value); setProduct(value.product); setImage(value.composition.productImage); setTab("creative"); }}>Abrir</button><button disabled={!!generation} onClick={() => { const copy = { ...value, id: crypto.randomUUID(), createdAt: new Date().toISOString() }; setProduct(value.product); setImage(value.composition.productImage); setProject(copy); setTab("creative"); setNotice("Nueva copia editable. Guardala para conservarla."); }}>Duplicar</button><button disabled={busy || !!generation || !storageReady} onClick={() => void deleteProject(value)}>Eliminar</button></div></div></article>)}</div> : <div className="social-empty"><Layers3 /><h2>Todavía no hay creaciones</h2><p>Guardá una composición para volver a editarla.</p><button className="social-primary" onClick={() => setTab("products")}>Elegir producto</button></div>}</>}
    </main>
  </div>;
}
