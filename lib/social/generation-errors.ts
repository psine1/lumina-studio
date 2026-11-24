export function generationFailureMessage(reason?: string) {
  if (!reason?.trim()) return "Magnific informó que la generación falló, pero no devolvió el motivo. Conservá el ID de tarea para revisar el fallo.";
  if (reason === "The AI model did not return a generated result") return "El modelo de IA terminó sin devolver una imagen. Magnific no especificó la causa.";
  return `Magnific informó: ${reason.trim().slice(0, 700)}`;
}

export function providerFailureReason(task: unknown): string | undefined {
  function detail(value: unknown, depth = 0): string | undefined {
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 700);
    if (!value || typeof value !== "object" || depth > 3) return undefined;
    const record = value as Record<string, unknown>;
    for (const key of ["error", "detail", "reason", "message", "errors"]) {
      const result = detail(record[key], depth + 1);
      if (result) return result;
    }
    if (Array.isArray(value)) return value.map(item => detail(item, depth + 1)).filter(Boolean).join("; ").slice(0, 700) || undefined;
  }
  if (!task || typeof task !== "object") return undefined;
  const record = task as Record<string, unknown>;
  return detail(record.data) || detail(record);
}
