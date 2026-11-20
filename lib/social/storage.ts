import { brandSchema, projectSchema, type Brand, type Project } from "./schema";
import { SADAELS, SADAELS_DAYLIGHT } from "./brands";
import { campaignSchema, sortCampaigns, type Campaign } from "./campaigns";

const LEGACY = { projects: "luma-social-projects-v1", brand: "luma-social-brands-v1", pending: "luma-social-pending-v1" };
let connection: Promise<IDBDatabase> | undefined;
function database() {
  if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("luma-social", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
      if (!db.objectStoreNames.contains("campaigns")) db.createObjectStore("campaigns", { keyPath: "id" });
    };
    request.onerror = () => { connection = undefined; reject(request.error); };
    request.onblocked = () => { connection = undefined; reject(new Error("Cerrá las otras pestañas de Lumiina y probá de nuevo.")); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = undefined; };
      resolve(db);
    };
  });
  return connection;
}
function result<T>(request: IDBRequest<T>) { return new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function committed(tx: IDBTransaction) { return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error || new Error("No se pudo completar el guardado.")); tx.onerror = () => { /* Abort owns the rejection. */ }; }); }

export async function saveStoredProject(value: Project) {
  const parsed = projectSchema.parse(value), db = await database();
  const tx = db.transaction("projects", "readwrite"), done = committed(tx);
  tx.objectStore("projects").put(parsed); await done;
}
export async function deleteStoredProject(id: string) {
  const db = await database(), tx = db.transaction("projects", "readwrite"), done = committed(tx);
  tx.objectStore("projects").delete(id); await done;
}
async function setting(key: string, value: unknown) {
  const db = await database(), tx = db.transaction("settings", "readwrite"), done = committed(tx);
  if (value === null) tx.objectStore("settings").delete(key); else tx.objectStore("settings").put(value, key);
  await done;
}
export const saveSessionData = (key: string, value: unknown) => setting(`session:${key}`, value);
export async function loadSessionData(key: string): Promise<unknown> {
  const db = await database();
  return result(db.transaction("settings", "readonly").objectStore("settings").get(`session:${key}`));
}

// Save the library entry and the active session together. A failed write leaves
// both previous copies intact, including all embedded generated images/layers.
export async function saveStoredCampaign(value: Campaign) {
  const campaign = campaignSchema.parse(value), db = await database();
  const tx = db.transaction(["campaigns", "settings"], "readwrite"), done = committed(tx);
  const settings = tx.objectStore("settings");
  await Promise.all([done, result(settings.get("deleted-campaigns")).then(raw => {
    const deleted = campaignSchema.shape.id.array().parse(raw || []);
    if (deleted.includes(campaign.id)) throw new Error("Esta campaña fue eliminada. Creá una nueva para continuar.");
    tx.objectStore("campaigns").put(campaign);
    settings.put(campaign.projects, "session:batch");
    settings.put(campaign.id, "session:campaign-id");
  })]);
}

export async function deleteStoredCampaign(id: string) {
  campaignSchema.shape.id.parse(id);
  const db = await database();
  const tx = db.transaction(["campaigns", "projects", "settings"], "readwrite"), done = committed(tx);
  const campaigns = tx.objectStore("campaigns"), projects = tx.objectStore("projects"), settings = tx.objectStore("settings");
  const [, deletedProjectIds] = await Promise.all([done, Promise.all([
    result(campaigns.get(id)), result(projects.getAll()), result(settings.get("session:batch")),
    result(settings.get("session:campaign-id")), result(settings.get("pending")), result(settings.get("deleted-campaigns")),
  ]).then(([rawCampaign, rawProjects, rawBatch, activeId, rawPending, rawDeleted]) => {
    const campaign = rawCampaign ? campaignSchema.parse(rawCampaign) : undefined;
    const saved = projectSchema.array().parse(rawProjects);
    const batch = projectSchema.array().parse(rawBatch || []);
    const pending = rawPending ? projectSchema.parse(rawPending) : null;
    const deleted = new Set(campaignSchema.shape.id.array().parse(rawDeleted || []));
    const pieceIds = new Set(campaign?.projects.map(piece => piece.id));
    const belongs = (piece: Project) => piece.sessionId === id || pieceIds.has(piece.id) || id === `legacy-${piece.id}`;
    const removed = saved.filter(belongs);
    campaigns.delete(id);
    for (const piece of removed) projects.delete(piece.id);
    if (activeId === id) settings.delete("session:campaign-id");
    if (activeId === id || batch.some(belongs)) settings.delete("session:batch");
    if (pending && belongs(pending)) settings.delete("pending");
    // Prevent legacy backups and delayed saves from recreating deleted campaigns.
    deleted.add(id); settings.put([...deleted], "deleted-campaigns");
    return removed.map(piece => piece.id);
  })]);
  return deletedProjectIds;
}

