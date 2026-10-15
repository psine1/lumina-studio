"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileClock, Film, ImageIcon, Layers3, PencilLine, Plus, RefreshCw, Search, Sparkles } from "lucide-react";
import { SADAELS } from "@/lib/social/brands";
import { brandSchema, projectSchema, type Brand, type Composition, type Concept, type Product, type Project } from "@/lib/social/schema";
import { compose, editorialPresets } from "@/lib/social/presets";
import { downloadComposition, mediaUrl } from "@/lib/social/composition";
import { CompositionPreview as Preview } from "@/components/social/CompositionPreview";
import { CreativeSetup } from "@/components/social/CreativeSetup";
import { PostEditor } from "@/components/social/PostEditor";

const BRAND_KEY = "luma-social-brands-v1", PROJECT_KEY = "luma-social-projects-v1", PENDING_KEY = "luma-social-pending-v1";
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
  const [refinement, setRefinement] = useState("");
  const [concepts, setConcepts] = useState<Concept[]>([]), [project, setProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false), [generation, setGeneration] = useState<{ id: string; projectId: string } | null>(null);
  const generationLock = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(BRAND_KEY);
      if (saved) setBrand(brandSchema.parse(JSON.parse(saved)));
      const savedProjects: unknown = JSON.parse(localStorage.getItem(PROJECT_KEY) || "[]");
      if (Array.isArray(savedProjects)) setProjects(savedProjects.flatMap((value) => { const parsed = projectSchema.safeParse(value); return parsed.success ? [parsed.data] : []; }));
      const pending = localStorage.getItem(PENDING_KEY);
      if (pending) {
        const value = projectSchema.parse(JSON.parse(pending));
        if (value.generation?.status === "pending") {
          setProject(value); setProduct(value.product); setImage(value.composition.productImage); setTab("creative");
          setGeneration({ id: value.generation.taskId, projectId: value.id });
          setNotice("Consultando la tarea pendiente. No se inicia otra generación ni se gastan créditos nuevos.");
        }
      }
    } catch { setNotice("No se pudo leer parte de los datos locales. Los archivos originales siguen disponibles en Shopify."); }
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
        const task = await jsonRequest<{ status: string; hasImage: boolean }>(`/api/social/generations/${encodeURIComponent(generation.id)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (task.status === "completed") {
          if (!task.hasImage) throw new Error("Magnific terminó sin devolver una imagen.");
          const response = await fetch(`/api/social/generations/${encodeURIComponent(generation.id)}?asset=1`, { signal: controller.signal });
          if (!response.ok) throw new Error("No se pudo descargar el resultado. Usá Consultar resultado para recuperarlo sin pagar otra generación.");
          const blob = await response.blob();
          if (!["image/png", "image/jpeg", "image/webp"].includes(blob.type) || blob.size > 10_000_000) throw new Error("El resultado no tiene un formato o tamaño compatible.");
          const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
          if (controller.signal.aborted) return;
          setProject((current) => current?.id === generation.projectId ? { ...current, updatedAt: new Date().toISOString(), generation: { taskId: generation.id, model: "nano-banana-pro-flash", status: "completed" }, composition: { ...current.composition, generatedImage: data, aiReviewed: false } } : current);
          try { localStorage.removeItem(PENDING_KEY); } catch { /* Download remains available. */ }
          setNotice("Posteo generado con Magnific. Compará la prenda con el original antes de descargar; el texto y el logo siguen editables."); setGeneration(null);
        } else if (task.status === "failed") {
          setProject((current) => current?.id === generation.projectId ? { ...current, generation: { taskId: generation.id, model: "nano-banana-pro-flash", status: "failed" } } : current);
          try { localStorage.removeItem(PENDING_KEY); } catch { /* Keep visible failure. */ }
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

  function chooseProduct(value: Product) {
    setProduct(value); setImage(value.images.nodes[0]?.url || ""); setConcepts([]); setProject(null); setError("");
  }
  function updateComposition(patch: Partial<Composition>) { setProject((current) => current ? { ...current, composition: { ...current.composition, ...patch }, updatedAt: new Date().toISOString() } : null); }
  function makeConcepts() {
    if (!product || !image) return;
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
    setConcepts(next); setProject(null); setNotice("Elegí una dirección y generá un posteo con Magnific. Las notas creativas se envían como instrucciones visuales; cada clic genera una sola imagen.");
  }
  function chooseConcept(concept: Concept) {
    if (!product) return;
    const date = new Date().toISOString();
    const value: Project = { id: crypto.randomUUID(), brand: { ...brand }, product, concept, creativeBrief: instructions, composition: compose(concept, image, brand, format), createdAt: date, updatedAt: date };
    setProject(value);
  }
  function saveProject(value = project) {
    if (!value) return false;
    try {
      const parsed = projectSchema.parse({ ...value, updatedAt: new Date().toISOString() });
      const next = [parsed, ...projects.filter((p) => p.id !== parsed.id)];
      localStorage.setItem(PROJECT_KEY, JSON.stringify(next)); setProjects(next); setProject(parsed); setNotice("Proyecto guardado. Podés retomarlo desde Mis creaciones."); return true;
    } catch { setError("No se pudo guardar. El almacenamiento local puede estar lleno; quitá fondos grandes o descargá el proyecto JSON."); return false; }
  }
  async function exportImage(kind: "png" | "jpeg") {
    if (!project) return;
    if (project.composition.generatedImage && !project.composition.aiReviewed) { setError("Compará la prenda con el original y marcá la revisión antes de descargar."); return; }
    setBusy(true); setError("");
    try { await downloadComposition(project.composition, project.brand, `${project.brand.name}-${project.product.title}-${project.concept.name}`, kind); setNotice("Imagen descargada. No se publicó ni se subió a Shopify."); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo exportar."); } finally { setBusy(false); }
  }
  async function generatePost(value = project) {
    if (!value || generationLock.current || generation) return;
    if (value.generation?.status === "pending") {
      setGeneration({ id: value.generation.taskId, projectId: value.id });
      setNotice("Consultando la tarea existente; no se gastan créditos en otra imagen."); return;
    }
    generationLock.current = true; setBusy(true); setError("");
    try {
      const task = await jsonRequest<{ taskId: string; model: "nano-banana-pro-flash" }>("/api/social/generations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), productId: value.product.id, imageUrl: value.composition.productImage,
          brand: { name: value.brand.name, description: value.brand.description, direction: value.brand.direction, prohibited: value.brand.prohibited, instructions: value.brand.instructions },
          format: value.composition.format, layout: value.composition.layout, brief: value.creativeBrief || instructions || "", refinement }),
      });
      const pending: Project = { ...value, generation: { taskId: task.taskId, model: task.model, status: "pending" } };
      setProject((current) => current?.id === value.id ? { ...current, generation: pending.generation } : pending); setGeneration({ id: task.taskId, projectId: value.id }); setRefinement("");
      try { localStorage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch { setNotice(`Tarea ${task.taskId} iniciada. No cierres esta página: no se pudo guardar la tarea pendiente.`); }
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
      if (file.size > 15_000_000) throw new Error("El proyecto supera 15 MB.");
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
      <div className="social-tabs" role="tablist" aria-label="Social Studio">{([{ id: "products", name: "Productos" }, { id: "creative", name: "Crear posteo" }, { id: "brand", name: "Marca" }, { id: "projects", name: "Mis creaciones" }] as const).map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setError(""); }}>{item.name}</button>)}</div>
      {error && <div className="social-message error" role="alert">{error}<button aria-label="Cerrar error" onClick={() => setError("")}>×</button></div>}
      {notice && <div className="social-message" role="status">{notice}<button aria-label="Cerrar aviso" onClick={() => setNotice("")}>×</button></div>}

      {tab === "products" && <>
        <div className="social-toolbar"><form onSubmit={(event) => { event.preventDefault(); setCursor(null); setCatalog((c) => ({ ...c, products: [] })); setAppliedSearch(search); }}><Search size={17} /><input aria-label="Buscar productos" placeholder="Buscar en el catálogo…" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={150} /><button type="submit">Buscar</button></form><select aria-label="Filtrar colección" value={collection} onChange={(event) => { setCollection(event.target.value); setCursor(null); setCatalog((c) => ({ ...c, products: [] })); }}><option value="">Todas las colecciones</option>{collections.map((value) => <option key={value.id} value={value.id}>{value.title}</option>)}</select><button disabled={loading} onClick={() => { setCursor(null); setRefresh((r) => r + 1); }}><RefreshCw size={16} /> Actualizar</button></div>
        {product ? <section className="social-product-detail"><button className="social-back" onClick={() => setProduct(null)}><ArrowLeft size={16} /> Volver al catálogo</button><div className="social-product-columns"><div><img className="social-product-photo" src={mediaUrl(image)} alt={product.title} /><div className="social-thumbnails">{product.images.nodes.map((asset) => <button key={asset.id} className={image === asset.url ? "selected" : ""} onClick={() => setImage(asset.url)} aria-label={asset.altText || "Seleccionar referencia"}><img src={mediaUrl(asset.url)} alt={asset.altText || product.title} /></button>)}</div></div><div><span className="eyebrow">FOTOGRAFÍA ORIGINAL · {product.status}</span><h2>{product.title}</h2><p className="social-description">{product.description || "Sin descripción en el catálogo."}</p><p>{product.productType} {product.collections.nodes.length > 0 && `· ${product.collections.nodes.map((c) => c.title).join(" / ")}`}</p><div className="social-tags">{product.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><h3>Variantes</h3><div className="social-variants">{product.variants.nodes.map((variant) => <div key={variant.id}><span>{variant.title}</span><strong>{variant.price} {catalog.currency}</strong></div>)}</div>{(product.variants.pageInfo.hasNextPage || product.images.pageInfo.hasNextPage || product.collections.pageInfo.hasNextPage) && <p className="social-muted">Vista limitada a 30 imágenes, 50 variantes y 20 colecciones por producto.</p>}<button className="social-primary" disabled={!image} onClick={() => { setTab("creative"); setConcepts([]); setProject(null); }}><Sparkles size={17} /> Crear contenido</button></div></div></section> : <>
          <div className="social-section-heading"><span>{catalog.products.length} productos cargados</span><span>Imágenes originales de Shopify</span></div>
          {loading && !catalog.products.length ? <div className="social-catalog-skeleton" role="status" aria-label="Cargando productos"><span className="sr-only">Leyendo el catálogo de Shopify…</span><div className="social-product-grid" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <div className="social-skeleton-card" key={index}><i /><span /><b /></div>)}</div></div> : <div className="social-product-grid">{catalog.products.map((value) => <button className="social-product-card" key={value.id} disabled={!!generation} onClick={() => chooseProduct(value)}><div>{value.images.nodes[0] ? <img loading="lazy" src={mediaUrl(value.images.nodes[0].url)} alt={value.title} /> : <ImageIcon size={32} />}</div><span>{value.productType || brand.name}</span><h3>{value.title}</h3><p>{value.variants.nodes[0]?.price} {catalog.currency}</p></button>)}</div>}
          {!loading && !catalog.products.length && <div className="social-empty"><Layers3 /><h2>{error ? "El catálogo todavía no está disponible" : "No encontramos productos"}</h2><p>{collection && appliedSearch ? "La búsqueda filtra cada página de la colección. Cargá la siguiente para seguir buscando." : "Probá otra búsqueda o actualizá el catálogo."}</p></div>}
          {catalog.pageInfo.hasNextPage && <button className="social-loadmore" disabled={loading} onClick={() => setCursor(catalog.pageInfo.endCursor)}>{loading ? "Cargando…" : "Cargar más productos"}</button>}
        </>}
      </>}

      {tab === "creative" && <>
        {!product ? <div className="social-empty"><Sparkles /><h2>Una prenda. Tres miradas.</h2><p>Elegí un producto y su fotografía de referencia para comenzar.</p><button className="social-primary" onClick={() => setTab("products")}>Explorar productos</button></div> : <>
          <ol className="social-workflow" aria-label="Progreso del posteo">{["Elegir producto", "Definir dirección", "Editar y descargar"].map((label, index) => <li key={label} className={index === (project ? 2 : 1) ? "current" : index < (project ? 2 : 1) ? "complete" : ""} aria-current={index === (project ? 2 : 1) ? "step" : undefined}><span>{index < (project ? 2 : 1) ? "✓" : `0${index + 1}`}</span>{label}</li>)}</ol>
          {!project && <div className="social-selected-product"><img src={mediaUrl(image)} alt={product.title} /><div><span className="eyebrow">TU PRODUCTO</span><h2>{product.title}</h2></div><button disabled={!!generation} onClick={() => { setTab("products"); setProject(null); setConcepts([]); }}>Cambiar producto</button></div>}
          {!project && <><CreativeSetup product={product} image={image} format={format} contentType={contentType} approach={approach} textMode={textMode} customText={customText} instructions={instructions} prepared={concepts.length > 0} onImage={(url) => { setImage(url); setConcepts([]); }} onFormat={setFormat} onContentType={setContentType} onApproach={setApproach} onTextMode={setTextMode} onCustomText={setCustomText} onInstructions={setInstructions} onPrepare={makeConcepts} />
            {concepts.length > 0 && <><div className="social-direction-heading"><div><span className="eyebrow">TRES MANERAS DE CONTARLO</span><h2>Elegí la dirección de tu posteo</h2></div><p>Estos bocetos muestran la composición. La imagen editorial se genera en el próximo paso.</p></div><div className="social-concepts social-directions">{concepts.map((concept, index) => <article key={concept.layout}><div className="social-direction-preview"><Preview composition={compose(concept, image, brand, format)} brand={brand} /><span>Boceto · sin generar</span></div><div><span className="eyebrow">DIRECCIÓN 0{index + 1}</span><h2>{concept.name}</h2><p>{concept.rationale}</p><blockquote>{concept.caption.es}</blockquote><button className="social-primary" disabled={busy || !!generation} onClick={() => chooseConcept(concept)}>Elegir esta dirección <Plus size={15} /></button><small>Elegir no consume créditos</small></div></article>)}</div></>}
          </>}
          {project && <PostEditor key={project.id} project={project} busy={busy} generating={Boolean(generation)} refinement={refinement} savedAt={projects.find((value) => value.id === project.id)?.updatedAt} onRefinement={setRefinement} onComposition={updateComposition} onProject={(patch) => setProject((current) => current ? { ...current, ...patch, updatedAt: new Date().toISOString() } : null)} onGenerate={() => void generatePost()} onBack={() => setProject(null)} onSave={() => saveProject()} onExport={exportImage} onProjectDownload={projectJson} onBackgroundUpload={async (file) => { try { updateComposition({ backgroundImage: await readAsset(file, 3_000_000) }); } catch (failure) { setError((failure as Error).message); } }} onNotice={setNotice} onError={setError} />}
        </>}
      </>}

      {tab === "brand" && <section className="social-brand"><div className="social-section-heading"><div><span className="eyebrow">IDENTIDAD Y CRITERIO</span><h2>{brand.name} / Brand Kit</h2></div><span>Configuración exclusiva de Social Studio</span></div><div className="social-config"><label>Nombre<input value={brand.name} maxLength={100} onChange={(e) => setBrand({ ...brand, name: e.target.value })} /></label><label>Tipografía<select value={brand.typography} onChange={(e) => setBrand({ ...brand, typography: e.target.value as Brand["typography"] })}><option>Arial</option><option>Georgia</option><option>Times New Roman</option></select></label><label className="social-wide">Descripción<textarea value={brand.description} onChange={(e) => setBrand({ ...brand, description: e.target.value })} /></label><label className="social-wide">Tono de voz<textarea value={brand.tone} onChange={(e) => setBrand({ ...brand, tone: e.target.value })} /></label><label className="social-wide">Dirección visual<textarea rows={5} value={brand.direction} onChange={(e) => setBrand({ ...brand, direction: e.target.value })} /></label><label className="social-wide">Estilos y expresiones prohibidas<textarea value={brand.prohibited} onChange={(e) => setBrand({ ...brand, prohibited: e.target.value })} /></label><label className="social-wide">Instrucciones creativas<textarea rows={5} value={brand.instructions} onChange={(e) => setBrand({ ...brand, instructions: e.target.value })} /></label></div><h3>Paleta</h3><div className="social-palette">{brand.colors.map((color, index) => <label key={index}><input type="color" value={color} onChange={(e) => setBrand({ ...brand, colors: brand.colors.map((c, i) => i === index ? e.target.value : c) })} />{color}</label>)}</div><h3>Logo original</h3>{brand.logo && <><img className="social-logo-preview" src={brand.logo} alt="Logo original" /><button onClick={() => setBrand({ ...brand, logo: null })}>Quitar logo</button></>}<label className="social-file">Cargar logo · PNG, JPG o WebP, hasta 1 MB<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const file = e.target.files?.[0]; if (file) try { setBrand({ ...brand, logo: await readAsset(file) }); } catch (err) { setError((err as Error).message); } }} /></label><h3>Referencias aprobadas</h3><div className="social-thumbnails">{brand.references.map((reference, index) => <button key={index} onClick={() => setBrand({ ...brand, references: brand.references.filter((_, i) => i !== index) })} aria-label="Quitar referencia"><img src={reference} alt={`Referencia ${index + 1}`} /></button>)}</div><label className="social-file">Agregar referencia · hasta 6 imágenes<input disabled={brand.references.length >= 6} type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const file = e.target.files?.[0]; if (file) try { setBrand({ ...brand, references: [...brand.references, await readAsset(file, 500_000)] }); } catch (err) { setError((err as Error).message); } }} /></label><p className="social-muted">Las referencias se guardan para consulta; los presets no hacen análisis visual automático. Las credenciales Shopify se configuran exclusivamente en el servidor.</p><button className="social-primary" onClick={() => { try { const value = brandSchema.parse(brand); localStorage.setItem(BRAND_KEY, JSON.stringify(value)); setNotice("Brand Kit guardado en este navegador. Los proyectos existentes conservan su identidad original."); } catch { setError("Revisá los campos o el espacio disponible en el almacenamiento local."); } }}>Guardar Brand Kit</button></section>}

      {tab === "projects" && <><div className="social-section-heading"><div><h2>Mis creaciones</h2><p className="social-muted">Proyectos editables guardados en este navegador.</p></div><label className="social-file">Importar proyecto JSON<input type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importProject(file); }} /></label></div>{projects.length ? <div className="social-concepts social-library">{projects.map((value) => <article key={value.id}><Preview composition={value.composition} brand={value.brand} /><div><span className="eyebrow">{value.brand.name} · {value.composition.generatedImage ? "IMAGEN GENERADA" : "BOCETO EDITABLE"}</span><h2>{value.concept.name}</h2><p>{value.product.title}</p><small>{new Date(value.updatedAt).toLocaleDateString("es-AR")}</small><div className="social-inline-actions"><button disabled={!!generation} onClick={() => { setProject(value); setProduct(value.product); setImage(value.composition.productImage); setTab("creative"); }}>Abrir</button><button disabled={!!generation} onClick={() => { const copy = { ...value, id: crypto.randomUUID(), createdAt: new Date().toISOString() }; setProduct(value.product); setImage(value.composition.productImage); setProject(copy); setTab("creative"); setNotice("Nueva copia editable. Guardala para conservarla."); }}>Duplicar</button></div></div></article>)}</div> : <div className="social-empty"><Layers3 /><h2>Todavía no hay creaciones</h2><p>Guardá una composición para volver a editarla.</p><button className="social-primary" onClick={() => setTab("products")}>Elegir producto</button></div>}</>}
    </main>
  </div>;
}
