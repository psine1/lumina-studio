import { brandSchema, projectSchema, type Brand, type Project } from "./schema";
import { SADAELS, SADAELS_DAYLIGHT } from "./brands";

const LEGACY = { projects: "luma-social-projects-v1", brand: "luma-social-brands-v1", pending: "luma-social-pending-v1" };
let connection: Promise<IDBDatabase> | undefined;
function database() {
  if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("luma-social", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
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
