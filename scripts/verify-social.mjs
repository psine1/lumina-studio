import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Run the real TypeScript services with Node's test facilities, without another dependency.
const moduleCache = new Map();
async function moduleUrl(path) {
  if (moduleCache.has(path.href)) return moduleCache.get(path.href);
  let code = ts.transpileModule(await readFile(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const imports = [...code.matchAll(/from\s+["']([^"']+)["']/g)];
  for (const match of imports) {
    const specifier = match[1];
    const resolved = specifier.startsWith("@/") ? await moduleUrl(new URL(`../${specifier.slice(2)}.ts`, import.meta.url)) : specifier.startsWith(".") ? await moduleUrl(new URL(`${specifier}.ts`, path)) : import.meta.resolve(specifier === "next/server" ? "next/server.js" : specifier);
    code = code.replace(match[0], `from ${JSON.stringify(resolved)}`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  moduleCache.set(path.href, url);
  return url;
}
const schema = await import(await moduleUrl(new URL("../lib/social/schema.ts", import.meta.url)));
const { SADAELS } = await import(await moduleUrl(new URL("../lib/social/brands.ts", import.meta.url)));
const { editorialPresets, compose } = await import(await moduleUrl(new URL("../lib/social/presets.ts", import.meta.url)));
const { getCatalog } = await import(await moduleUrl(new URL("../lib/shopify/client.ts", import.meta.url)));
const product = {
  id: "gid://shopify/Product/1", title: "Test garment", description: "Original catalog description", productType: "Test", status: "ACTIVE", tags: [], vendor: "SADAELS", handle: "test",
  images: { nodes: [{ id: "1", url: "https://cdn.shopify.com/s/files/1/test.jpg", altText: null, width: 800, height: 1200 }], pageInfo: { hasNextPage: false } },
  collections: { nodes: [], pageInfo: { hasNextPage: false } }, variants: { nodes: [{ id: "1", title: "M", price: "100", selectedOptions: [] }], pageInfo: { hasNextPage: false } },
};
const concepts = editorialPresets(product, SADAELS, "", true);
assert.equal(concepts.length, 3);
assert.equal(new Set(concepts.map((c) => c.layout)).size, 3);
assert(concepts.every((c) => c.onImageText === null));
assert(editorialPresets(product, SADAELS, "My copy", false, true).every((c) => c.onImageText === "My copy"));
const composition = compose(concepts[0], product.images.nodes[0].url, SADAELS, "portrait");
assert.equal(composition.productImage, product.images.nodes[0].url);
assert.equal(composition.logoVisible, false);
assert.equal(schema.compositionSchema.safeParse({ ...composition, productImage: "http://127.0.0.1/private" }).success, false);
assert.equal(schema.compositionSchema.safeParse({ ...composition, backgroundImage: "https://tracker.example/pixel" }).success, false);
assert.equal(schema.brandSchema.safeParse({ ...SADAELS, logo: "data:image/svg+xml;base64,PHN2Zz4=" }).success, false);

// Fixed queries, cached/renewed server token, and cursor transport. No product mutation is possible.
process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
process.env.SHOPIFY_CLIENT_ID = "test-client";
process.env.SHOPIFY_CLIENT_SECRET = "test-secret";
delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const requests = []; let tokens = 0, rejectNextToken = false;
globalThis.fetch = async (url, init) => {
  requests.push({ url, init });
  assert.equal(init.redirect, "manual", "Cloudflare supports manual redirects; never forward credentials to a redirect target");
  if (url.endsWith("/oauth/access_token")) { tokens++; return Response.json({ access_token: `test-token-${tokens}`, expires_in: 86400 }); }
  if (rejectNextToken) { rejectNextToken = false; return new Response("", { status: 401 }); }
  const body = JSON.parse(init.body);
  assert(body.query.startsWith("query "));
  assert(!/\bmutation\b/.test(body.query));
  assert(!init.body.includes("test-secret"));
  return Response.json({ data: { shop: { currencyCode: "ARS" }, products: { nodes: [product], pageInfo: { hasNextPage: true, endCursor: "cursor-1" } } } });
};
const result = await getCatalog({});
assert.equal(result.products.length, 1);
await getCatalog({ after: "cursor-1", search: 'Test" OR status:draft' });
assert.equal(tokens, 1);
assert.equal(JSON.parse(requests.at(-1).init.body).variables.after, "cursor-1");
rejectNextToken = true;
await getCatalog({});
assert.equal(tokens, 2);
globalThis.fetch = async () => Response.json({ errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] });
await assert.rejects(getCatalog({}), (error) => error.status === 429);

// Exercise shared preview/export rendering: output dimensions, photograph containment and editable text.
const { renderComposition, downloadComposition, imagePlacement } = await import(await moduleUrl(new URL("../lib/social/composition.ts", import.meta.url)));
globalThis.Image = class {
  naturalWidth = 800; naturalHeight = 1200;
  set src(value) { this.url = value; queueMicrotask(() => this.onload()); }
};
const draws = []; let textCalls = 0;
const textDraws = [];
const context = { save() {}, restore() {}, fillRect() {}, drawImage(...args) { draws.push(args); }, fillText(...args) { textCalls++; textDraws.push(args); }, measureText(value) { return { width: value.length * 20 }; } };
const canvas = { width: 0, height: 0, getContext: () => context };
for (const format of Object.keys(schema.formats)) {
  await renderComposition(canvas, { ...composition, format, text: "Editable text" }, SADAELS);
  assert.equal(canvas.width, schema.formats[format].width);
  assert.equal(canvas.height, schema.formats[format].height);
  const draw = draws.at(-1);
  assert.equal(draw.length, 5, "Original photograph is fitted, never cropped or reconstructed");
  assert(Math.abs(draw[3] / draw[4] - 800 / 1200) < .0001);
}
assert(textCalls > 0);
let clicked = false, downloadName = "", mime;
globalThis.document = { createElement(tag) {
  if (tag === "canvas") return { ...canvas, toBlob(callback, type) { mime = type; callback(new Blob(["test"], { type })); } };
  return { set href(_) {}, set download(value) { downloadName = value; }, click() { clicked = true; } };
} };
await downloadComposition(composition, SADAELS, "Test asset", "png");
assert(clicked); assert.equal(downloadName, "Test-asset.png"); assert.equal(mime, "image/png");
await downloadComposition(composition, SADAELS, "Test asset", "jpeg");
assert.equal(downloadName, "Test-asset.jpg"); assert.equal(mime, "image/jpeg");
const { socialImagePrompt, socialAspectRatio } = await import(await moduleUrl(new URL("../lib/social/generation.ts", import.meta.url)));
const input = { requestId: "a2aba871-44bc-421f-8118-fcbb034679c2", productId: product.id, imageUrl: product.images.nodes[0].url, brand: SADAELS, format: "portrait", layout: "editorial", brief: "Replace the studio background with aged concrete", refinement: "Keep the original garment" };
const prompt = socialImagePrompt(input, product);
assert(prompt.includes(input.brief)); assert(prompt.includes(SADAELS.name)); assert(prompt.includes("NO captions")); assert(prompt.includes("PRODUCT FIDELITY"));
assert.equal(socialAspectRatio("portrait"), "4:5");
await renderComposition(canvas, { ...composition, generatedImage: "data:image/png;base64,dGVzdA==", text: "" }, SADAELS);
const generatedDraw = draws.at(-1);
assert(generatedDraw[0].url.startsWith("data:image/png"), "The generated artwork replaces the original photograph on the canvas");
assert.equal(generatedDraw.length, 5);
assert(generatedDraw[1] <= 0 && generatedDraw[2] <= 0);
assert(generatedDraw[3] >= canvas.width && generatedDraw[4] >= canvas.height, "Generated artwork fills the canvas without exposed sidebars");
for (const format of Object.values(schema.formats)) {
  for (const [sourceWidth, sourceHeight] of [[928, 1152], [768, 1376], [1024, 1024]]) {
    const placed = imagePlacement(sourceWidth, sourceHeight, format.width, format.height, "cover");
    assert(placed.width + .0001 >= format.width && placed.height + .0001 >= format.height);
    assert(Math.abs(placed.width / placed.height - sourceWidth / sourceHeight) < .0001, "Filling never stretches the garment");
  }
}
const migrated = schema.projectSchema.parse({ id: "legacy", brand: SADAELS, product, concept: concepts[0], composition, createdAt: "2026-10-14", updatedAt: "2026-10-14" });
assert.equal(migrated.creativeBrief, ""); assert.equal(migrated.composition.aiReviewed, false);
assert.equal(migrated.composition.textStyle.fontSize, 43);
assert.equal(migrated.composition.logoStyle.width, .15);
const styled = schema.compositionSchema.parse({ ...composition, text: "AB", logoVisible: true,
  textStyle: { x: .2, y: .1, width: .5, fontSize: 72, align: "center", bold: true, italic: true, letterSpacing: 4, lineHeight: 1.5, opacity: .7, shadow: true },
  logoStyle: { x: .1, y: .4, width: .2, opacity: .4 },
});
const styledBrand = { ...SADAELS, logo: "data:image/png;base64,bG9nbw==" };
const overlay = await renderComposition(canvas, styled, styledBrand);
assert.equal(overlay.text.x, 216); assert.equal(overlay.text.y, 135); assert.equal(overlay.text.width, 540);
assert(context.font.includes("italic 700 72px"));
assert.equal(overlay.logo.x, 108); assert.equal(overlay.logo.y, 540); assert.equal(overlay.logo.width, 216);
assert.equal(overlay.logo.height, 324, "Logo keeps its original aspect ratio");
const logoDraw = draws.at(-1);
assert.deepEqual(logoDraw.slice(1), [108, 540, 216, 324]);
const styledProject = schema.projectSchema.parse({ ...migrated, brand: styledBrand, composition: styled });
const reopened = schema.projectSchema.parse(JSON.parse(JSON.stringify(styledProject)));
assert.deepEqual(reopened.composition.textStyle, styled.textStyle);
assert.deepEqual(reopened.composition.logoStyle, styled.logoStyle);
assert.equal(reopened.brand.logo, styledBrand.logo);
const tooMuchText = { ...styled, text: "A".repeat(160), textStyle: { ...styled.textStyle, width: .1, fontSize: 180, lineHeight: 2 } };
assert.equal((await renderComposition(canvas, tooMuchText, styledBrand)).textOverflow, true);
await assert.rejects(downloadComposition(tooMuchText, styledBrand, "Overflow", "png"), /excede el lienzo/);
const { wrapText, alignLayerBox } = await import(await moduleUrl(new URL("../lib/social/overlays.ts", import.meta.url)));
assert.deepEqual(alignLayerBox(overlay.text, 1080, 1350, "horizontal", "center"), { x: .25 });
assert.deepEqual(alignLayerBox(overlay.logo, 1080, 1350, "horizontal", "start"), { x: .05 });
assert.deepEqual(alignLayerBox(overlay.logo, 1080, 1350, "horizontal", "end"), { x: .75 });
assert.deepEqual(alignLayerBox(overlay.logo, 1080, 1350, "vertical", "center"), { y: .38 });
assert.equal(alignLayerBox(overlay.text, 1080, 1350, "vertical", "center").y, (1350 - overlay.text.height) / 2 / 1350);
assert.deepEqual(wrapText(context, "AB\nCD", 200, 0), ["AB", "CD"]);
const atEdge = await renderComposition(canvas, { ...styled, textStyle: { ...styled.textStyle, x: 1, y: 1 }, logoStyle: { ...styled.logoStyle, x: 1, y: 1 } }, styledBrand);
assert(atEdge.text.x + atEdge.text.width <= canvas.width); assert(atEdge.text.y + atEdge.text.height <= canvas.height);
assert(atEdge.logo.x + atEdge.logo.width <= canvas.width); assert(atEdge.logo.y + atEdge.logo.height <= canvas.height);
delete globalThis.document;

const { POST } = await import(await moduleUrl(new URL("../app/api/social/generations/route.ts", import.meta.url)));
const { GET } = await import(await moduleUrl(new URL("../app/api/social/generations/[id]/route.ts", import.meta.url)));
process.env.MAGNIFIC_API_KEY = "test-key";
let paidCalls = 0;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes("myshopify.com")) return Response.json({ data: { product } });
  if (url.endsWith("/nano-banana-pro-flash") && init.method === "POST") {
    paidCalls++; const body = JSON.parse(init.body);
    assert.equal(body.resolution, "1K"); assert.equal(body.reference_images.length, 1);
    assert.equal(body.reference_images[0].image, product.images.nodes[0].url);
    assert.equal(body.reference_images[0].mime_type, "image/jpeg");
    assert.equal(body.use_google_search_tool, false);
    assert(body.prompt.includes(input.brief)); assert.equal(body.aspect_ratio, "4:5");
    return Response.json({ data: { task_id: "test-task-1", status: "CREATED" } });
  }
  if (url.endsWith("/test-task-1")) return Response.json({ data: { task_id: "test-task-1", status: "COMPLETED", generated: ["https://cdn-magnific.com/test.png"] } });
  if (url === "https://cdn-magnific.com/test.png") { assert.equal(init.redirect, "manual"); return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } }); }
  throw new Error("Unexpected provider call");
};
const postRequest = (body) => new Request("http://localhost/api/social/generations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const [first, repeat] = await Promise.all([POST(postRequest(input)), POST(postRequest(input))]);
assert.equal(first.status, 200); assert.equal(repeat.status, 200); assert.equal(paidCalls, 1, "Repeated clicks coalesce into a single paid call");
assert.equal((await POST(postRequest({ ...input, brief: "Changed" }))).status, 409);
const invalid = { ...input, requestId: "a2aba871-44bc-421f-8118-fcbb034679c3", imageUrl: "https://cdn.shopify.com/s/files/1/not-this-product.jpg" };
assert.equal((await POST(postRequest(invalid))).status, 400); assert.equal(paidCalls, 1);
const statusResponse = await GET(new Request("http://localhost/api/social/generations/test-task-1"), { params: Promise.resolve({ id: "test-task-1" }) });
assert.equal((await statusResponse.json()).status, "completed");
const assetResponse = await GET(new Request("http://localhost/api/social/generations/test-task-1?asset=1"), { params: Promise.resolve({ id: "test-task-1" }) });
assert.equal(assetResponse.status, 200); assert.equal(assetResponse.headers.get("Content-Type"), "image/png"); assert.equal((await assetResponse.arrayBuffer()).byteLength, 4);
assert.equal(paidCalls, 1, "Polling and downloading never create another paid task");
console.log("Social Studio: presets, schema migration, real-photo generation payload, brief, single-call deduplication, polling/download, fidelity constraints, read-only Shopify, rendering and export checks passed. No live API calls.");
