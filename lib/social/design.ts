import { compositionLayers } from "./layers";
import { sameComposition } from "./history";
import type { Composition, Project } from "./schema";

export type DesignUndo = { id: string; before: Composition; after: Composition }[];

// Only editable overlays are a shared design. Photography, crop, subject mask,
// format, approval, product facts and generation settings belong to each piece.
export function copyDesign(source: Project, target: Composition): Composition {
  const design = source.composition;
  return {
    ...target,
    layers: structuredClone(compositionLayers(design, source.brand)),
    text: design.text, textColor: design.textColor, font: design.font,
    logoVisible: design.logoVisible,
    textStyle: structuredClone(design.textStyle), logoStyle: structuredClone(design.logoStyle),
  };
}

export function applyDesignToPieces(source: Project, pieces: Project[], targetIds: string[], updatedAt: string) {
  const ids = new Set(targetIds);
  if (!pieces.some(piece => piece.id === source.id) || !ids.size || ids.has(source.id) || [...ids].some(id => !pieces.some(piece => piece.id === id))) {
    throw new Error("Elegí otras piezas de esta campaña para aplicar el diseño.");
  }
  if (pieces.some(piece => ids.has(piece.id) && piece.generation?.status === "pending")) {
    throw new Error("Esperá a que termine la generación de las piezas seleccionadas.");
  }
  const undo: DesignUndo = [];
  const projects = pieces.map(piece => {
    if (!ids.has(piece.id)) return piece;
    const composition = copyDesign(source, piece.composition);
    undo.push({ id: piece.id, before: piece.composition, after: composition });
    return { ...piece, composition, updatedAt };
  });
  return { projects, undo };
}

export function undoAppliedDesign(pieces: Project[], undo: DesignUndo, updatedAt: string): Project[] {
  if (undo.some(entry => {
    const piece = pieces.find(piece => piece.id === entry.id);
    return !piece || !sameComposition(piece.composition, entry.after);
  })) throw new Error("Las piezas cambiaron después de aplicar el diseño. Se conservaron esos ajustes; ya no se puede deshacer esta aplicación.");
  return pieces.map(piece => {
    const entry = undo.find(entry => entry.id === piece.id);
    return entry ? { ...piece, composition: structuredClone(entry.before), updatedAt } : piece;
  });
}
