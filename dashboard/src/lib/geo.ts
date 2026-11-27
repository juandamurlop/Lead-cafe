export type LonLat = [number, number];

export interface Proyeccion {
  x(lon: number): number;
  y(lat: number): number;
  /** Escala en px por grado de longitud. */
  k: number;
}

/**
 * Proyección equirectangular con corrección por coseno de la latitud, ajustada
 * a una caja. Suficiente y honesta para extensiones pequeñas: no es un sistema
 * cartográfico, es un encuadre.
 */
export function ajustar(
  pts: readonly LonLat[], w: number, h: number, pad = 24, minSpan = 0.004,
): Proyeccion {
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  let lon0 = Math.min(...lons), lon1 = Math.max(...lons);
  let lat0 = Math.min(...lats), lat1 = Math.max(...lats);

  const latMed = (lat0 + lat1) / 2;
  const cos = Math.max(0.2, Math.cos((latMed * Math.PI) / 180));

  if (lon1 - lon0 < minSpan) { const c = (lon0 + lon1) / 2; lon0 = c - minSpan / 2; lon1 = c + minSpan / 2; }
  if (lat1 - lat0 < minSpan) { const c = (lat0 + lat1) / 2; lat0 = c - minSpan / 2; lat1 = c + minSpan / 2; }

  const anchoGeo = (lon1 - lon0) * cos;
  const altoGeo = lat1 - lat0;
  const k = Math.min((w - 2 * pad) / anchoGeo, (h - 2 * pad) / altoGeo);

  const offX = (w - anchoGeo * k) / 2;
  const offY = (h - altoGeo * k) / 2;

  return {
    k,
    x: (lon) => offX + (lon - lon0) * cos * k,
    y: (lat) => h - offY - (lat - lat0) * k,
  };
}

export function anilloAPath(anillo: readonly LonLat[], p: Proyeccion): string {
  if (!anillo.length) return '';
  return anillo
    .map((pt, i) => `${i ? 'L' : 'M'}${p.x(pt[0]).toFixed(1)} ${p.y(pt[1]).toFixed(1)}`)
    .join('') + 'Z';
}

/** Expande un anillo desde su centroide, para que una envolvente no quede pegada a los puntos. */
export function inflar(anillo: readonly LonLat[], factor = 1.18): LonLat[] {
  if (anillo.length < 3) return anillo.slice();
  const cx = anillo.reduce((a, p) => a + p[0], 0) / anillo.length;
  const cy = anillo.reduce((a, p) => a + p[1], 0) / anillo.length;
  return anillo.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor] as LonLat);
}

/** Suaviza un anillo con una curva cerrada de Catmull-Rom convertida a Bézier. */
export function anilloSuave(anillo: readonly LonLat[], p: Proyeccion, tension = 0.4): string {
  const n = anillo.length;
  if (n < 3) return anilloAPath(anillo, p);
  const pts = anillo.map((q) => [p.x(q[0]), p.y(q[1])] as [number, number]);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)},${c2x.toFixed(1)} ${c2y.toFixed(1)},${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

/** Área en hectáreas de un anillo lon/lat, por la fórmula del cordón. */
export function areaHa(anillo: readonly LonLat[]): number {
  if (anillo.length < 3) return 0;
  const latMed = anillo.reduce((a, p) => a + p[1], 0) / anillo.length;
  const mPorGradoLat = 110_574;
  const mPorGradoLon = 111_320 * Math.cos((latMed * Math.PI) / 180);
  let s = 0;
  for (let i = 0; i < anillo.length; i++) {
    const [x1, y1] = anillo[i];
    const [x2, y2] = anillo[(i + 1) % anillo.length];
    s += (x1 * mPorGradoLon) * (y2 * mPorGradoLat) - (x2 * mPorGradoLon) * (y1 * mPorGradoLat);
  }
  return Math.abs(s / 2) / 10_000;
}

/** Área encerrada por un anillo, en grados cuadrados (fórmula del cordón). */
export function areaDeg2(anillo: readonly LonLat[]): number {
  if (anillo.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < anillo.length; i++) {
    const [x1, y1] = anillo[i];
    const [x2, y2] = anillo[(i + 1) % anillo.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}
