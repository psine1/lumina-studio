import { z } from "zod";
import { productSchema } from "../social/schema";

export class ShopifyError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

let tokenCache: { key: string; token: string; expiresAt: number } | undefined;
let pendingToken: { key: string; promise: Promise<string> } | undefined;

function configuration() {
  const raw = process.env.SHOPIFY_STORE_DOMAIN?.trim().replace(/^https:\/\//, "").replace(/\/$/, "");
  if (!raw || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(raw)) {
    throw new ShopifyError("Configura SHOPIFY_STORE_DOMAIN con el dominio original terminado en .myshopify.com.", 503);
  }
  const version = process.env.SHOPIFY_API_VERSION || "2026-10";
  if (!/^20\d{2}-(01|04|07|10)$/.test(version)) throw new ShopifyError("SHOPIFY_API_VERSION no es válida.", 503);
  return { domain: raw.toLowerCase(), version };
}

async function accessToken() {
  if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const { domain } = configuration();
  const id = process.env.SHOPIFY_CLIENT_ID, secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!id || !secret) throw new ShopifyError("Faltan SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET, o SHOPIFY_ADMIN_ACCESS_TOKEN.", 503);
  const key = `${domain}:${id}`;
  if (tokenCache?.key === key && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  if (pendingToken?.key === key) return pendingToken.promise;
  const promise = (async () => {
    const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: "POST", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(20_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
    });
    if (!response.ok) throw new ShopifyError(response.status === 429 ? "Shopify está limitando las consultas. Esperá unos segundos." : "Shopify rechazó las credenciales. Verificá que la app esté instalada en la tienda y pertenezca a la misma organización.", response.status === 429 ? 429 : 503);
    const value = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() }).parse(await response.json());
    tokenCache = { key, token: value.access_token, expiresAt: Date.now() + value.expires_in * 1000 };
    return value.access_token;
  })();
  pendingToken = { key, promise };
  try { return await promise; } finally { if (pendingToken?.promise === promise) pendingToken = undefined; }
}

// This function is intentionally private. Only the fixed read queries below can reach Shopify.
async function query(document: string, variables: Record<string, unknown>, retry = true): Promise<unknown> {
  const { domain, version } = configuration();
  const response = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
    method: "POST", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(25_000),
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await accessToken() },
    body: JSON.stringify({ query: document, variables }),
  });
  if (response.status === 401 && retry && !process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    tokenCache = undefined;
    return query(document, variables, false);
  }
  if (!response.ok) throw new ShopifyError(response.status === 429 ? "Límite de Shopify alcanzado. Volvé a intentar en unos segundos." : "No se pudo leer Shopify. Revisá la instalación y el permiso read_products.", response.status === 429 ? 429 : 502);
  const body = z.object({ data: z.unknown().optional(), errors: z.array(z.object({ message: z.string(), extensions: z.object({ code: z.string().optional() }).passthrough().optional() })).optional() }).parse(await response.json());
  if (body.errors?.length) {
    const throttled = body.errors.some((error) => error.extensions?.code === "THROTTLED");
    throw new ShopifyError(throttled ? "Shopify está limitando las consultas. Reintentá en unos segundos." : "Shopify no permitió leer el catálogo. Verificá read_products y la versión de la API.", throttled ? 429 : 502);
  }
  return body.data;
}

const fields = `id title handle description productType status tags vendor
  images(first: 30) { nodes { id url altText width height } pageInfo { hasNextPage } }
  collections(first: 20) { nodes { id title } pageInfo { hasNextPage } }
  variants(first: 50) { nodes { id title price selectedOptions { name value } } pageInfo { hasNextPage } }`;
const pageInfo = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });
const connection = z.object({ nodes: z.array(productSchema), pageInfo });

export async function getCatalog(input: { search?: string; after?: string; collection?: string }) {
  const search = input.search?.trim();
  // Escape Shopify's query syntax; a title search never becomes a user-controlled GraphQL document.
  const filter = search ? `title:*${search.replace(/[\\":()*]/g, " ").trim().replace(/\s+/g, "*")}*` : null;
  if (input.collection) {
    const data = z.object({ shop: z.object({ currencyCode: z.string() }), collection: z.object({ products: connection }).nullable() }).parse(await query(`query Catalog($id: ID!, $after: String) {
      shop { currencyCode } collection(id: $id) { products(first: 12, after: $after) { nodes { ${fields} } pageInfo { hasNextPage endCursor } } }
    }`, { id: input.collection, after: input.after || null }));
    if (!data.collection) throw new ShopifyError("La colección ya no está disponible.", 404);
    // Collection.products has no search argument. Filter each fetched page without dropping pagination.
    return { products: data.collection.products.nodes.filter((p) => !search || p.title.toLowerCase().includes(search.toLowerCase())), pageInfo: data.collection.products.pageInfo, currency: data.shop.currencyCode, brandId: "sadaels" };
  }
  const data = z.object({ shop: z.object({ currencyCode: z.string() }), products: connection }).parse(await query(`query Catalog($query: String, $after: String) {
    shop { currencyCode } products(first: 12, after: $after, query: $query, sortKey: TITLE) { nodes { ${fields} } pageInfo { hasNextPage endCursor } }
  }`, { query: filter, after: input.after || null }));
  return { products: data.products.nodes, pageInfo: data.products.pageInfo, currency: data.shop.currencyCode, brandId: "sadaels" };
}

export async function getCollections(after?: string) {
  return z.object({ collections: z.object({ nodes: z.array(z.object({ id: z.string(), title: z.string() })), pageInfo }) }).parse(await query(`query Collections($after: String) {
    collections(first: 100, after: $after, sortKey: TITLE) { nodes { id title } pageInfo { hasNextPage endCursor } }
  }`, { after: after || null })).collections;
}

export async function getProduct(id: string) {
  const data = z.object({ product: productSchema.nullable() }).parse(await query(`query Product($id: ID!) { product(id: $id) { ${fields} } }`, { id }));
  if (!data.product) throw new ShopifyError("El producto ya no está disponible.", 404);
  return data.product;
}
