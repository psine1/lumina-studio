# Social Studio — primera versión

Social Studio vive en `/social`, con acceso desde la navegación de imagen, edición, video e historial. No cambia los prompts ni el comportamiento del generador general.

## Shopify: exclusivamente lectura

La configuración actual usa `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID` y `SHOPIFY_CLIENT_SECRET`. El dominio debe ser el original `*.myshopify.com`. El servidor obtiene un token con client credentials, lo mantiene en memoria y lo renueva antes del vencimiento o tras un 401. También admite `SHOPIFY_ADMIN_ACCESS_TOKEN`. `SHOPIFY_API_VERSION` es opcional; por defecto usa `2026-10`.

El grant requiere una app instalada en una tienda de la misma organización. Documentación: https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant

El permiso mínimo es `read_products`. La app instalada actualmente tiene permisos más amplios; esta implementación no los utiliza. El único acceso a Shopify Admin está encapsulado en funciones con consultas GraphQL fijas: productos, colecciones y un producto. No se admiten documentos arbitrarios ni mutations. El POST de autenticación y los POST de GraphQL no modifican productos, inventario ni medios.

Las credenciales nunca forman parte de respuestas ni bundles de cliente. `.env.local` permanece ignorado por Git. Los errores no devuelven tokens ni cuerpos de autenticación.

El catálogo admite búsqueda por título, paginación por cursor, filtro de colección y actualización. Shopify no ofrece un argumento de búsqueda en `Collection.products`: al combinar colección y búsqueda se filtra cada página; se conserva el botón para cargar las siguientes. Se cargan hasta 30 fotografías, 50 variantes y 20 colecciones por producto, indicando si hay más. El selector carga todas las páginas de colecciones.

Las fotografías pasan por `/api/social/media`, que solo acepta HTTPS y rutas `/s/files/` en `cdn.shopify.com`. No sigue redirecciones y verifica tipo y tamaño máximo de 15 MB. Esto permite exportar el lienzo desde el mismo origen y bloquea peticiones a hosts arbitrarios.

## Dirección editorial y composición

Por elección del usuario, esta versión utiliza tres presets editoriales; **no es un agente de IA de texto** y no requiere un nuevo servicio ni credenciales de texto. Las propuestas son editorial asimétrica, marco de detalle y presencia mínima. No se atribuyen materiales, colecciones ni afirmaciones al producto que no estén presentes en el catálogo.

La selección de contenido puede priorizar detalle o composición mínima. Las notas libres se envían a Magnific junto con el Brand Kit, el layout y la foto del producto: dirigen la transformación visual. No hay un modelo de texto que escriba conceptos o captions nuevos; estos siguen siendo presets editables. Los atajos locales reconocen quitar texto, oscurecer el marco, más espacio negativo y foco en silueta / brutalismo. El campo de ajuste visual se envía al modelo al generar otra versión.

El Brand Kit SADAELS está separado del generador y utiliza un modelo de marca reusable con paleta, tipografía, dirección, tono, prohibiciones, instrucciones, referencias y conexión de Shopify. En esta primera versión hay una tienda de servidor y una marca activa. Las referencias e instrucciones se guardan para consulta; no se analizan automáticamente ni hay selector de múltiples tiendas.

El editor existente solo admite edición de imágenes por prompt y no posee capas. Se añade una capacidad de composición para Social Studio, manteniendo ese flujo intacto y reutilizando sus APIs de generación. El esquema editable conserva fondo, fotografía original, texto y logo opcional; el mismo renderer se usa para preview y exportación. No hay coordenadas inventadas por un modelo: los layouts tienen parámetros controlables.

El boceto sin generar conserva la foto original y su fondo. Al generar el posteo, Magnific transforma la escena utilizando esa foto como referencia y recibe instrucciones de preservar la construcción, el color y los detalles. El resultado reemplaza la fotografía del lienzo, conserva el original separado y aparece como imagen generada con IA. No se garantiza fidelidad exacta: se muestran ambas imágenes para comparar y se requiere marcar la revisión antes de exportar. Texto y logo se aplican después, por separado; se pide al modelo que no los dibuje.

`Generar este posteo` y `Generar posteo con Magnific` crean una sola tarea de Nano Banana Pro Flash en 1K mediante la integración de edición existente. Las referencias remotas incluyen el MIME inferido de su extensión, requerido por el proveedor. No se generan automáticamente tres imágenes, no se utiliza Google Search y no se reintentan POST pagos. Los IDs de solicitud agrupan clics repetidos en el mismo proceso durante una hora; no es una garantía de idempotencia distribuida entre reinicios del servidor.

La tarea pendiente se guarda localmente. Recargar o usar `Consultar resultado` solo consulta el estado y no crea otra generación. Los resultados se recuperan desde el servidor por ID de tarea, sin depender del CORS del proveedor: se verifican host HTTPS, redirecciones, tipo y tamaño. Los hosts admitidos son los proveedores conocidos listados en la ruta de resultado; no se permite un proxy con URLs arbitrarias del navegador.

Se completó una única imagen real de prueba en 1K, además de solicitudes rechazadas por validación que no devolvieron tareas. El proyecto editable y la imagen están en `outputs/social-magnific-project.json` y `outputs/social-magnific-preview.png`, archivos locales ignorados por Git. No se generaron más variantes.

## Guardado y descarga

### Texto y logo editables

