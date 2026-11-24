"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileClock, Film, ImageIcon, Layers3, PencilLine, RefreshCw, Search, Sparkles, ArrowRight, Check, FolderOpen, PlusCircle, Clapperboard, LayoutGrid, Palette, Images } from "lucide-react";
import { SADAELS, SADAELS_DAYLIGHT } from "@/lib/social/brands";
import { brandSchema, generationSettingsSchema, projectSchema, type Brand, type Composition, type Product, type Project, type SocialImageModel, formats } from "@/lib/social/schema";
import { compose, editorialPresets } from "@/lib/social/presets";
import { BUILT_IN_DIRECTIONS, SURREALISM_MODEL_INSTRUCTIONS, type ArtDirection } from "@/lib/social/directions";
import { generationFailureMessage } from "@/lib/social/generation-errors";
import { referencePlan } from "@/lib/social/generation";
import { downloadComposition, mediaUrl } from "@/lib/social/composition";
import { CompositionPreview as Preview } from "@/components/social/CompositionPreview";
import { ImageGenerationLoading } from "@/components/social/ImageGenerationLoading";
import { CreativeSetup } from "@/components/social/CreativeSetup";
import { CampaignLibrary } from "@/components/social/CampaignLibrary";
import { ApplyDesignDialog } from "@/components/social/ApplyDesignDialog";
import { applyDesignToPieces, undoAppliedDesign, type DesignUndo } from "@/lib/social/design";
import { campaignInfo, sortCampaigns, type Campaign, type CampaignInfo } from "@/lib/social/campaigns";
import { ModelPresets } from "@/components/social/ModelPresets";
import { exportSession } from "@/lib/social/batch";
import { loadSessionData, saveSessionData } from "@/lib/social/storage";
import { PostEditor } from "@/components/social/PostEditor";
import { loadSocialStorage, loadCampaignLibrary, saveStoredCampaign, deleteStoredCampaign, saveStoredProject, deleteStoredProject, saveStoredBrand, deleteStoredBrand, savePendingProject, clearPendingProject } from "@/lib/social/storage";