export async function loadCampaignLibrary() {
  const db = await database();
  const tx = db.transaction(["campaigns", "projects", "settings"], "readwrite"), done = committed(tx);
  const store = tx.objectStore("campaigns"), settings = tx.objectStore("settings");
  const [, library] = await Promise.all([done, Promise.all([
    result(store.getAll()), result(tx.objectStore("projects").getAll()),
    result(settings.get("session:batch")), result(settings.get("session:campaign-id")), result(settings.get("deleted-campaigns")),
  ]).then(([rawCampaigns, rawProjects, rawBatch, rawActiveId, rawDeleted]) => {
    const deleted = new Set(campaignSchema.shape.id.array().parse(rawDeleted || []));
    const campaigns = campaignSchema.array().parse(rawCampaigns).filter(campaign => !deleted.has(campaign.id));
    const savedProjects = projectSchema.array().parse(rawProjects);
    const batch = projectSchema.array().parse(rawBatch || []);
    const groups = new Map<string, Project[]>();
    for (const project of savedProjects) {
      if (project.sessionId) groups.set(project.sessionId, [...(groups.get(project.sessionId) || []), project]);
    }
    const batchId = batch.length ? batch[0].sessionId || `legacy-${batch[0].id}` : null;
    if (batchId) {
      // Preserve the exact session order, especially its approved test piece.
      // Individually saved copies may be older or contain removed pieces.
      groups.set(batchId, batch);
    }
    for (const [id, projects] of groups) {
      if (deleted.has(id) || campaigns.some(campaign => campaign.id === id)) continue;
      const dates = projects.map(project => project.createdAt).sort();
      const direction = projects[0].concept.name;
      const directionName = direction === "Dirección de la sesión" ? "" : direction.slice(0, 80);
      const campaign = campaignSchema.parse({
        id, name: directionName || `Campaña ${new Date(dates[0]).toLocaleDateString("es-AR")}`,
        directionName, projects, createdAt: dates[0],
        updatedAt: projects.map(project => project.updatedAt).sort().at(-1),
      });
      store.put(campaign); campaigns.push(campaign);
    }
    const activeCampaignId = typeof rawActiveId === "string" && campaigns.some(campaign => campaign.id === rawActiveId) ? rawActiveId : campaigns.some(campaign => campaign.id === batchId) ? batchId : null;
    if (activeCampaignId) settings.put(activeCampaignId, "session:campaign-id");
    else settings.delete("session:campaign-id");
    return { campaigns: sortCampaigns(campaigns), activeCampaignId };
  })]);
  return library;
}
export async function saveStoredBrand(value: Brand) {
  const parsed = brandSchema.parse(value), db = await database();
  const tx = db.transaction("settings", "readwrite"), done = committed(tx), settings = tx.objectStore("settings");
  await Promise.all([done, result(settings.get("brands")).then((raw) => {
    const brands = raw ? brandSchema.array().parse(raw) : [];
    const index = brands.findIndex((brand) => brand.id === parsed.id);
    if (index < 0) brands.push(parsed); else brands[index] = parsed;
    settings.put(brands, "brands"); settings.put(parsed, "brand");
  })]);
}
export async function deleteStoredBrand(id: string) {
  const db = await database(), tx = db.transaction("settings", "readwrite"), done = committed(tx), settings = tx.objectStore("settings");
  const [, remaining] = await Promise.all([done, result(settings.get("brands")).then((raw) => {
    const brands = brandSchema.array().parse(raw || []);
    const next = brands.filter((brand) => brand.id !== id);
    if (!next.length) throw new Error("Conservá al menos un Brand Kit. Creá otro antes de eliminar este.");
    settings.put(next, "brands"); settings.put(next[0], "brand");
    return next;
  })]);
  return remaining;
}
export const savePendingProject = (value: Project) => setting("pending", projectSchema.parse(value));
export const clearPendingProject = () => setting("pending", null);

export async function loadSocialStorage() {
  const db = await database();
  // Parse before opening a transaction: a malformed backup is never discarded.
  const raw = { projects: localStorage.getItem(LEGACY.projects), brand: localStorage.getItem(LEGACY.brand), pending: localStorage.getItem(LEGACY.pending) };
  const legacyProjects = raw.projects ? projectSchema.array().parse(JSON.parse(raw.projects)) : [];
  const legacyBrand = raw.brand ? brandSchema.parse(JSON.parse(raw.brand)) : null;
  const legacyPending = raw.pending ? projectSchema.parse(JSON.parse(raw.pending)) : null;
  const tx = db.transaction(["projects", "settings"], "readwrite"), done = committed(tx);
  const projects = tx.objectStore("projects"), settings = tx.objectStore("settings");
  // All reads are queued together while the transaction is active.
  const byId = new Map<string, Project>();
  const [, [, storedBrand, storedPending, brands]] = await Promise.all([done, Promise.all([result(projects.getAll()), result(settings.get("brand")), result(settings.get("pending")), result(settings.get("brands"))]).then(([existing, storedBrand, storedPending, rawBrands]) => {
    for (const item of existing) byId.set(item.id, projectSchema.parse(item));
    for (const legacy of legacyProjects) {
      const current = byId.get(legacy.id);
      if (!current || legacy.updatedAt > current.updatedAt) { projects.put(legacy); byId.set(legacy.id, legacy); }
    }
    if (!storedBrand && legacyBrand) settings.put(legacyBrand, "brand");
    if (!storedPending && legacyPending) settings.put(legacyPending, "pending");
    const brands = rawBrands ? brandSchema.array().parse(rawBrands) : [brandSchema.parse(storedBrand || legacyBrand || SADAELS), SADAELS_DAYLIGHT];
    if (!rawBrands) settings.put(brands, "brands");
    return [existing, storedBrand, storedPending, brands] as const;
  })]);
  // Only release legacy space after the complete migration commits successfully.
  for (const key of Object.keys(LEGACY) as (keyof typeof LEGACY)[]) {
    try { if (raw[key] !== null && localStorage.getItem(LEGACY[key]) === raw[key]) localStorage.removeItem(LEGACY[key]); } catch { /* A duplicate backup is safe. */ }
  }
  return { projects: [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), brands, brand: storedBrand ? brandSchema.parse(storedBrand) : legacyBrand || brands[0], pending: storedPending ? projectSchema.parse(storedPending) : legacyPending };
}
