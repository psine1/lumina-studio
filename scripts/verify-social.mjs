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
const { zoomViewport } = await import(await moduleUrl(new URL("../lib/social/viewport.ts", import.meta.url)));
const anchor = { x: 170, y: -90 }, panBefore = { x: 40, y: 25 }, scaleBefore = .5;
const zoomed = zoomViewport(scaleBefore, panBefore, 2, anchor);
for (const axis of ["x", "y"]) assert.equal((anchor[axis] - zoomed.pan[axis]) / zoomed.scale, (anchor[axis] - panBefore[axis]) / scaleBefore, "Zoom keeps the inspected point under the cursor");
assert.deepEqual(zoomViewport(zoomed.scale, zoomed.pan, scaleBefore, anchor).pan, panBefore);
assert.equal(zoomViewport(1, panBefore, 100).scale, 4);
assert.equal(zoomViewport(1, panBefore, .001).scale, .05);
const { SADAELS } = await import(await moduleUrl(new URL("../lib/social/brands.ts", import.meta.url)));
const { editorialPresets, compose } = await import(await moduleUrl(new URL("../lib/social/presets.ts", import.meta.url)));
const { getCatalog, getProduct } = await import(await moduleUrl(new URL("../lib/shopify/client.ts", import.meta.url)));
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
const { renderComposition, downloadComposition, imagePlacement, subjectMaskKey, hasSubjectMask } = await import(await moduleUrl(new URL("../lib/social/composition.ts", import.meta.url)));
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
// Foreground masking restores the person after behind layers and before front layers.
const layered = schema.compositionSchema.parse({ ...composition, text: "Behind", logoVisible: true, subjectMask: "data:image/png;base64,dGVzdA==", textStyle: { behindSubject: true } });
layered.subjectMaskKey = subjectMaskKey(layered);
assert(hasSubjectMask(layered));
assert(!hasSubjectMask({ ...layered, format: "story" }));
assert(!hasSubjectMask({ ...layered, generatedImage: "data:image/png;base64,bmV3" }));
const layerEvents = [];
const makeContext = (offscreen = false) => ({ save() {}, restore() {}, fillRect() {}, measureText: () => ({ width: 80 }), fillText() { layerEvents.push("text"); }, drawImage(source) { layerEvents.push(offscreen ? "offscreen" : source.url?.startsWith("data:") ? "logo" : source.getContext ? "foreground" : "photo"); }, set globalCompositeOperation(value) { if (value === "destination-in") layerEvents.push("mask"); } });
const oldDocument = globalThis.document;
globalThis.document = { createElement: () => { const ctx = makeContext(true); return { width: 0, height: 0, getContext: () => ctx }; } };
const mainContext = makeContext();
await renderComposition({ width: 0, height: 0, getContext: () => mainContext }, layered, { ...SADAELS, logo: "data:image/png;base64,bG9nbw==" });
assert(layerEvents.indexOf("text") < layerEvents.indexOf("foreground"));
assert(layerEvents.indexOf("mask") < layerEvents.indexOf("foreground"));
assert(layerEvents.indexOf("foreground") < layerEvents.lastIndexOf("logo"));
globalThis.document = oldDocument;
const { socialImagePrompt, socialAspectRatio, referencePlan } = await import(await moduleUrl(new URL("../lib/social/generation.ts", import.meta.url)));
const input = { requestId: "a2aba871-44bc-421f-8118-fcbb034679c2", productId: product.id, imageUrl: product.images.nodes[0].url, brand: SADAELS, format: "portrait", layout: "editorial", brief: "Replace the studio background with aged concrete", refinement: "Keep the original garment" };
const prompt = socialImagePrompt(input, product);
assert(prompt.includes(input.brief)); assert(prompt.includes(SADAELS.name)); assert(prompt.includes("NO captions")); assert(prompt.includes("PRODUCT FIDELITY"));
assert.equal(socialAspectRatio("portrait"), "4:5");
const manyViews = { ...product, images: { ...product.images, nodes: Array.from({ length: 17 }, (_, index) => ({ ...product.images.nodes[0], id: String(index), url: `https://cdn.shopify.com/s/files/1/view-${index}.jpg` })) } };
const primaryView = manyViews.images.nodes[5].url;
const allSettings = schema.generationSettingsSchema.parse({ creativeMode: "garment", referenceStrategy: "all" });
const forcedPro = referencePlan({ images: { nodes: [{ url: primaryView }] } }, primaryView, schema.generationSettingsSchema.parse({ model: "nano-banana-pro" }));
assert.equal(forcedPro.model, "nano-banana-pro"); assert.equal(forcedPro.productImages.length, 1);
const forcedFlash = referencePlan(manyViews, primaryView, schema.generationSettingsSchema.parse({ model: "nano-banana-pro-flash", referenceStrategy: "all" }));
assert.equal(forcedFlash.model, "nano-banana-pro-flash"); assert.equal(forcedFlash.referenceImages.length, 3);
const allPlan = referencePlan(manyViews, primaryView, allSettings);
assert.equal(allPlan.model, "nano-banana-pro"); assert.equal(allPlan.productImages.length, 14); assert.equal(allPlan.omitted, 3); assert.equal(allPlan.referenceImages[0], primaryView);
assert.equal(new Set(allPlan.referenceImages).size, 14, "The primary view is never duplicated");
const personSettings = schema.generationSettingsSchema.parse({ creativeMode: "new-model", referenceStrategy: "all", targetModelImage: "data:image/png;base64,dGVzdA==" });
const personPlan = referencePlan(manyViews, primaryView, personSettings);
assert.equal(personPlan.productImages.length, 13); assert.equal(personPlan.referenceImages.length, 14); assert.equal(personPlan.referenceImages.at(-1), personSettings.targetModelImage);
const economyPlan = referencePlan(manyViews, primaryView, { ...personSettings, referenceStrategy: "economy" });
assert.equal(economyPlan.model, "nano-banana-pro-flash"); assert.equal(economyPlan.productImages.length, 2); assert.equal(economyPlan.referenceImages.length, 3);
const garmentPrompt = socialImagePrompt({ ...input, generationSettings: allSettings }, product, 14);
assert(garmentPrompt.includes("Remove every person")); assert(!garmentPrompt.includes("Retain the same person"));
assert(garmentPrompt.includes("never skin or body-shaped filling"));
for (const [placement, instruction] of [["table", "Show the tabletop"], ["floor", "ground or floor"], ["floating", "Suspend the garment alone in midair"], ["custom", "supporting object or surface"], ["brief", "specified in the creative brief"]]) {
  const settings = schema.generationSettingsSchema.parse({ creativeMode: "garment", garmentPlacement: placement, garmentSurface: "A polished marble pedestal", modeInstructions: "Keep the original standing pose" });
  const placedPrompt = socialImagePrompt({ ...input, brief: "Put the product on a table", generationSettings: settings }, product);
  assert(placedPrompt.includes(instruction));
  assert(placedPrompt.includes(settings.garmentSurface));
  assert(placedPrompt.includes("Put the product on a table"));
  assert(placedPrompt.indexOf("MANDATORY PRODUCT-ONLY PRESENTATION") > placedPrompt.indexOf(settings.modeInstructions));
  assert(!placedPrompt.includes("continuous neutral background"));
}
assert(!socialImagePrompt({ ...input, generationSettings: personSettings }, product).includes("MANDATORY PRODUCT-ONLY PRESENTATION"));
assert.equal(schema.generationSettingsSchema.parse({}).garmentPlacement, "brief");
assert.equal(schema.generationSettingsSchema.parse({}).garmentSurface, "");
const transferPrompt = socialImagePrompt({ ...input, generationSettings: personSettings }, product, 13);
assert(transferPrompt.includes("Image 14, the LAST reference")); assert(transferPrompt.includes("DIFFERENT ADULT MODEL"));
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
let proPosts = 0;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes("myshopify.com")) return Response.json({ data: { product: manyViews } });
  if (url.endsWith("/uploads/request-url")) return Response.json({ files: [{ upload_url: "https://upload.example.test/target", asset_url: "https://cdn-magnific.com/target.png", headers: {} }] });
  if (url === "https://upload.example.test/target") { assert.equal(init.method, "PUT"); return new Response("", { status: 200 }); }
  if (url.endsWith("/nano-banana-pro") && init.method === "POST") {
    proPosts++; const body = JSON.parse(init.body);
    assert.equal(body.resolution, "1K"); assert.equal(body.reference_images.length, 14);
    assert.equal(body.reference_images[0].image, primaryView);
    if (body.prompt.includes("LAST reference")) {
      assert.equal(body.reference_images.at(-1).image, "https://cdn-magnific.com/target.png");
      assert.equal(body.reference_images.at(-1).mime_type, "image/png");
      assert(body.prompt.includes("Images 1 through 13"));
    } else assert(body.prompt.includes("Remove every person"));
    return Response.json({ data: { task_id: "pro-task-1", status: "CREATED" } });
  }
  if (url.endsWith("/pro-task-1")) { assert(url.includes("/nano-banana-pro/pro-task-1")); return Response.json({ data: { status: "COMPLETED", generated: [] } }); }
  throw new Error("Unexpected call in multi-reference tests");
};
const proInput = { ...input, requestId: "a2aba871-44bc-421f-8118-fcbb034679d0", imageUrl: primaryView, generationSettings: allSettings, expectedModel: "nano-banana-pro" };
const proTask = await POST(postRequest(proInput)); assert.equal(proTask.status, 200);
const receipt = await proTask.json(); assert.equal(receipt.model, "nano-banana-pro"); assert.equal(receipt.productReferenceCount, 14); assert.equal(receipt.totalProductImages, 17);
const wrongModel = await POST(postRequest({ ...proInput, requestId: "a2aba871-44bc-421f-8118-fcbb034679d1", expectedModel: "nano-banana-pro-flash" }));
assert.equal(wrongModel.status, 409); assert.equal(proPosts, 1, "Never silently upgrade a paid model");
const missingPerson = await POST(postRequest({ ...proInput, requestId: "a2aba871-44bc-421f-8118-fcbb034679d2", generationSettings: { creativeMode: "new-model" } }));
assert.equal(missingPerson.status, 400); assert.equal(proPosts, 1);
const personTask = await POST(postRequest({ ...proInput, requestId: "a2aba871-44bc-421f-8118-fcbb034679d3", generationSettings: personSettings }));
assert.equal(personTask.status, 200); assert.equal(proPosts, 2);
const proStatus = await GET(new Request("http://localhost/api/social/generations/pro-task-1?model=nano-banana-pro"), { params: Promise.resolve({ id: "pro-task-1" }) });
assert.equal((await proStatus.json()).status, "completed"); assert.equal(proPosts, 2);
const transferredProject = schema.projectSchema.parse({ ...migrated, generationSettings: personSettings, generation: { taskId: "pro-task-1", model: "nano-banana-pro", status: "pending" } });
assert.deepEqual(schema.projectSchema.parse(JSON.parse(JSON.stringify(transferredProject))).generationSettings, personSettings);
let imagePages = 0;
globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body); assert(body.query.startsWith("query "));
  if (body.query.includes("query ProductImages")) {
    imagePages++; assert.equal(body.variables.after, "images-page-1");
    return Response.json({ data: { product: { images: { nodes: [manyViews.images.nodes[1]], pageInfo: { hasNextPage: false, endCursor: null } } } } });
  }
  return Response.json({ data: { product: { ...product, images: { nodes: [manyViews.images.nodes[0]], pageInfo: { hasNextPage: true, endCursor: "images-page-1" } } } } });
};
const completeProduct = await getProduct(product.id); assert.equal(completeProduct.images.nodes.length, 2); assert.equal(imagePages, 1);
const { indexedDB, IDBDatabase } = await import("fake-indexeddb");
globalThis.indexedDB = indexedDB;
const legacyData = new Map();
globalThis.localStorage = { getItem: (key) => legacyData.get(key) ?? null, setItem: (key, value) => legacyData.set(key, value), removeItem: (key) => legacyData.delete(key) };
const storage = await import(await moduleUrl(new URL("../lib/social/storage.ts", import.meta.url)));
legacyData.set("luma-social-projects-v1", JSON.stringify([transferredProject]));
legacyData.set("luma-social-brands-v1", JSON.stringify(SADAELS));
legacyData.set("luma-social-pending-v1", JSON.stringify(transferredProject));
let local = await storage.loadSocialStorage();
assert.equal(local.brands.length, 2);
assert.deepEqual(local.brands[0], SADAELS, "The existing kit is preserved as the first kit");
assert.equal(local.brands[1].id, "sadaels-daylight");
assert.notEqual(local.brands[0].direction, local.brands[1].direction);
const daylightKit = local.brands[1];
const daylightPrompt = socialImagePrompt({ ...input, brand: daylightKit }, product);
assert(daylightPrompt.includes(daylightKit.direction));
assert(!daylightPrompt.includes("cinematic chiaroscuro"), "Layout must not override the selected kit with a fixed dark mood");
assert.equal(local.projects.length, 1); assert.equal(local.pending.id, transferredProject.id); assert.equal(local.brand.name, SADAELS.name); assert.equal(legacyData.size, 0);
assert.equal((await storage.loadSocialStorage()).projects.length, 1, "Migration is idempotent");
const largeProject = { ...transferredProject, id: "large-storage-test", updatedAt: "2099-01-01T00:00:00.000Z", composition: { ...transferredProject.composition, generatedImage: `data:image/png;base64,${"A".repeat(6_000_000)}` } };
await storage.saveStoredProject(largeProject);
local = await storage.loadSocialStorage(); assert.equal(local.projects[0].composition.generatedImage.length, 6_000_022);
legacyData.set("luma-social-projects-v1", JSON.stringify([{ ...largeProject, updatedAt: "2000-01-01T00:00:00.000Z" }]));
assert.equal((await storage.loadSocialStorage()).projects[0].updatedAt, largeProject.updatedAt, "Older legacy copies cannot replace newer IndexedDB projects");
const originalTransaction = IDBDatabase.prototype.transaction;
IDBDatabase.prototype.transaction = function (...args) { const tx = originalTransaction.apply(this, args); if (args[1] === "readwrite") queueMicrotask(() => tx.abort()); return tx; };
await assert.rejects(storage.saveStoredProject({ ...largeProject, id: "aborted-save" }));
legacyData.set("luma-social-projects-v1", JSON.stringify([transferredProject]));
await assert.rejects(storage.loadSocialStorage());
assert(legacyData.has("luma-social-projects-v1"), "An aborted migration must preserve its original backup");
IDBDatabase.prototype.transaction = originalTransaction;
assert(!(await storage.loadSocialStorage()).projects.some((item) => item.id === "aborted-save"));
await storage.clearPendingProject(); await storage.saveStoredBrand({ ...SADAELS, name: "Updated brand" });
await storage.deleteStoredProject(largeProject.id);
local = await storage.loadSocialStorage(); assert.equal(local.pending, null); assert.equal(local.brand.name, "Updated brand"); assert(!local.projects.some((item) => item.id === largeProject.id));
assert.equal(local.brands.length, 2, "Editing the first kit does not add a duplicate");
assert.equal(local.brands[0].name, "Updated brand"); assert.deepEqual(local.brands[1], daylightKit);
await storage.saveStoredBrand({ ...daylightKit, id: "third-kit", name: "Third kit" });
local = await storage.loadSocialStorage(); assert.equal(local.brands.length, 3); assert.equal(local.brands[2].name, "Third kit");
assert.equal(local.projects[0]?.brand.name, transferredProject.brand.name, "Existing projects keep their own kit snapshot");
await storage.deleteStoredBrand("third-kit");
local = await storage.loadSocialStorage(); assert.equal(local.brands.length, 2); assert(!local.brands.some((item) => item.id === "third-kit"));
await storage.deleteStoredBrand(SADAELS.id);
local = await storage.loadSocialStorage(); assert.equal(local.brands.length, 1); assert.equal(local.brand.id, daylightKit.id);
assert(!local.brands.some((item) => item.id === SADAELS.id), "Deleted kits are not seeded again on reload");
assert.equal(local.projects[0].brand.id, SADAELS.id, "Deleting a kit does not alter saved projects");
await assert.rejects(storage.deleteStoredBrand(daylightKit.id));
assert.equal((await storage.loadSocialStorage()).brands.length, 1, "Keep the last usable kit");
legacyData.set("luma-social-projects-v1", "invalid json");
await assert.rejects(storage.loadSocialStorage()); assert.equal(legacyData.get("luma-social-projects-v1"), "invalid json");
console.log("Social Studio: IndexedDB migration, >5MB save/reopen, atomic failure recovery, deletion, brand/pending persistence, generation, read-only Shopify and export checks passed. No live API calls.");
