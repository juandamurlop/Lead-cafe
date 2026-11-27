type Child = Node | string | number | false | null | undefined;

export interface Attrs {
  class?: string;
  id?: string;
  style?: string;
  text?: string;
  html?: string;
  [key: string]: unknown;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'defs', 'marker', 'linearGradient', 'stop', 'clipPath', 'ellipse',
]);

/** Crea un elemento con atributos y descendientes. Soporta SVG. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs?: Attrs, ...children: Child[]
): HTMLElementTagNameMap[K];
export function h(tag: string, attrs?: Attrs, ...children: Child[]): Element;
export function h(tag: string, attrs: Attrs = {}, ...children: Child[]): Element {
  const el = SVG_TAGS.has(tag)
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);

  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') { el.textContent = String(v); continue; }
    if (k === 'html') { el.innerHTML = String(v); continue; }
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      continue;
    }
    el.setAttribute(k, String(v));
  }

  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(sel);
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function mount(el: Element, ...children: Child[]): void {
  clear(el);
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}

/** Anima un número hacia su valor destino. Devuelve un cancelador. */
export function tween(
  from: number, to: number, ms: number, cb: (v: number) => void,
): () => void {
  if (ms <= 0 || from === to) { cb(to); return () => {}; }
  const t0 = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms);
    const eased = 1 - Math.pow(1 - p, 3);
    cb(from + (to - from) * eased);
    if (p < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
