# Social Studio — primera versión

Social Studio vive en `/social`, con acceso desde la navegación de imagen, edición, video e historial. No cambia los prompts ni el comportamiento del generador general.

## Shopify: exclusivamente lectura

La configuración actual usa `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID` y `SHOPIFY_CLIENT_SECRET`. El dominio debe ser el original `*.myshopify.com`. El servidor obtiene un token con client credentials, lo mantiene en memoria y lo renueva antes del vencimiento o tras un 401. También admite `SHOPIFY_ADMIN_ACCESS_TOKEN`. `SHOPIFY_API_VERSION` es opcional; por defecto usa `2026-10`.

El grant requiere una app instalada en una tienda de la misma organización. Documentación: https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant

El permiso mínimo es `read_products`. La app instalada actualmente tiene permisos más amplios; esta implementación no los utiliza. El único acceso a Shopify Admin está encapsulado en funciones con consultas GraphQL fijas: productos, colecciones y un producto. No se admiten documentos arbitrarios ni mutations. El POST de autenticación y los POST de GraphQL no modifican productos, inventario ni medios.

Las credenciales nunca forman parte de respuestas ni bundles de cliente. `.env.local` permanece ignorado por Git. Los errores no devuelven tokens ni cuerpos de autenticación.

El catálogo admite búsqueda por título, paginación por cursor, filtro de colección y actualización. Shopify no ofrece un argumento de búsqueda en `Collection.products`: al combinar colección y búsqueda se filtra cada página; se conserva el botón para cargar las siguientes. Se cargan hasta 30 fotografías, 50 variantes y 20 colecciones por producto, indicando si hay más. El selector carga todas las páginas de colecciones.

Al seleccionar un producto se completa su galería mediante una consulta de detalle. Esta consulta pagina las imágenes de Shopify de 100 en 100, con límite de seguridad de 500 y detección de cursores repetidos. La generación vuelve a consultar las referencias del producto en el servidor antes de enviarlas al proveedor.

Las fotografías pasan por `/api/social/media`, que solo acepta HTTPS y rutas `/s/files/` en `cdn.shopify.com`. No sigue redirecciones y verifica tipo y tamaño máximo de 15 MB. Esto permite exportar el lienzo desde el mismo origen y bloquea peticiones a hosts arbitrarios.

## Dirección editorial y composición

El lienzo y la comparación incluyen zoom de 5% a 400%, ajuste a la ventana, vista al 100%, mano para desplazar y vista ampliada con cierre por Escape. Ctrl/Comando + rueda amplía alrededor del cursor; Espacio activa la mano temporalmente con foco en el lienzo. En comparación ambas imágenes comparten zoom y desplazamiento. Estas herramientas solo afectan la vista y no modifican el proyecto, la composición ni la exportación.

### Tres modos y referencias múltiples

En Solo prenda, «¿Dónde querés la prenda?» permite seguir el brief, apoyarla sobre una mesa, colocarla en el suelo, flotarla o usar otro elemento descrito por el usuario. El soporte o escena se guarda en el proyecto. Las instrucciones exigen acomodar la tela bajo gravedad sobre el soporte visible, sin conservar la pose de la persona; para prendas transparentes, los huecos deben mostrar el fondo o soporte, nunca piel. Estas reglas también se aplican a proyectos anteriores con instrucciones de modo personalizadas. La validación local comprueba los prompts; el resultado visual depende del modelo y requiere revisión.

Hay tres botones en la preparación y en la pestaña Imagen del editor: `Editorial` (misma persona y otra escena), `Solo prenda` (únicamente el producto nombrado, sin persona ni maniquí visible, sobre fondo neutro) y `Otra modelo` (la prenda en otra persona adulta). El tercer modo admite subir una foto PNG/JPG/WebP de hasta 1 MB o describir un modelo nuevo. Si no hay foto ni descripción suficiente, se impide generar.

