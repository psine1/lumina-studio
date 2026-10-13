# Luma Studio

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
- Imagen y edición: `POST /v1/ai/text-to-image/flux-2-pro`
- Video desde texto: `POST /v1/ai/text-to-video/runway-4-5`
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
