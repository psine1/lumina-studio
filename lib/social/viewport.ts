export function zoomViewport(scale: number, pan: { x: number; y: number }, requested: number, anchor = { x: 0, y: 0 }) {
  const next = Math.max(.05, Math.min(4, requested));
  const ratio = next / scale;
  return { scale: next, pan: { x: anchor.x - (anchor.x - pan.x) * ratio, y: anchor.y - (anchor.y - pan.y) * ratio } };
}