Las instrucciones base de cada modo se pueden editar en opciones avanzadas y se guardan por proyecto. Las reglas de fidelidad siguen aplicándose. Separar la prenda puede reconstruir zonas ocultas; transferirla puede alterar el calce. La comparación y aprobación antes de exportar siguen siendo necesarias.

`Ahorro` usa Flash con hasta 3 referencias totales. `Más vistas` usa todas las fotos que quepan: Flash si alcanzan 3 lugares, o Nano Banana Pro hasta 14. Al cambiar a Solo prenda u Otra modelo se preselecciona Más vistas y se muestra el modelo antes de generar. Pro puede consumir más créditos; no se hacen comparativas pagas automáticas. Si la foto de la nueva persona está presente, ocupa el último lugar: quedan hasta 13 referencias de la prenda en Pro, o 2 en Flash.

La referencia elegida va primero y fija el color/estampado; las demás vistas van en el orden del catálogo, sin duplicar la principal. El panel muestra cantidad, miniaturas y fotos omitidas por el límite: no afirma usar todas cuando no caben. Se indican al modelo los roles de las fotos de producto y de persona. Las URLs de producto se verifican contra Shopify; la foto de persona se carga a Magnific únicamente al generar y no se sube a Shopify.

Antes de pagar se comprueba que el modelo calculado en el servidor coincida con el mostrado en el cliente. Si las fotos cambiaron y requieren otro modelo, se devuelve un error para revisar la elección en lugar de subir de modelo silenciosamente. Se guarda el proveedor y el número de referencias de cada tarea para consultarla después sin generar otra imagen. Los proyectos previos conservan el modo Editorial y la estrategia Ahorro.

Límites consultados: https://docs.magnific.com/api-reference/text-to-image/nano-banana-pro-flash/overview y https://docs.magnific.com/api-reference/text-to-image/post-nano-banana-pro. Se usa el límite conservador de 3 para Flash, ante diferencias entre su página de resumen y el esquema detallado.

El flujo es producto → brief → editor, sin seleccionar propuestas en una pantalla intermedia. El brief abre una composición inicial sin generar una imagen ni gastar créditos. En Imagen, Cambiar estilo permite elegir Foto protagonista, Fondo claro o Más espacio libre. Si ya hay una imagen generada, el estilo se aplica a la siguiente generación.

Esta versión utiliza tres presets editoriales; **no es un agente de IA de texto** y no requiere un nuevo servicio ni credenciales de texto. Las propuestas son editorial asimétrica, marco de detalle y presencia mínima. No se atribuyen materiales, colecciones ni afirmaciones al producto que no estén presentes en el catálogo.

La selección de contenido puede priorizar detalle o composición mínima. Las notas libres se envían a Magnific junto con el Brand Kit, el layout y la foto del producto: dirigen la transformación visual. No hay un modelo de texto que escriba conceptos o captions nuevos; estos siguen siendo presets editables. Los atajos locales reconocen quitar texto, oscurecer el marco, más espacio negativo y foco en silueta / brutalismo. El campo de ajuste visual se envía al modelo al generar otra versión.

El Brand Kit SADAELS está separado del generador y utiliza un modelo de marca reusable con paleta, tipografía, dirección, tono, prohibiciones, instrucciones, referencias y conexión de Shopify. Hay una tienda de servidor y varios Brand Kits locales. La migración conserva el kit existente como primero y agrega SADAELS · Luz natural como segundo kit de prueba. Marca permite elegir, editar, guardar o crear una copia con identidad propia; el brief y la pestaña Imagen del editor permiten elegir el kit para el posteo. Cada proyecto guarda su propia copia: editar un kit no altera proyectos anteriores. Cambiarlo en el editor aplica tipografía y logo; la escena generada cambia al generar otra versión. Los kits se conservan en IndexedDB en este navegador. Las referencias e instrucciones se guardan para consulta; no se analizan automáticamente ni hay selector de múltiples tiendas.

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

