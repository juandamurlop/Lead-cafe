import { h } from './dom';

export interface Punto { x: number; y: number }

interface Escala {
  x: (v: number) => number;
  y: (v: number) => number;
}

function escalas(
  w: number, hgt: number, pad: [number, number, number, number],
  xr: [number, number], yr: [number, number],
): Escala {
  const [pt, pr, pb, pl] = pad;
  const iw = w - pl - pr;
  const ih = hgt - pt - pb;
  return {
    x: (v) => pl + ((v - xr[0]) / (xr[1] - xr[0])) * iw,
    y: (v) => pt + (1 - (v - yr[0]) / (yr[1] - yr[0])) * ih,
  };
}

export interface CurvaOpts {
  datos: Punto[];
  xr: [number, number];
  yr: [number, number];
  bandaY?: [number, number];
  marcador?: Punto;
  colorMarcador?: string;
  etiquetaX?: string;
  ticksX?: number[];
  ticksY?: number[];
}

/** Margen izquierdo del área de trazado, en unidades del viewBox. */
export const CURVA_PAD_IZQ = 44;
export const CURVA_PAD_DER = 14;
export const CURVA_ANCHO = 520;

/** Convierte una fracción 0–1 del ancho del contenedor a valor del eje x. */
export function fraccionAEjeX(f: number, xr: [number, number]): number {
  const iw = CURVA_ANCHO - CURVA_PAD_IZQ - CURVA_PAD_DER;
  const px = f * CURVA_ANCHO;
  const v = xr[0] + ((px - CURVA_PAD_IZQ) / iw) * (xr[1] - xr[0]);
  return Math.max(xr[0], Math.min(xr[1], v));
}

/** Curva de secado con banda objetivo y marcador arrastrable. */
export function curva(o: CurvaOpts): SVGSVGElement {
  const W = 520, H = 230;
  const pad: [number, number, number, number] = [14, 14, 30, 44];
  const s = escalas(W, H, pad, o.xr, o.yr);

  const kids: Element[] = [];

  if (o.bandaY) {
    kids.push(h('rect', {
      x: pad[3], y: s.y(o.bandaY[1]), width: W - pad[3] - pad[1],
      height: Math.abs(s.y(o.bandaY[0]) - s.y(o.bandaY[1])),
      class: 'ch-band',
    }));
  }

  for (const t of o.ticksY ?? []) {
    kids.push(h('line', { x1: pad[3], x2: W - pad[1], y1: s.y(t), y2: s.y(t), class: 'ch-grid' }));
    kids.push(h('text', { x: pad[3] - 8, y: s.y(t) + 4, class: 'ch-tick', 'text-anchor': 'end', text: String(t) }));
  }
  for (const t of o.ticksX ?? []) {
    kids.push(h('text', { x: s.x(t), y: H - 10, class: 'ch-tick', 'text-anchor': 'middle', text: String(t) }));
  }
  if (o.etiquetaX) {
    kids.push(h('text', {
      x: (pad[3] + W - pad[1]) / 2, y: H - 0, class: 'ch-axis-label',
      'text-anchor': 'middle', text: o.etiquetaX,
    }));
  }

  const d = o.datos.map((p, i) => `${i ? 'L' : 'M'}${s.x(p.x).toFixed(1)} ${s.y(p.y).toFixed(1)}`).join('');
  const area = `${d}L${s.x(o.xr[1]).toFixed(1)} ${s.y(o.yr[0])}L${s.x(o.xr[0]).toFixed(1)} ${s.y(o.yr[0])}Z`;
  kids.push(h('path', { d: area, class: 'ch-area' }));
  kids.push(h('path', { d, class: 'ch-line' }));

  if (o.marcador) {
    const mx = s.x(o.marcador.x), my = s.y(o.marcador.y);
    const c = o.colorMarcador ?? 'var(--accent)';
    kids.push(h('line', { x1: mx, x2: mx, y1: pad[0], y2: H - pad[2], class: 'ch-cursor', stroke: c }));
    kids.push(h('circle', { cx: mx, cy: my, r: 9, fill: c, opacity: '0.18' }));
    kids.push(h('circle', { cx: mx, cy: my, r: 5.5, fill: c, class: 'ch-dot' }));
  }

  return h('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img',
    preserveAspectRatio: 'xMidYMid meet',
  }, ...kids) as unknown as SVGSVGElement;
}

