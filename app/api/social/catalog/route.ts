import { NextResponse } from "next/server";
import { z } from "zod";
import { getCatalog, getCollections, getProduct, ShopifyError } from "@/lib/shopify/client";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.has("product")) {
      const id = z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/).parse(url.searchParams.get("product"));
      return NextResponse.json({ product: await getProduct(id) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (url.searchParams.get("resource") === "collections") {
      const after = z.string().max(500).optional().parse(url.searchParams.get("after") || undefined);
      return NextResponse.json(await getCollections(after), { headers: { "Cache-Control": "no-store" } });
    }
    const input = z.object({ search: z.string().max(150).optional(), after: z.string().max(500).optional(), collection: z.string().regex(/^gid:\/\/shopify\/Collection\/\d+$/).optional() }).parse(Object.fromEntries([...url.searchParams].filter(([key]) => ["search", "after", "collection"].includes(key))));
    return NextResponse.json(await getCatalog(input), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!(error instanceof ShopifyError) && !(error instanceof z.ZodError)) {
      console.error("Social catalog request failed:", error instanceof Error ? error.message : "Unknown error");
    }
    const status = error instanceof ShopifyError ? error.status : error instanceof z.ZodError ? 400 : 502;
    const message = error instanceof ShopifyError ? error.message : status === 400 ? "Los filtros no son válidos." : "No se pudo leer el catálogo. Probá de nuevo.";
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "5" } : {}) } });
  }
}
