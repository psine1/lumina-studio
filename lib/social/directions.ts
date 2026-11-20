import type { GenerationSettings } from "./schema";

export type ArtDirection = {
  name: string;
  instructions: string;
  approach: string;
  contentType: string;
  generationSettings?: GenerationSettings;
};

export const SURREALISM_FASHION: ArtDirection = {
  name: "Surrealism fashion",
  approach: "Surrealism fashion",
  contentType: "Campaña editorial",
  instructions: "Editorial de moda surrealista, cinematográfica y fotográfica, con tensión entre campo y ciudad. Atmósfera onírica, extraña y sofisticada: praderas nocturnas, jardines oscuros, caminos rurales y estacionamientos vacíos. Flash directo duro, sombras marcadas, fondos casi negros o cielos grises; grano analógico, contraste alto y desenfoque de movimiento selectivo, manteniendo la prenda nítida y legible. Paleta de rojo carmín, negro profundo, blanco hueso, verdes apagados y acentos azul noche. El rojo pertenece al entorno o a los objetos: conservar siempre el color real del producto. Una sola idea surrealista por imagen: un caballo escultórico rojo, una escala imposible, un objeto cotidiano fuera de contexto o una suspensión onírica. Elegir una escena por pieza, nunca un collage ni todas las ideas juntas. Gestos teatrales, poses abstractas/editoriales, torsiones y equilibrio inesperado, anatomía coherente; variar encuadres y puntos de vista según la prenda. La ropa es protagonista: preservar construcción, textura, silueta y detalles; no copiar los outfits de la referencia. Fotografía de campaña a sangre, sin texto ni logos nuevos. Mantener luz, tratamiento de color y clima compartidos entre piezas, variando escena y gesto.",
};

export const SOLAR_POETRY: ArtDirection = {
  name: "Solar poetry",
  approach: "Solar poetry",
  contentType: "Campaña editorial",
  instructions: "Editorial de moda cinematográfica y fotográfica: poesía solar, intimidad y tensión entre cuerpo y arquitectura mediterránea. Patios de piedra, muros de cal, escaleras escultóricas y terrazas vacías. Sol rasante de primera o última hora, sombras largas y geométricas, altas luces controladas y grano analógico fino. Paleta de arena, blanco hueso, terracota y miel, con acentos azul cielo; estos tonos pertenecen al entorno: conservar el color real del producto sin teñirlo de naranja. Un gesto poético por imagen: una sombra que prolonga la silueta, una cortina movida por el viento o un reflejo fragmentado. Elegir una sola escena por pieza, nunca un collage. Actitud íntima y segura, poses editoriales naturales, pasos suspendidos y giros sutiles; variar planos enteros, retratos y detalles con anatomía coherente. Encuadres asimétricos y espacio negativo; la prenda domina sobre la escenografía. Preservar construcción, textura, silueta, proporciones y detalles del producto; no copiar outfits de referencia. Fotografía de campaña a sangre, sin texto ni logos nuevos. Mantener luz, tratamiento de color y clima compartidos entre piezas, variando escena y gesto.",
};

// Built-ins are available even before local storage has been initialized.
export const BUILT_IN_DIRECTIONS = [SURREALISM_FASHION, SOLAR_POETRY];
export const SURREALISM_MODEL_INSTRUCTIONS = "Retain the same adult person, face, identity and body proportions from the primary product reference. Allow a new expressive editorial pose, abstract gesture and camera angle following the creative brief; do not lock the original pose. Keep plausible anatomy and preserve the exact garment construction, color and details. Do not change who is wearing the garment.";