export interface BarraComparada {
  etiqueta: string;
  valor: number;
  color: string;
}

/** Dos o más barras horizontales comparables. */
export function barras(items: BarraComparada[], max: number, unidad: string): SVGSVGElement {
  const W = 520, fila = 46, H = items.length * fila + 10;
  const pl = 92, pr = 76;
  const kids: Element[] = [];
  items.forEach((it, i) => {
    const y = i * fila + 14;
    const w = Math.max(2, ((W - pl - pr) * it.valor) / max);
    kids.push(h('text', { x: pl - 12, y: y + 15, class: 'ch-blabel', 'text-anchor': 'end', text: it.etiqueta }));
    kids.push(h('rect', { x: pl, y, width: W - pl - pr, height: 22, rx: 6, class: 'ch-btrack' }));
    kids.push(h('rect', { x: pl, y, width: w, height: 22, rx: 6, fill: it.color, class: 'ch-bfill' }));
    kids.push(h('text', {
      x: pl + w + 10, y: y + 16, class: 'ch-bval',
      text: `${it.valor.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${unidad}`,
    }));
  });
  return h('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' }, ...kids) as unknown as SVGSVGElement;
}

/** Franja de 24 horas con banda segura. */
export function franja24(
  valores: number[], seguro: [number, number], yr: [number, number],
): SVGSVGElement {
  const W = 520, H = 150;
  const pad: [number, number, number, number] = [12, 12, 26, 36];
  const s = escalas(W, H, pad, [0, valores.length - 1], yr);
  const kids: Element[] = [];

  kids.push(h('rect', {
    x: pad[3], y: s.y(seguro[1]), width: W - pad[3] - pad[1],
    height: Math.abs(s.y(seguro[0]) - s.y(seguro[1])), class: 'ch-band',
  }));
  for (const t of [yr[0], (yr[0] + yr[1]) / 2, yr[1]]) {
    kids.push(h('line', { x1: pad[3], x2: W - pad[1], y1: s.y(t), y2: s.y(t), class: 'ch-grid' }));
    kids.push(h('text', { x: pad[3] - 7, y: s.y(t) + 4, class: 'ch-tick', 'text-anchor': 'end', text: String(Math.round(t)) }));
  }
  for (const hh of [0, 6, 12, 18]) {
    kids.push(h('text', { x: s.x(hh), y: H - 8, class: 'ch-tick', 'text-anchor': 'middle', text: `${hh}h` }));
  }

  const d = valores.map((v, i) => `${i ? 'L' : 'M'}${s.x(i).toFixed(1)} ${s.y(v).toFixed(1)}`).join('');
  kids.push(h('path', { d, class: 'ch-line' }));
  valores.forEach((v, i) => {
    if (i % 3 !== 0) return;
    const fuera = v < seguro[0] || v > seguro[1];
    kids.push(h('circle', { cx: s.x(i), cy: s.y(v), r: 3, class: fuera ? 'ch-pt-bad' : 'ch-pt-ok' }));
  });
  return h('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' }, ...kids) as unknown as SVGSVGElement;
}

/** Anillo de progreso. */
export function anillo(pct: number, etiqueta: string): SVGSVGElement {
  const R = 54, C = 2 * Math.PI * R;
  const off = C * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return h('svg', { viewBox: '0 0 140 140', class: 'ring', role: 'img' },
    h('circle', { cx: 70, cy: 70, r: R, class: 'ring-track' }),
    h('circle', {
      cx: 70, cy: 70, r: R, class: 'ring-fill',
      'stroke-dasharray': C.toFixed(1), 'stroke-dashoffset': off.toFixed(1),
      transform: 'rotate(-90 70 70)',
    }),
    h('text', { x: 70, y: 72, class: 'ring-num', 'text-anchor': 'middle', text: `${Math.round(pct)} %` }),
    h('text', { x: 70, y: 92, class: 'ring-lbl', 'text-anchor': 'middle', text: etiqueta }),
  ) as unknown as SVGSVGElement;
}