En la pestaña `Texto` del posteo abierto se puede editar el texto, elegir tipografía y color, ajustar tamaño en píxeles, negrita, cursiva, alineación y sombra suave. Hay ubicaciones rápidas arriba, centro y abajo; el ancho, interlineado, espaciado, opacidad y posición precisa se agrupan en opciones avanzadas. El caption permanece separado.

La pestaña `Logo` permite cargar o reemplazar el archivo directamente en el proyecto, mostrarlo u ocultarlo, ajustar tamaño, posición y opacidad. Se admite PNG, JPG o WebP de hasta 1 MB; PNG transparente es la opción recomendada. El logo conserva sus proporciones y no se envía a Shopify ni a Magnific. Modificar el logo de un proyecto no cambia el Brand Kit global ni otros proyectos.

En la vista previa se pueden arrastrar ambos elementos o seleccionarlos con Tab y moverlos con las flechas (Shift mueve 10 píxeles). Los controles de posición también funcionan sin arrastrar. Las guías de margen y centro son ayudas del editor y no aparecen en la descarga.

Los estilos y las posiciones relativas se guardan con el proyecto y en su JSON. Los proyectos anteriores reciben valores predeterminados al abrirse. El mismo renderer aplica estos ajustes a la vista previa y al PNG/JPG. Los elementos se mantienen dentro del lienzo; si todo el texto no cabe, se muestra un aviso y se impide exportar texto cortado. Ninguna de estas acciones inicia llamadas a Magnific ni consume créditos.

### Organización del flujo y del editor

`Crear posteo` muestra tres pasos: elegir producto, definir dirección y editar/descargar. La preparación agrupa la foto de referencia, los formatos visuales y el brief; ofrece puntos de partida sin costo y deja el tipo de contenido y otras opciones bajo un desplegable. Al preparar las direcciones, el brief se resume para dar espacio a las tres propuestas. Elegir una dirección abre el editor sin generar imágenes ni consumir créditos; la llamada paga ocurre exclusivamente al pulsar `Generar con Magnific` o `Generar otra versión`.

El editor conserva el lienzo visible y organiza las herramientas en `Imagen`, `Texto`, `Logo` y `Descargar`. Seleccionar una capa sobre el lienzo abre su herramienta. La vista limpia oculta guías y controles; la comparación muestra original y resultado. Guardar y Descargar permanecen accesibles en una barra superior en escritorio y una barra inferior en teléfonos. El indicador de cambios y la confirmación al volver evitan descartar el trabajo sin aviso; también se avisa al cerrar o recargar con cambios sin guardar. Guardar no navega si falla el almacenamiento.

`Descargar` concentra la elección PNG/JPG, la revisión de la prenda, el caption ES/EN, la copia bilingüe y el proyecto JSON. Las opciones técnicas de tarea y composición no ocupan la vista principal. Los avisos informativos se muestran temporalmente; los errores permanecen visibles. El catálogo incluye estados de carga con tarjetas y las interfaces respetan la preferencia de movimiento reducido.

La persistencia reutiliza `localStorage`, con claves exclusivas de Social Studio. No se introduce una base de datos. Cada proyecto conserva una copia del Brand Kit, evitando que editar la marca altere proyectos existentes. Guardar es explícito. Se puede reabrir, duplicar, cambiar de formato, editar captions por idioma y copiar el caption separado de la tipografía.

La exportación genera PNG o JPG a 1080 × 1080, 1080 × 1350 o 1080 × 1920. El proyecto JSON permite guardar una copia editable en el equipo e importarla con un ID nuevo. No se publican imágenes en Shopify, Instagram ni Facebook; no hay endpoints de publicación ni uploads hacia SADAELS.

Los proyectos y assets locales no se sincronizan entre dispositivos. Fotos del catálogo siguen dependiendo de sus URLs originales. Fondos grandes pueden superar la cuota de `localStorage`; se informa del error y se ofrece descargar JSON. Esta versión mantiene el contexto privado de la aplicación existente, que no tiene autenticación propia; no se desplegó ni se cambió su audiencia.

## Verificación

- `node scripts/verify-social.mjs`: schemas y migración de proyectos previos, presets, texto personalizado, URLs, lectura de Shopify, tokens, rate limits, proporciones y exportación. Verifica también el brief, la referencia y su MIME, el modelo en 1K, deduplicación de llamadas pagas, consultas de estado, descarga y reemplazo de la imagen del lienzo. Usa mocks; no consume APIs.
- `node node_modules/next/dist/bin/next typegen` y `node node_modules/typescript/bin/tsc --noEmit`.
- `npm run build:next`: build de producción de Next para el destino Vercel existente.
- Verificaciones reales de Shopify: token, dos páginas distintas, búsqueda, colecciones, filtro, moneda y fotografía original. Lectura exclusivamente.

No hubo un navegador conectado disponible en esta sesión: la interacción y descarga visual completas requieren una prueba manual en `/social`.

### Compatibilidad con la vista local Vite / Cloudflare

También se verificó el entorno de `npm run dev` en el puerto 5173: rutas existentes y Social Studio, catálogo real, colecciones y fotografía original. Las peticiones usan `redirect: "manual"`, compatible con Workers; las respuestas 3xx se rechazan sin seguirlas ni reenviar credenciales. La navegación se precompila en el entorno cliente para evitar que su importación diferida dispare una nueva optimización durante el primer clic. Se verificaron 34 módulos de navegación y que el hash de dependencias permanezca estable tras las consultas.
