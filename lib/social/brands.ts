import type { Brand } from "./schema";

export const SADAELS: Brand = {
  id: "sadaels", name: "SADAELS", shopifyConnection: "default",
  description: "Marca argentino-belga de diseño avant-garde. Sastrería arquitectónica de Amberes y sensualidad rioplatense, desde una perspectiva contemporánea y sin género.",
  colors: ["#101010", "#4a3228", "#eee9df", "#8d8982", "#9b1725"], typography: "Arial",
  tone: "Sofisticado, rebelde, poético y minimalista. Frases breves en español e inglés. Confianza, misterio y precisión intelectual. Comunicar un concepto, no describir una venta.",
  direction: "Tensión entre disciplina europea e instinto sudamericano, sastrería y sensualidad, tradición y subversión. Fotografía editorial, claroscuro, sombras profundas, contraste y espacio negativo. Concreto envejecido, interiores industriales, corredores oscuros y entornos íntimos. Negro, marrón, crudo y neutros desaturados; acentos carmesí o metálicos. Alternar siluetas completas, retratos, construcción textil, movimiento, herrajes, encuadres experimentales y bodegones. Tipografía editorial mínima; el logo es opcional y siempre el archivo original.",
  prohibited: "Copy comercial genérico, emojis excesivos, clichés de moda, lujo vacío, hashtags innecesarios y llamadas agresivas a comprar. No usar Shop now, Elevate your style, Discover the latest trends. Evitar degradados comerciales, paletas saturadas, interiores de lujo genéricos y gráficos juguetones.",
  instructions: "Actuar como director de arte de moda y estratega de SADAELS. Proponer tres direcciones editoriales distintas. Nunca inventar colecciones, citas, materiales, técnicas, sostenibilidad ni inspiraciones históricas. Conservar construcción, silueta, proporciones, color, textura, botones, logos y detalles de la prenda. Priorizar la fotografía original y fondos separados. Nunca pedir al modelo que dibuje el logo. Separar caption de tipografía. Toda imagen de prenda modificada por IA requiere revisión humana.",
  logo: null, references: [],
};

export const SADAELS_DAYLIGHT: Brand = {
  ...SADAELS, id: "sadaels-daylight", name: "SADAELS · Luz natural",
  colors: ["#302b25", "#b6a793", "#f5f0e6", "#d8cbbb", "#73806b"], typography: "Georgia",
  tone: "Claro, sereno y preciso. Frases breves centradas en la presencia y construcción de la prenda, sin exageraciones comerciales.",
  direction: "Fotografía editorial luminosa con luz natural difusa, sombras suaves, fondos cálidos claros, piedra mate y madera natural. Composiciones abiertas y tranquilas, colores fieles y textura legible. Evitar corredores oscuros, claroscuro dramático y ambientes industriales. Respetar siempre el soporte o escena pedido por el usuario.",
  prohibited: "Sombras que oculten la prenda, fondos negros dominantes, saturación excesiva, clichés publicitarios, afirmaciones no verificadas y accesorios inventados.",
  instructions: "Crear imágenes de producto luminosas y serenas. Conservar diseño, color, construcción y detalles reales. Seguir el modo de creación y la escena solicitada. No dibujar textos ni logos; se agregan en el editor. No inventar materiales, colecciones ni atributos del producto.",
};
