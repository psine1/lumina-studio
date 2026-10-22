import type { Composition } from "./schema";

function shallowEqual(a: object, b: object) {
  return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => value === (b as Record<string, unknown>)[key]);
}
export function sameComposition(a: Composition, b: Composition) {
  if (a === b) return true;
  const { layers: left, textStyle: leftText, logoStyle: leftLogo, ...leftBase } = a;
  const { layers: right, textStyle: rightText, logoStyle: rightLogo, ...rightBase } = b;
  return shallowEqual(leftBase, rightBase) && shallowEqual(leftText, rightText) && shallowEqual(leftLogo, rightLogo) && (left === right || Boolean(left && right && left.length === right.length && left.every((layer, index) => {
    const other = right[index], { style, ...rest } = layer, { style: otherStyle, ...otherRest } = other;
    return shallowEqual(rest, otherRest) && shallowEqual(style, otherStyle);
  })));
}

export class EditHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private gesture = false;
  private gestureRecorded = false;
  private mergeKey: string | undefined;
  private lastEdit = 0;
  private version = 0;
  private listeners = new Set<() => void>();
  constructor(public current: T, private equal: (a: T, b: T) => boolean, private limit = 60) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getVersion = () => this.version;
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  private emit() { this.version++; this.listeners.forEach((listener) => listener()); }
  begin() { this.gesture = true; this.gestureRecorded = false; this.mergeKey = undefined; }
  end() { this.gesture = false; this.gestureRecorded = false; this.mergeKey = undefined; }
  commit(next: T, key?: string, now = Date.now()) {
    if (this.equal(this.current, next)) return;
    const merge = this.gesture ? this.gestureRecorded : Boolean(key && key === this.mergeKey && now - this.lastEdit < 700);
    if (!merge) { this.past.push(this.current); if (this.past.length > this.limit) this.past.shift(); }
    this.current = next; this.future = []; this.gestureRecorded = this.gesture;
    this.mergeKey = key; this.lastEdit = now; this.emit();
  }
  reset(next: T) { this.current = next; this.past = []; this.future = []; this.end(); this.emit(); }
  undo() {
    if (!this.canUndo) return null;
    this.end(); this.future.push(this.current); this.current = this.past.pop()!; this.emit(); return this.current;
  }
  redo() {
    if (!this.canRedo) return null;
    this.end(); this.past.push(this.current); this.current = this.future.pop()!; this.emit(); return this.current;
  }
}