Social Studio guarda proyectos, Brand Kit y tareas pendientes en IndexedDB (`luma-social`, stores `projects` y `settings`). Cada proyecto se escribe individualmente y el indicador de guardado espera la confirmación de la transacción. Al abrir la aplicación se migran las claves anteriores de `localStorage`; solo se eliminan cuando la migración completa confirma su escritura. Si falla, se conserva el origen. Una copia antigua no reemplaza un proyecto más reciente. Cada proyecto conserva su Brand Kit, evitando que editar la marca altere proyectos existentes. Guardar es explícito. Se puede reabrir, duplicar, eliminar, cambiar de formato y editar captions.

La exportación genera PNG o JPG a 1080 × 1080, 1080 × 1350 o 1080 × 1920. El proyecto JSON permite guardar una copia editable en el equipo e importarla con un ID nuevo. No se publican imágenes en Shopify, Instagram ni Facebook; no hay endpoints de publicación ni uploads hacia SADAELS.

Los proyectos y assets locales no se sincronizan entre dispositivos. Fotos del catálogo siguen dependiendo de sus URLs originales. IndexedDB admite proyectos mayores que la cuota pequeña de `localStorage`, pero sigue sujeto al espacio y los permisos del navegador. Se conserva la exportación/importación JSON como respaldo. Esta versión mantiene el contexto privado de la aplicación existente, que no tiene autenticación propia; no se desplegó ni se cambió su audiencia. Las pruebas de almacenamiento usan `fake-indexeddb` y cubren migración, repetición sin duplicados, proyectos de más de 5 MB, fallos de transacciones sin pérdida del origen, reapertura y eliminación.

## Verificación

- `node scripts/verify-social.mjs`: schemas y migración de proyectos previos, presets, texto personalizado, URLs, lectura de Shopify, tokens, rate limits, proporciones y exportación. Verifica también el brief, la referencia y su MIME, el modelo en 1K, deduplicación de llamadas pagas, consultas de estado, descarga y reemplazo de la imagen del lienzo. Usa mocks; no consume APIs.
- `node node_modules/next/dist/bin/next typegen` y `node node_modules/typescript/bin/tsc --noEmit`.
- `npm run build:next`: build de producción de Next para el destino Vercel existente.
- Verificaciones reales de Shopify: token, dos páginas distintas, búsqueda, colecciones, filtro, moneda y fotografía original. Lectura exclusivamente.

No hubo un navegador conectado disponible en esta sesión: la interacción y descarga visual completas requieren una prueba manual en `/social`.

### Profundidad de texto y logo

En Texto o Logo, abrir **Preparar recorte de la modelo**, pulsar **Detectar modelo**, corregir la zona verde con **Incluir/Borrar** y guardar. Luego elegir **Detrás de la modelo** en la profundidad de cada elemento. La máscara permite restaurar los píxeles originales de la persona por encima de los elementos posteriores, sin regenerar la fotografía. Se comparte el render entre vista previa y descarga PNG/JPG; se conserva en el proyecto JSON.

La detección usa MediaPipe en el navegador, sin enviar la fotografía ni gastar créditos. La primera ejecución requiere conexión para descargar WASM y el modelo de segmentación. Pelo, transparencias y detalles finos pueden requerir corrección manual. Cambiar foto, formato o encuadre invalida el recorte anterior. Se verificó el orden de capas con pruebas; la precisión visual del detector requiere revisión sobre la imagen real.

### Compatibilidad con la vista local Vite / Cloudflare

También se verificó el entorno de `npm run dev` en el puerto 5173: rutas existentes y Social Studio, catálogo real, colecciones y fotografía original. Las peticiones usan `redirect: "manual"`, compatible con Workers; las respuestas 3xx se rechazan sin seguirlas ni reenviar credenciales. La navegación se precompila en el entorno cliente para evitar que su importación diferida dispare una nueva optimización durante el primer clic. Se verificaron 34 módulos de navegación y que el hash de dependencias permanezca estable tras las consultas.
