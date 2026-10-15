# Luma Studio

## Social Studio

Nueva sección `/social`: catálogo Shopify de solo lectura, Brand Kit SADAELS, tres direcciones editoriales y generación de posteos con Magnific a partir de la foto real y el brief. Cada clic genera una sola imagen con Nano Banana Pro Flash en 1K; texto y logo quedan editables, y se compara con el original antes de descargar PNG/JPG. Los proyectos se guardan en el navegador y pueden descargarse/importarse como JSON. No publica ni sube imágenes a Shopify o redes sociales.

Configura `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID` y `SHOPIFY_CLIENT_SECRET` en `.env.local`; también admite `SHOPIFY_ADMIN_ACCESS_TOKEN`. La versión por defecto es `2026-10`. No se necesita un proveedor de IA de texto para los presets.

Ver [arquitectura, configuración y límites de Social Studio](docs/social-studio.md).

Aplicación web privada para generar imágenes, editar una imagen con prompt y crear videos mediante la API oficial de Magnific. La interfaz prioriza un flujo de estudio: configuración a la izquierda, selector de modelos por capacidades y resultados en el mismo lienzo.

## Inicio local

Requisitos: Node.js 22.13 o superior y una API key de Magnific.

```bash
npm install
cp .env.example .env.local
npm run dev
```

En Windows, copia `.env.example` a `.env.local`. Después completa:

```dotenv
MAGNIFIC_API_KEY=tu_api_key
```

La clave se lee exclusivamente en los Route Handlers. Nunca se envía al navegador.

## Integración verificada

La implementación usa el host `https://api.magnific.com` y la cabecera `x-magnific-api-key`, de acuerdo con la documentación oficial actual.

- Imagen principal: `POST /v1/ai/mystic`
- Imagen Google: `POST /v1/ai/text-to-image/nano-banana-pro` y `nano-banana-pro-flash`
- Imagen y edición: `POST /v1/ai/text-to-image/flux-2-pro`
- Imagen rápida: `POST /v1/ai/text-to-image/flux-2-turbo`
- Imagen con tipografía: `POST /v1/ai/text-to-image/seedream-v4-5`
- Video desde texto: `POST /v1/ai/text-to-video/runway-4-5`
- Video desde texto con audio: `POST /v1/ai/image-to-video/kling-v2-6-pro`
- Video desde imagen: `POST /v1/ai/image-to-video/kling-std`
- Estado: `GET {ruta-del-modelo}/{task-id}`

Los POST devuelven un `task_id`. El cliente consulta el estado cada 3 segundos y normaliza `CREATED`, `IN_PROGRESS`, `COMPLETED` y `FAILED` a `pending`, `processing`, `completed` y `failed`.

## Arquitectura

- `app/`: rutas de estudio y endpoints internos.
- `components/studio/StudioShell.tsx`: flujo visual, uploads, polling e historial local.
- `lib/magnific/models.ts`: catálogo centralizado y matriz de capacidades.
- `lib/magnific/client.ts`: cliente server-side y adaptadores de payload por modelo.
- `types/generation.ts`: tipos compartidos, sin `any`.

La UI consume `/api/models`. No existe un endpoint oficial general para enumerar todos los modelos de generación; por eso el catálogo soportado es configuración centralizada y cada entrada apunta a una ruta documentada.

## Añadir un modelo

1. Confirma en la documentación oficial su endpoint POST, endpoint de estado y esquema exacto.
2. Añade la entrada a `APP_MODELS` con sus capacidades y valores soportados.
3. Añade el adaptador de payload en `client.ts`.
4. Amplía la validación Zod de la ruta interna correspondiente.
5. Verifica una generación real antes de exponer el modelo en producción.

## Persistencia y assets

El MVP guarda metadatos e historial en `localStorage`, adecuado para uso personal en un solo navegador. No se guardan la API key ni las imágenes subidas. Magnific puede devolver URL o base64; la capa de normalización acepta ambos formatos.

La documentación consultada no garantiza que todas las URLs de resultado sean permanentes. Para archivo durable, implementa `saveGeneratedAsset()` con Vercel Blob, R2 u otro object storage antes de considerar el historial como respaldo.

## Deploy en Vercel

1. Importa el repositorio en Vercel.
2. Añade `MAGNIFIC_API_KEY` en Project Settings → Environment Variables.
3. Despliega. `vercel.json` fuerza el build nativo de Next.js mediante `npm run build:next`.

La aplicación no incluye autenticación. Si se expone fuera de un entorno privado, añade control de acceso antes de configurar una clave con créditos.

## Límites actuales

- No se ha ejecutado una generación real en este checkout porque no hay una API key disponible.
- El historial es local al dispositivo y no sincroniza entre navegadores.
- La edición usa image-to-image de FLUX.2 Pro; no simula máscara/inpainting.
- No hay almacenamiento durable de resultados ni webhooks en el MVP.
- Los límites de referencias y opciones visibles provienen de la matriz de capacidades documentada.