type Tab = "products" | "creative" | "export" | "brand" | "projects" | "campaigns";
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
  const [tab, setTab] = useState<Tab>("campaigns");
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
  const [textMode, setTextMode] = useState("none"), [customText, setCustomText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [generationSettings, setGenerationSettings] = useState(() => generationSettingsSchema.parse({}));
  const [refinement, setRefinement] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false), [generation, setGeneration] = useState<{ id: string; projectId: string; model: SocialImageModel } | null>(null);
  const [presetUploading, setPresetUploading] = useState(false);
  const [startingGeneration, setStartingGeneration] = useState<string | null>(null);
  const imageGenerating = !!project && (startingGeneration === project.id || generation?.projectId === project.id);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [batch, setBatch] = useState<Project[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<CampaignInfo | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [campaignSaveState, setCampaignSaveState] = useState<"saving" | "saved" | "error">("saved");
  const [designSource, setDesignSource] = useState<Project | null>(null);
  const [lastDesignApplication, setLastDesignApplication] = useState<{ campaignId: string; undo: DesignUndo } | null>(null);
  const [generationQueue, setGenerationQueue] = useState<string[]>([]);
  const [sessionReady, setSessionReady] = useState(false);
  const [directions, setDirections] = useState<ArtDirection[]>(BUILT_IN_DIRECTIONS);
  const [directionName, setDirectionName] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const generationLock = useRef(false);
  const storageLock = useRef(false);
  const sessionWrites = useRef<Promise<void>>(Promise.resolve());
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let stopped = false;
    void Promise.all([loadSocialStorage(), loadSessionData("directions")]).then(async ([local, looks]) => {
      const library = await loadCampaignLibrary();
      if (stopped) return;
      setCampaigns(library.campaigns);
      const pendingCampaign = local.pending && library.campaigns.find(campaign => campaign.projects.some(piece => piece.id === local.pending!.id));
      const active = pendingCampaign || library.campaigns.find(campaign => campaign.id === library.activeCampaignId);
      if (active) { setActiveCampaign(campaignInfo(active)); setBatch(active.projects); }
      setProjects(local.projects); setBrands(local.brands); if (local.brand) setBrand(local.brand);
      setStorageReady(true);
      if (looks) {
        const entries = looks as typeof directions;
        if (!Array.isArray(entries) || entries.some(v => typeof v.name !== "string" || typeof v.instructions !== "string" || typeof v.approach !== "string" || typeof v.contentType !== "string")) throw new Error("Invalid directions");
        setDirections([...BUILT_IN_DIRECTIONS.filter(builtin => !entries.some(entry => entry.name === builtin.name)), ...entries.map(entry => ({ name: entry.name, instructions: entry.instructions, approach: entry.approach, contentType: entry.contentType, generationSettings: entry.generationSettings ? generationSettingsSchema.parse(entry.generationSettings) : undefined }))]);
      }
      if (local.pending?.generation?.status === "pending") {
        const value = local.pending;
        setProject(value); setProduct(value.product); setImage(value.composition.productImage); setTab("creative");
        setGeneration({ id: value.generation!.taskId, projectId: value.id, model: value.generation!.model });
        setNotice("Consultando la tarea pendiente. No se inicia otra generación ni se gastan créditos nuevos.");
      }
      setSessionReady(true);
    }).catch(() => setError("No se pudo recuperar la sesión. Las copias guardadas se conservaron."));
    return () => { stopped = true; };
  }, []);

  useEffect(() => {
    if (!project) return;
    setBatch(current => current.some(p => p.id === project.id) ? current.map(p => p.id === project.id ? project : p) : current);
  }, [project]);

  useEffect(() => {
    if (!sessionReady || !activeCampaign || !batch.length) return;
    let cancelled = false;
    // Serialize writes so a slower old snapshot cannot overwrite the latest edit.
    const snapshot: Campaign = { ...activeCampaign, name: activeCampaign.name.trim() || "Campaña sin nombre", projects: batch, updatedAt: new Date().toISOString() };
    sessionWrites.current = sessionWrites.current.catch(() => {}).then(async () => {
      if (!cancelled) setCampaignSaveState("saving");
      await saveStoredCampaign(snapshot);
      setCampaigns(current => sortCampaigns([snapshot, ...current.filter(campaign => campaign.id !== snapshot.id)]));
      if (!cancelled) setCampaignSaveState("saved");
    });
    void sessionWrites.current.catch(() => { if (!cancelled) { setCampaignSaveState("error"); setError("No se pudo guardar la campaña. Descargá tus proyectos antes de cerrar."); } });
    return () => { cancelled = true; };
  }, [activeCampaign, batch, sessionReady]);

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
          throw new Error(`${generationFailureMessage(task.failureReason)} ID: ${generation.id}. No se inició otra generación.`);
        } else if (Date.now() - started > 10 * 60_000) throw new Error("La tarea sigue pendiente. Usá Consultar resultado para revisar su estado sin generar otra imagen.");
        else timer = setTimeout(poll, 4000);
      } catch (e) { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : "No se pudo consultar la tarea. Conservá el ID para recuperarla."); setGeneration(null); setGenerationQueue([]); } }
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
    const campaignProject = activeCampaign && campaigns.find(campaign => campaign.id === activeCampaign.id)?.projects.find(piece => piece.id === project?.id);
    if (campaignSaveState === "saved" && (!project || campaignProject?.updatedAt === project.updatedAt || projects.some((saved) => saved.id === project.id && saved.updatedAt === project.updatedAt))) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [project, projects, activeCampaign, campaigns, campaignSaveState]);

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
    setProduct(value); setImage(value.images.nodes[0]?.url || ""); setProject(null); setEditingProjectId(null); setError("");
  }
  function updateComposition(patch: Partial<Composition>) { setProject((current) => current ? { ...current, composition: { ...current.composition, ...patch }, updatedAt: new Date().toISOString() } : null); }

  async function flushCampaign() {
    if (!activeCampaign || !batch.length) { await sessionWrites.current; return; }
    const snapshot: Campaign = {
      ...activeCampaign, name: activeCampaign.name.trim() || "Campaña sin nombre",
      projects: batch.map(piece => project?.id === piece.id ? project : piece), updatedAt: new Date().toISOString(),
    };
    setCampaignSaveState("saving");
    sessionWrites.current = sessionWrites.current.catch(() => {}).then(() => saveStoredCampaign(snapshot));
    await sessionWrites.current;
    setCampaigns(current => sortCampaigns([snapshot, ...current.filter(campaign => campaign.id !== snapshot.id)]));
    setCampaignSaveState("saved");
  }

  async function saveCampaign() {
    if (busy || !sessionReady) return;
    setBusy(true); setError("");
    try { await flushCampaign(); setNotice("Campaña guardada. Podés volver a abrirla desde Mis campañas."); }
    catch { setCampaignSaveState("error"); setError("No se pudo guardar la campaña. Conservá tus proyectos antes de cerrar."); }
    finally { setBusy(false); }
  }

  async function storeDesignChanges(pieces: Project[]) {
    if (!activeCampaign) throw new Error("Abrí una campaña para aplicar el diseño.");
    const snapshot: Campaign = { ...activeCampaign, name: activeCampaign.name.trim() || "Campaña sin nombre", projects: pieces, updatedAt: new Date().toISOString() };
    setCampaignSaveState("saving");
    try {
      sessionWrites.current = sessionWrites.current.catch(() => {}).then(() => saveStoredCampaign(snapshot));
      await sessionWrites.current;
      setBatch(pieces);
      setCampaigns(current => sortCampaigns([snapshot, ...current.filter(campaign => campaign.id !== snapshot.id)]));
      setCampaignSaveState("saved");
    } catch (failure) { setCampaignSaveState("error"); throw failure; }
  }

  async function applyCampaignDesign(ids: string[]) {
    if (!designSource || !activeCampaign || !sessionReady || busy || generation || generationQueue.length || storageLock.current) throw new Error("Esperá a que termine la operación actual.");
    storageLock.current = true; setBusy(true); setError("");
    try {
      const pieces = batch.map(piece => piece.id === designSource.id ? designSource : piece);
      const applied = applyDesignToPieces(designSource, pieces, ids, new Date().toISOString());
      await storeDesignChanges(applied.projects);
      setLastDesignApplication({ campaignId: activeCampaign.id, undo: applied.undo });
      setNotice(`Diseño aplicado a ${applied.undo.length} ${applied.undo.length === 1 ? "pieza" : "piezas"}. Podés deshacer la aplicación o ajustar cada una por separado.`);
    } finally { storageLock.current = false; setBusy(false); }
  }

  async function undoCampaignDesign() {
    if (!lastDesignApplication || lastDesignApplication.campaignId !== activeCampaign?.id || busy || generation || generationQueue.length || storageLock.current) return;
    storageLock.current = true; setBusy(true); setError("");
    try {
      const current = batch.map(piece => project?.id === piece.id ? project : piece);
      const restored = undoAppliedDesign(current, lastDesignApplication.undo, new Date().toISOString());
      await storeDesignChanges(restored);
      if (project) setProject(restored.find(piece => piece.id === project.id) || project);
      setLastDesignApplication(null); setNotice("Se recuperaron los diseños anteriores de las piezas.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo deshacer la aplicación del diseño."); }
    finally { storageLock.current = false; setBusy(false); }
  }

  async function deleteCampaign(value: Campaign) {
    if (!sessionReady || busy || generation || generationQueue.length || storageLock.current) return;
    const deletingActive = activeCampaign?.id === value.id;
    const name = deletingActive ? activeCampaign.name.trim() || value.name : value.name;
    if (!window.confirm(`¿Eliminar la campaña "${name}" y sus ${value.projects.length} piezas guardadas en este navegador? Esta acción no se puede deshacer.`)) return;
    storageLock.current = true; setBusy(true); setError("");
    try {
      // Delete after any pending autosave, so an older write cannot restore it.
      const deletion = sessionWrites.current.catch(() => {}).then(() => deleteStoredCampaign(value.id));
      sessionWrites.current = deletion.then(() => {}, () => {});
      const deletedProjectIds = new Set(await deletion);
      setCampaigns(current => current.filter(campaign => campaign.id !== value.id));
      setProjects(current => current.filter(piece => !deletedProjectIds.has(piece.id)));
      if (deletingActive) {
        setActiveCampaign(null); setBatch([]); setSelectedProducts([]); setCampaignName("");
        setDirectionName(""); setInstructions(""); setCampaignSaveState("saved");
      }
      if (deletingActive || project?.sessionId === value.id || value.projects.some(piece => piece.id === project?.id)) {
        setProject(null); setProduct(null); setImage(""); setEditingProjectId(null); setRefinement("");
      }
      setTab("campaigns"); setNotice(`Campaña "${name}" eliminada.`);
    } catch { setError("No se pudo eliminar la campaña. Se conservó la copia guardada; podés reintentar."); }
    finally { storageLock.current = false; setBusy(false); }
  }

  async function openCampaign(value: Campaign) {
    if (busy || generation || generationQueue.length || storageLock.current) return;
    storageLock.current = true; setBusy(true); setError("");
    try {
      await flushCampaign();
      // Flush can include a last editor change that has not reached the library yet.
      const pieces = value.id === activeCampaign?.id ? batch.map(piece => project?.id === piece.id ? project : piece) : value.projects;
      const first = pieces[0];
      setActiveCampaign(value.id === activeCampaign?.id ? activeCampaign : campaignInfo(value));
      setBatch(pieces); setProject(null); setEditingProjectId(null);
      setProduct(first.product); setImage(first.composition.productImage); setFormat(first.composition.format);
      setBrand(first.brand); setGenerationSettings(first.generationSettings); setInstructions(first.creativeBrief);
      setDirectionName(value.directionName); setApproach(value.approach); setContentType(value.contentType);
      setSelectedProducts(pieces.map(piece => piece.product)); setRefinement(""); setTab("export");
    } catch { setCampaignSaveState("error"); setError("No se pudo conservar la campaña actual. No se cambió de campaña."); }
    finally { storageLock.current = false; setBusy(false); }
  }

  async function startNewCampaign() {
    if (busy || generation || generationQueue.length || !sessionReady || storageLock.current) return;
    storageLock.current = true; setBusy(true); setError("");
    try {
      await flushCampaign();
      setActiveCampaign(null); setBatch([]); setProject(null); setProduct(null); setImage("");
      setSelectedProducts([]); setEditingProjectId(null); setCampaignName(""); setRefinement("");
      setInstructions(""); setDirectionName(""); setApproach("Automático"); setContentType("Campaña editorial");
      setGenerationSettings(generationSettingsSchema.parse({})); setTextMode("none"); setCustomText(""); setTab("products");
    } catch { setCampaignSaveState("error"); setError("No se pudo guardar la campaña actual. Reintentá antes de crear otra."); }
    finally { storageLock.current = false; setBusy(false); }
  }

  async function openEditor() {
    if (!product || !image || !sessionReady || busy || presetUploading || generation || generationQueue.length) return;
    if (generationSettings.creativeMode === "new-model" && !generationSettings.targetModelImage && !generationSettings.modelViews.length && generationSettings.modelDescription.trim().length < 8) { setError("Cargá al menos una foto en el preset o describí a la nueva persona adulta."); return; }
    if (editingProjectId && batch.some(piece => piece.id === editingProjectId)) {
      const updated = batch.map(piece => piece.composition.aiReviewed ? piece : { ...piece, creativeBrief: instructions, generationSettings, updatedAt: new Date().toISOString() });
      const active = updated.find(piece => piece.id === editingProjectId)!;
      setBatch(updated); setProject(active); setProduct(active.product); setImage(active.composition.productImage); setEditingProjectId(null);
      setActiveCampaign(current => current ? { ...current, directionName, approach, contentType } : null); return;
    }
    let next = editorialPresets(product, { ...brand, direction: "" }, textMode === "custom" ? customText : "", textMode === "none", textMode === "custom");
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
    const concept = next[0];
    const date = new Date().toISOString();
    const value: Project = { id: crypto.randomUUID(), brand: { ...brand, direction: "", instructions: "", references: [] }, product, concept, creativeBrief: instructions.slice(0, 1500), generationSettings, composition: compose(concept, image, brand, format), createdAt: date, updatedAt: date };
    const sessionId = crypto.randomUUID();
    const chosen = selectedProducts.length ? selectedProducts : [product];
    const pieces = chosen.map(item => {
      const ownConcepts = editorialPresets(item, { ...brand, direction: "" }, textMode === "custom" ? customText : "", textMode === "none", textMode === "custom");
      const ownConcept = { ...(ownConcepts.find(candidate => candidate.layout === concept.layout) || ownConcepts[0]), visualDirection: instructions, name: directionName || "Dirección de la sesión" };
      return { ...value, id: crypto.randomUUID(), sessionId, product: item, concept: ownConcept, composition: compose(ownConcept, item.id === product.id ? image : item.images.nodes[0]?.url || image, brand, format) };
    });
    const campaign: Campaign = {
      id: sessionId, name: campaignName.trim() || `Campaña ${new Date().toLocaleDateString("es-AR")}`,
      projects: pieces, directionName, approach, contentType, createdAt: date, updatedAt: date,
    };
    setBusy(true); setError("");
    try {
      await flushCampaign();
      sessionWrites.current = sessionWrites.current.catch(() => {}).then(() => saveStoredCampaign(campaign));
      await sessionWrites.current;
      setCampaigns(current => sortCampaigns([campaign, ...current.filter(item => item.id !== campaign.id)]));
      setActiveCampaign(campaignInfo(campaign)); setCampaignSaveState("saved");
      setBatch(pieces); setProject(pieces[0]); setProduct(pieces[0].product); setImage(pieces[0].composition.productImage); setTab("creative");
    } catch { setCampaignSaveState("error"); setError("No se pudo guardar la nueva campaña. Las campañas anteriores se conservaron."); }
    finally { setBusy(false); }
  }
  async function downloadBatch(zip: boolean) {
    setBusy(true); setError("");
    try { await exportSession(batch.map(p => project?.id === p.id ? project : p), zip); setNotice("Batch descargado."); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo exportar el batch."); }
    finally { setBusy(false); }
  }
  function applyDirection(direction: ArtDirection) {
    setInstructions(direction.instructions);
    setApproach(direction.approach);
    setContentType(direction.contentType);
    setDirectionName(direction.name);
    if (direction.generationSettings) setGenerationSettings(current => {
      if (current.creativeMode !== "new-model" || !(current.targetModelImage || current.modelViews.length)) return direction.generationSettings!;
      return generationSettingsSchema.parse({ ...direction.generationSettings, creativeMode: "new-model", model: "auto", referenceStrategy: "all", modeInstructions: "", targetModelImage: current.targetModelImage, modelViews: current.modelViews, modelDescription: current.modelDescription });
    });
    else if (BUILT_IN_DIRECTIONS.some(builtin => builtin.name === direction.name)) {
      setGenerationSettings(current => ({ ...current, modeInstructions: current.creativeMode === "editorial" ? SURREALISM_MODEL_INSTRUCTIONS : "" }));
    }
  }
  async function saveDirection() {
    if (!directionName.trim()) { setError("Escribí un nombre para la dirección de arte."); return; }
    const next = [...directions.filter(d => d.name !== directionName.trim()), { name: directionName.trim(), instructions: project?.creativeBrief ?? instructions, approach, contentType, generationSettings: project?.generationSettings ?? generationSettings }];
    try { await saveSessionData("directions", next); setDirections(next); setNotice("Dirección de arte guardada en este navegador."); }
    catch { setError("No se pudo guardar la dirección de arte."); }
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
    return <label>Brand Kit<select disabled={!storageReady || busy || !!generation} value={selected.id} onChange={(event) => selectBrand(event.target.value, inEditor)}>{!brands.some((item) => item.id === selected.id) && <option value={selected.id}>{selected.name} (del proyecto)</option>}{brands.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.name}</option>)}</select><span className="post-field-hint">{inEditor ? "Logo, tipografía y colores. Las capas se editan por separado." : "Identidad fija de marca. El brief se define en la sesión."}</span></label>;
  }
  async function generatePost(value = project) {
    if (!value || generationLock.current || generation) return;
    const index = batch.findIndex(p => p.id === value.id);
    if (index > 0 && !batch[0].composition.aiReviewed) { setGenerationQueue([]); setError("Aprobá primero la dirección de arte en la pieza de prueba."); return; }
    if (value.generation?.status === "pending") {
      setProject(value);
      setGeneration({ id: value.generation.taskId, projectId: value.id, model: value.generation.model });
      setNotice("Consultando la tarea existente; no se gastan créditos en otra imagen."); return;
    }
    generationLock.current = true; setStartingGeneration(value.id); setBusy(true); setError("");
    try {
      const task = await jsonRequest<{ taskId: string; model: SocialImageModel; productReferenceCount: number; totalProductImages: number }>("/api/social/generations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), productId: value.product.id, imageUrl: value.composition.productImage,
          brand: { name: value.brand.name, description: value.brand.description, direction: "", prohibited: value.brand.prohibited, instructions: "" },
          format: value.composition.format, layout: value.composition.layout, brief: value.creativeBrief || instructions || "", refinement, generationSettings: generationSettingsSchema.parse(value.generationSettings || {}), expectedModel: referencePlan(value.product, value.composition.productImage, generationSettingsSchema.parse(value.generationSettings || {})).model }),
      });
      const pending: Project = { ...value, composition: { ...value.composition, aiReviewed: false }, generation: { taskId: task.taskId, model: task.model, productReferenceCount: task.productReferenceCount, totalProductImages: task.totalProductImages, status: "pending" } };
      setProject((current) => current?.id === value.id ? { ...current, generation: pending.generation, composition: { ...current.composition, aiReviewed: false } } : pending); setGeneration({ id: task.taskId, projectId: value.id, model: task.model }); setRefinement("");
      try { await savePendingProject(pending); } catch { setNotice(`Tarea ${task.taskId} iniciada. No cierres esta página: no se pudo guardar la tarea pendiente.`); }
    } catch (e) { setGenerationQueue([]); setError(e instanceof Error ? e.message : "No se pudo generar el posteo. No se reintentó automáticamente."); }
    finally { generationLock.current = false; setStartingGeneration(null); setBusy(false); }
  }

  // Keep one API task active at a time; stop the queue on any generation failure.
  useEffect(() => {
    if (!generationQueue.length || busy || generation || generationLock.current) return;
    const timer = setTimeout(() => {
      const next = batch.find(piece => piece.id === generationQueue[0]);
      setGenerationQueue(current => current.slice(1));
      if (next && !next.composition.aiReviewed) void generatePost(next);
    }, 0);
    return () => clearTimeout(timer);
    // The queue advances only after the active task and its persisted batch update settle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationQueue, busy, generation, batch]);

  function queueBatch() {
    if (busy || generation || generationQueue.length || !batch[0]?.composition.aiReviewed) return;
    setRefinement("");
    setGenerationQueue(batch.filter(piece => !piece.composition.aiReviewed).map(piece => piece.id));
    setTab("export");
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
    <main className={`social-main ${tab === "creative" && project?.composition.aiReviewed ? "is-editing" : ""}`}>
      <header className="social-header"><div><span className="eyebrow">DIRECCIÓN CREATIVA · {brand.name}</span><h1>Social Studio<span>.</span></h1><p>Una dirección de arte. Una campaña consistente.</p></div><span className="social-readonly">Shopify · solo lectura</span></header>
      <div className="social-tabs" role="tablist" aria-label="Social Studio">{([{ id: "campaigns", icon: FolderOpen, name: "Mis campañas" }, { id: "products", icon: PlusCircle, name: "Crear campaña" }, { id: "creative", icon: Clapperboard, name: "Sesión en curso" }, { id: "export", icon: LayoutGrid, name: "Ver campaña" }, { id: "brand", icon: Palette, name: "Brand kits" }, { id: "projects", icon: Images, name: "Mis creaciones" }] as const).map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} disabled={item.id === "products" && (busy || !!generation || generationQueue.length > 0 || !sessionReady)} onClick={() => { if (item.id === "products" && activeCampaign) void startNewCampaign(); else setTab(item.id); setError(""); }}><item.icon size={15} strokeWidth={1.7} aria-hidden="true" /><span>{item.name}</span></button>)}</div>
      {error && <div className="social-message error" role="alert">{error}<button aria-label="Cerrar error" onClick={() => setError("")}>×</button></div>}
      {notice && <div className="social-message" role="status">{notice}<button aria-label="Cerrar aviso" onClick={() => setNotice("")}>×</button></div>}

      {tab === "campaigns" && <CampaignLibrary campaigns={campaigns} ready={sessionReady} busy={busy || !!generation || generationQueue.length > 0} activeId={activeCampaign?.id} onOpen={value => void openCampaign(value)} onCreate={() => void startNewCampaign()} onDelete={value => void deleteCampaign(value)} />}
      {activeCampaign && ["creative", "export"].includes(tab) && !(tab === "creative" && project?.composition.aiReviewed) && <section className="campaign-identity" aria-label="Datos de la campaña">
        <div><button type="button" className="campaign-library-back" onClick={() => setTab("campaigns")}><ArrowLeft size={14} />Mis campañas</button><label htmlFor="campaign-name">Nombre de la campaña</label><input id="campaign-name" maxLength={100} value={activeCampaign.name} disabled={busy} onChange={event => { setCampaignSaveState("saving"); setActiveCampaign({ ...activeCampaign, name: event.target.value }); }} onBlur={() => setActiveCampaign(current => current ? { ...current, name: current.name.trim() || "Campaña sin nombre" } : null)} /></div>
        <div className="campaign-save-actions"><span role="status">{campaignSaveState === "saving" ? "Guardando…" : campaignSaveState === "error" ? "No se pudo guardar" : "Guardada en este navegador"}</span><button disabled={busy || !sessionReady} onClick={() => void saveCampaign()}>Guardar campaña</button></div>
      </section>}

      {["products", "creative", "export"].includes(tab) && !(tab === "creative" && project?.composition.aiReviewed) && <ol className="campaign-steps" aria-label="Progreso de campaña">{["Preparar sesión", "Dirección de arte", "Revisar y diseñar", "Exportar"].map((label, index) => { const step = tab === "products" ? 0 : tab === "export" ? 3 : project ? 2 : 1; return <li key={label} className={step === index ? "current" : index < step ? "complete" : ""} aria-current={step === index ? "step" : undefined}><span>{index < step ? <Check size={14} /> : `0${index + 1}`}</span><div>{label}<small>{["Formato, prendas y modelos", "Brief y referencias", "Una imagen a la vez", "Todas tus piezas listas"][index]}</small></div></li>; })}</ol>}
      {tab === "export" && !batch.length && <div className="social-empty"><Layers3 /><h2>Tu campaña aparecerá acá.</h2><p>Prepará una sesión para generar, diseñar y descargar tus piezas.</p><button onClick={() => setTab("products")}>Crear campaña</button></div>}
      {tab === "products" && <>
        <section className="session-start"><span className="eyebrow">01 / PREPARAR SESIÓN</span><h2>Una dirección de arte. Varias piezas.</h2>{batch.length > 0 && <button className="social-primary" disabled={busy || !!generation} onClick={() => setTab("export")}>Retomar {activeCampaign?.name || "campaña"} · {batch.length} piezas</button>}<label className="campaign-draft-name">Nombre de la nueva campaña<input maxLength={100} value={campaignName} placeholder="Ej. Surrealism fashion · Otoño 2026" onChange={event => setCampaignName(event.target.value)} /><small>Podés cambiarlo después. Sus piezas se guardan juntas en Mis campañas.</small></label><h3>Primero, el formato</h3><div className="creative-format-grid">{Object.entries(formats).map(([key, value]) => <button key={key} aria-pressed={format === key} disabled={!!generation} onClick={() => setFormat(key as Composition["format"])}><strong>{value.label}</strong></button>)}</div>
        <h3>Prendas de la sesión · {selectedProducts.length} seleccionadas</h3><p>Seleccioná hasta 20 prendas. Se prepara una pieza por prenda, con el mismo formato, modelo y dirección de arte.</p>
        <div className="social-inline-actions">{selectedProducts.map(p => <button key={p.id} disabled={!!generation} onClick={() => setSelectedProducts(items => items.filter(item => item.id !== p.id))}>{p.title} ×</button>)}</div>
        </section><div className="session-setup-layout"><section className="flow-panel catalog-panel"><div className="flow-panel-heading"><span className="flow-number">02</span><div><h3>Las prendas protagonistas</h3><p>Seleccioná hasta 20 productos para tu campaña.</p></div></div>
        <div className="social-toolbar"><form onSubmit={(event) => { event.preventDefault(); setCursor(null); setCatalog((c) => ({ ...c, products: [] })); setAppliedSearch(search); }}><Search size={17} /><input aria-label="Buscar productos" placeholder="Buscar en el catálogo…" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={150} /><button type="submit">Buscar</button></form><select aria-label="Filtrar colección" value={collection} onChange={(event) => { setCollection(event.target.value); setCursor(null); setCatalog((c) => ({ ...c, products: [] })); }}><option value="">Todas las colecciones</option>{collections.map((value) => <option key={value.id} value={value.id}>{value.title}</option>)}</select><button disabled={loading} onClick={() => { setCursor(null); setRefresh((r) => r + 1); }}><RefreshCw size={16} /> Actualizar</button></div>
        <>
          <div className="social-section-heading"><span>{catalog.products.length} productos cargados</span><span>Imágenes originales de Shopify</span></div>
          {loading && !catalog.products.length ? <div className="social-catalog-skeleton" role="status" aria-label="Cargando productos"><span className="sr-only">Leyendo el catálogo de Shopify…</span><div className="social-product-grid" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <div className="social-skeleton-card" key={index}><i /><span /><b /></div>)}</div></div> : <div className="social-product-grid">{catalog.products.map((value) => <button className="social-product-card" key={value.id} disabled={!!generation} aria-pressed={selectedProducts.some(p => p.id === value.id)} onClick={() => { if (!value.images.nodes.length) { setError("Este producto no tiene fotografías."); return; } setSelectedProducts(items => items.some(p => p.id === value.id) ? items.filter(p => p.id !== value.id) : items.length < 20 ? [...items, value] : items); }}><div>{value.images.nodes[0] ? <img loading="lazy" src={mediaUrl(value.images.nodes[0].url)} alt={value.title} /> : <ImageIcon size={32} />}</div><span>{value.productType || brand.name}</span><h3>{value.title}</h3><p>{value.variants.nodes[0]?.price} {catalog.currency}</p></button>)}</div>}
          {!loading && !catalog.products.length && <div className="social-empty"><Layers3 /><h2>{error ? "El catálogo todavía no está disponible" : "No encontramos productos"}</h2><p>{collection && appliedSearch ? "La búsqueda filtra cada página de la colección. Cargá la siguiente para seguir buscando." : "Probá otra búsqueda o actualizá el catálogo."}</p></div>}
          {catalog.pageInfo.hasNextPage && <button className="social-loadmore" disabled={loading} onClick={() => setCursor(catalog.pageInfo.endCursor)}>{loading ? "Cargando…" : "Cargar más productos"}</button>}
        </>
        </section><aside className="setup-aside"><section className="flow-panel">        <div className="flow-panel-heading"><span className="flow-number">03</span><div><h3>Modelos e identidad</h3><p>Continuidad para toda la campaña.</p></div></div><div className="session-casting">{[{ id: "editorial", title: "Misma persona", text: "Conservar la persona del original" }, { id: "new-model", title: "Otra persona / preset", text: "Cambiar la prenda, conservar identidad" }, { id: "garment", title: "Solo producto", text: "Sin personas" }].map(mode => <button key={mode.id} aria-pressed={generationSettings.creativeMode === mode.id} disabled={!!generation} onClick={() => setGenerationSettings({ ...generationSettings, creativeMode: mode.id as typeof generationSettings.creativeMode, modeInstructions: "" })}><span className="casting-radio" /><div><strong>{mode.title}</strong><small>{mode.text}</small></div></button>)}</div><ModelPresets onUploadingChange={setPresetUploading} settings={generationSettings} onChange={setGenerationSettings} onError={setError} />
        <label>Dirección guardada<select value="" onChange={e => { if (e.target.value === "") return; const d = directions[Number(e.target.value)]; if (d) applyDirection(d); }}><option value="">Elegí una dirección guardada</option>{directions.map((d, i) => <option key={d.name} value={i}>{d.name}</option>)}</select></label>
        {selectedProducts.length > 0 && <button className="social-primary" disabled={presetUploading || !!generation || !sessionReady || generationSettings.creativeMode === "new-model" && !generationSettings.targetModelImage && !generationSettings.modelViews.length && generationSettings.modelDescription.trim().length < 8} onClick={() => { chooseProduct(selectedProducts[0]); setTab("creative"); }}>Definir dirección de arte</button>}
{generationSettings.creativeMode === "new-model" && <label>Otra persona (sin preset)<textarea rows={2} maxLength={700} value={generationSettings.modelDescription} onChange={e => setGenerationSettings({ ...generationSettings, modelDescription: e.target.value })} placeholder="Describí a una persona adulta…" /></label>}</section><section className="flow-panel session-summary"><span className="eyebrow">TU SESIÓN</span><h3>{selectedProducts.length} piezas seleccionadas</h3><p>{formats[format].label}</p>{brandSelector()}<p className="flow-hint">Primero definís la dirección de arte. Después generás y aprobás cada imagen.</p></section></aside></div>
      </>}

      {tab === "creative" && <>
        {!product ? <div className="social-empty"><Sparkles /><h2>Creá tu próximo posteo.</h2><p>Elegí un producto y su fotografía de referencia para comenzar.</p><button className="social-primary" onClick={() => setTab("products")}>Explorar productos</button></div> : <>
          {!project && <><div className="flow-title"><div><span className="eyebrow">02 / DIRECCIÓN DE ARTE</span><h2>La mirada que une la campaña.</h2><p>Un brief compartido. Cada prenda con su propia imagen.</p></div><button onClick={() => { setProduct(null); setTab("products"); }}><ArrowLeft size={15} /> Volver a la selección</button></div><div className="direction-reuse"><label>Reutilizar una dirección<select defaultValue="" onChange={e => { if (e.target.value === "") return; const d = directions[Number(e.target.value)]; if (d) applyDirection(d); }}><option value="">Empezar desde cero</option>{directions.map((d, i) => <option key={d.name} value={i}>{d.name}</option>)}</select></label><span>{selectedProducts.length || 1} prendas · {formats[format].label} · {brand.name}</span></div></>}
          {!project && <CreativeSetup brand={brand} generationSettings={generationSettings} onGenerationSettings={setGenerationSettings} onError={setError} product={product} image={image} format={format} contentType={contentType} approach={approach} textMode={textMode} customText={customText} instructions={instructions} onImage={setImage} onFormat={setFormat} onContentType={setContentType} onApproach={setApproach} onTextMode={setTextMode} onCustomText={setCustomText} onInstructions={setInstructions} onPrepare={() => void openEditor()} />}
          {project && !(project.composition.generatedImage && project.composition.aiReviewed && project.generation?.status !== "pending") && <section className="session-review"><div className="social-section-heading"><div><span className="eyebrow">03 / REVISAR Y APROBAR</span><h2>{project.product.title}</h2><button disabled={busy || !!generation} onClick={() => setTab("export")}><ArrowLeft size={15} />Volver a campaña</button><p>Validá ambientación, dirección de arte, color, calce y detalles.</p></div><button disabled={busy || !!generation} onClick={() => { setEditingProjectId(project.id); setGenerationSettings(project.generationSettings); setInstructions(project.creativeBrief); setProject(null); }}>Volver al brief</button></div><div className="session-comparison"><figure><img src={mediaUrl(project.composition.productImage)} alt="Prenda original" /><figcaption>Referencia original</figcaption></figure><figure aria-busy={imageGenerating}>{imageGenerating ? <ImageGenerationLoading /> : project.composition.generatedImage ? <img src={project.composition.generatedImage} alt="Resultado para aprobar" /> : <div className="social-empty">Tu imagen aparecerá acá</div>}<figcaption>{imageGenerating ? "Generación en curso" : project.composition.generatedImage ? `Imagen generada · ${project.composition.aiReviewed ? "Aprobada" : "Pendiente de aprobación"}` : "Esperando tu primera imagen"}</figcaption></figure></div>{project.generation && <div className="social-message review-task" role="status"><div><strong>{project.generation.status === "failed" ? "La generación falló" : "Estado de generación"}</strong><p>ID: {project.generation.taskId}</p>{project.generation.status === "failed" && <p>{generationFailureMessage(project.generation.failureReason)}</p>}<button disabled={busy || !!generation} onClick={() => setGeneration({ id: project.generation!.taskId, projectId: project.id, model: project.generation!.model })}>Consultar esta tarea · sin generar otra</button></div></div>}<label>Modelo de IA para la próxima generación<select disabled={busy || !!generation || project.generation?.status === "pending"} value={project.generationSettings.model} onChange={e => setProject(current => current ? { ...current, generationSettings: { ...current.generationSettings, model: e.target.value as typeof current.generationSettings.model }, updatedAt: new Date().toISOString() } : current)}><option value="auto">Automático · según referencias</option><option disabled={project.generationSettings.creativeMode === "new-model" && (project.generationSettings.modelViews.length + project.generationSettings.artReferences.length > 1) || project.generationSettings.artReferences.length > 1} value="nano-banana-pro-flash">Nano Banana Pro Flash</option><option value="nano-banana-pro">Nano Banana Pro</option></select><span className="social-muted">Consultar una tarea no genera otra imagen. Generar o probar otro modelo usa créditos.</span></label><label>Ajustes para la próxima versión<textarea rows={2} maxLength={700} value={refinement} disabled={busy || !!generation} onChange={e => setRefinement(e.target.value)} /></label><div className="social-inline-actions"><button className="social-primary" disabled={busy || !!generation} onClick={() => void generatePost()}>{generation ? "Generando…" : project.generation?.status === "pending" ? "Consultar resultado" : project.composition.generatedImage ? "Regenerar esta pieza" : "Generar esta imagen"}</button><button disabled={busy || !!generation || !project.composition.generatedImage || project.generation?.status === "pending"} className="social-primary" onClick={() => { updateComposition({ aiReviewed: true }); setTab("export"); }}> {batch[0]?.id === project.id ? "Aprobar dirección de arte y ver campaña" : "Aprobar imagen y volver a campaña"}</button></div><p className="social-muted">Generar o regenerar usa créditos. La pieza de prueba aprobada habilita la generación del batch completo.</p></section>}
          {project && project.composition.generatedImage && project.composition.aiReviewed && project.generation?.status !== "pending" && <PostEditor onApplyDesign={activeCampaign && batch.length > 1 && batch.some(piece => piece.id === project.id) ? () => setDesignSource(project) : undefined} onUndoAppliedDesign={lastDesignApplication && lastDesignApplication.campaignId === activeCampaign?.id ? () => void undoCampaignDesign() : undefined} onContinue={() => setTab("export")} continueLabel="Volver a campaña" brandControl={brandSelector(true)} key={project.id} project={project} busy={busy} generating={Boolean(generation)} refinement={refinement} savedAt={projects.find((value) => value.id === project.id)?.updatedAt} onRefinement={setRefinement} onComposition={updateComposition} onProject={(patch) => setProject((current) => current ? { ...current, ...patch, updatedAt: new Date().toISOString() } : null)} onGenerate={() => { updateComposition({ aiReviewed: false }); void generatePost(); }} onBack={() => setTab("export")} onSave={() => saveProject()} onExport={exportImage} onProjectDownload={projectJson} onBackgroundUpload={async (file) => { try { updateComposition({ backgroundImage: await readAsset(file, 3_000_000) }); } catch (failure) { setError((failure as Error).message); } }} onNotice={setNotice} onError={setError} />}
        </>}
      </>}

      {(tab === "export") && batch.length > 0 && <section className="session-batch"><div className="social-section-heading"><div><span className="eyebrow">SESIÓN · {batch.length} PIEZAS</span><h2>Tu campaña, todas las piezas juntas</h2><p>{batch.filter(p => p.composition.aiReviewed).length} de {batch.length} aprobadas · Revisá la coherencia visual antes de abrir el editor.</p></div><button disabled={busy || !!generation} onClick={() => void startNewCampaign()}>Crear campaña</button></div><div className="social-inline-actions"><button className="social-primary" disabled={busy || !!generation || generationQueue.length > 0 || !batch[0]?.composition.aiReviewed || batch.every(p => p.composition.aiReviewed)} onClick={queueBatch}>{generation || generationQueue.length ? `Generando campaña · ${generationQueue.length} en cola` : batch.some(p => !p.composition.aiReviewed && p.composition.generatedImage) ? "Regenerar solo las no aprobadas" : "Generar batch completo"}</button>{(generation || generationQueue.length > 0) && <button onClick={() => setGenerationQueue([])}>Detener después de esta pieza</button>}</div>{!batch[0]?.composition.aiReviewed && <p className="social-muted">Primero generá y aprobá la pieza de prueba para validar la ambientación y la dirección de arte.</p>}<div className="session-piece-grid">{batch.map((p, index) => <button key={p.id} disabled={busy || !!generation || generationQueue.length > 0 || index > 0 && !batch[0].composition.aiReviewed} aria-pressed={project?.id === p.id} onClick={() => { setProject(p); setProduct(p.product); setImage(p.composition.productImage); setRefinement(""); setTab("creative"); }}><Preview composition={p.composition} brand={p.brand} showTools={false} /><strong>{index + 1}. {p.product.title}</strong><span>{p.generation?.status === "pending" ? "Generando" : p.composition.aiReviewed ? "Aprobada · editar pieza" : "Pendiente de aprobación"}</span></button>)}</div>{tab === "export" && <div className="batch-export-actions"><div className="social-inline-actions"><button className="social-primary" disabled={busy || !!generation || batch.some(p => !p.composition.generatedImage || !p.composition.aiReviewed)} onClick={() => void downloadBatch(true)}>Descargar batch ZIP</button><button disabled={busy || !!generation || batch.some(p => !p.composition.generatedImage || !p.composition.aiReviewed)} onClick={() => void downloadBatch(false)}>Descargar imágenes sueltas</button></div><label>Guardar dirección de arte<input maxLength={80} placeholder="Nombre de la dirección" value={directionName} onChange={e => setDirectionName(e.target.value)} /></label><button disabled={busy || !sessionReady || batch.some(p => !p.composition.aiReviewed)} onClick={() => void saveDirection()}>Guardar dirección de esta sesión</button><p className="social-muted">La sesión y sus piezas se conservan en este navegador. Podés editar cada imagen aprobada antes de exportar.</p></div>}</section>}

      {tab === "export" && lastDesignApplication && lastDesignApplication.campaignId === activeCampaign?.id && <div className="campaign-design-undo"><span>El diseño se aplicó a {lastDesignApplication.undo.length} piezas.</span><button type="button" disabled={busy || !!generation || generationQueue.length > 0} onClick={() => void undoCampaignDesign()}>Deshacer aplicación de diseño</button></div>}

      {tab === "brand" && <section className="social-brand">{brandSelector()}<div className="social-inline-actions"><button disabled={!storageReady || busy} onClick={() => void saveBrand({ ...brand, id: crypto.randomUUID(), name: `${brand.name.slice(0, 85)} (copia)` })}>Crear otro Brand Kit</button><button disabled={!storageReady || busy || !!generation || brands.length < 2} title={brands.length < 2 ? "Creá otro kit antes de eliminar el último" : undefined} onClick={() => void deleteBrand()}>Eliminar Brand Kit</button><span className="social-muted">Se crea una copia editable. Guardá los cambios para conservarla.</span></div><div className="social-section-heading"><div><span className="eyebrow">IDENTIDAD DE MARCA</span><h2>{brand.name} / Brand Kit</h2></div><span>Configuración exclusiva de Social Studio</span></div><div className="social-config"><label>Nombre<input value={brand.name} maxLength={100} onChange={(e) => setBrand({ ...brand, name: e.target.value })} /></label><label>Tipografía<select value={brand.typography} onChange={(e) => setBrand({ ...brand, typography: e.target.value as Brand["typography"] })}><option>Arial</option><option>Georgia</option><option>Times New Roman</option></select></label><label className="social-wide">Descripción<textarea value={brand.description} onChange={(e) => setBrand({ ...brand, description: e.target.value })} /></label><label className="social-wide">Tono de voz<textarea value={brand.tone} onChange={(e) => setBrand({ ...brand, tone: e.target.value })} /></label><label className="social-wide">Estilos y expresiones prohibidas<textarea value={brand.prohibited} onChange={(e) => setBrand({ ...brand, prohibited: e.target.value })} /></label></div><h3>Paleta</h3><div className="social-palette">{brand.colors.map((color, index) => <label key={index}><input type="color" value={color} onChange={(e) => setBrand({ ...brand, colors: brand.colors.map((c, i) => i === index ? e.target.value : c) })} />{color}</label>)}</div><h3>Logo original</h3>{brand.logo && <><img className="social-logo-preview" src={brand.logo} alt="Logo original" /><button onClick={() => setBrand({ ...brand, logo: null })}>Quitar logo</button></>}<label className="social-file">Cargar logo · PNG, JPG o WebP, hasta 1 MB<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const file = e.target.files?.[0]; if (file) try { setBrand({ ...brand, logo: await readAsset(file) }); } catch (err) { setError((err as Error).message); } }} /></label><p className="social-muted">Logo, tipografía, colores y tono de voz son la identidad fija. El brief y las referencias de cada campaña se guardan en su sesión.</p><button className="social-primary" disabled={busy || !storageReady} onClick={() => void saveBrand()}>Guardar Brand Kit</button></section>}

      {tab === "projects" && <><div className="social-section-heading"><div><h2>Mis creaciones</h2><p className="social-muted">{storageReady ? "Proyectos guardados en este navegador · IndexedDB" : "Abriendo el almacenamiento de proyectos…"}</p></div><label className="social-file">Importar proyecto JSON<input type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importProject(file); }} /></label></div>{!storageReady ? <div className="social-empty" role="status">Esperando el almacenamiento local. Si aparece un error, conservá tus copias JSON.</div> : projects.length ? <div className="social-concepts social-library">{projects.map((value) => <article key={value.id}><Preview composition={value.composition} brand={value.brand} /><div><span className="eyebrow">{value.brand.name} · {value.composition.generatedImage ? "IMAGEN GENERADA" : "BOCETO EDITABLE"}</span><h2>{value.concept.name}</h2><p>{value.product.title}</p><small>{new Date(value.updatedAt).toLocaleDateString("es-AR")}</small><div className="social-inline-actions"><button disabled={!!generation} onClick={() => { setProject(value); setProduct(value.product); setImage(value.composition.productImage); setTab("creative"); }}>Abrir</button><button disabled={!!generation} onClick={() => { const copy = { ...value, id: crypto.randomUUID(), createdAt: new Date().toISOString() }; setProduct(value.product); setImage(value.composition.productImage); setProject(copy); setTab("creative"); setNotice("Nueva copia editable. Guardala para conservarla."); }}>Duplicar</button><button disabled={busy || !!generation || !storageReady} onClick={() => void deleteProject(value)}>Eliminar</button></div></div></article>)}</div> : <div className="social-empty"><Layers3 /><h2>Todavía no hay creaciones</h2><p>Guardá una composición para volver a editarla.</p><button className="social-primary" onClick={() => setTab("products")}>Elegir producto</button></div>}</>}
      {designSource && <ApplyDesignDialog source={designSource} targets={batch.filter(piece => piece.id !== designSource.id)} busy={busy || !!generation || generationQueue.length > 0} onClose={() => setDesignSource(null)} onApply={applyCampaignDesign} />}
    </main>
  </div>;
}
