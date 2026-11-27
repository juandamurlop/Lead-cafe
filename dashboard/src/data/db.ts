/**
 * Capa de acceso a datos. Carga la base una sola vez y construye los índices
 * que el tablero consulta. Es el equivalente a un repositorio: las vistas no
 * tocan los arreglos crudos.
 */
import type {
  BaseCafeto, Certificacion, Cooperativa, EstadoExpediente, FilaExpediente,
  Finca, Foto, Insumo, Lote, Mensaje,
} from './tipos';

export interface Zona {
  /** Departamento. */
  nombre: string;
  fincas: Finca[];
  /** Cooperativas (centros de acopio) con presencia en la zona. */
  acopios: string[];
  kg: number;
  /** Envolvente convexa de los centroides, como polígono [lon, lat]. */
  casco: Array<[number, number]>;
  centro: [number, number];
  bloqueados: number;
  revisar: number;
  completos: number;
}

export interface Acopio extends Cooperativa {
  /** Centro geográfico de las fincas que entrega a este acopio. */
  lat: number;
  lon: number;
  fincasIds: string[];
  kg: number;
  zonas: string[];
}

export class Base {
  readonly raw: BaseCafeto;
  readonly fincaPorId = new Map<string, Finca>();
  readonly coopPorId = new Map<string, Cooperativa>();
  readonly lotesPorFinca = new Map<string, Lote[]>();
  readonly insumosPorFinca = new Map<string, Insumo[]>();
  readonly fotosPorFinca = new Map<string, Foto[]>();
  readonly certsPorFinca = new Map<string, Certificacion[]>();
  readonly mensajesPorFinca = new Map<string, Mensaje[]>();
  readonly expedientePorLote = new Map<string, FilaExpediente>();
  readonly expedientePorFinca = new Map<string, FilaExpediente[]>();
  readonly zonas: Zona[] = [];
  readonly acopios: Acopio[] = [];

  constructor(raw: BaseCafeto) {
    this.raw = raw;
    for (const f of raw.fincas) this.fincaPorId.set(f.id, f);
    for (const c of raw.cooperativas) this.coopPorId.set(c.id, c);
    agrupar(raw.lotes, (x) => x.fincaId, this.lotesPorFinca);
    agrupar(raw.insumos, (x) => x.fincaId, this.insumosPorFinca);
    agrupar(raw.fotos, (x) => x.fincaId, this.fotosPorFinca);
    agrupar(raw.certificaciones, (x) => x.fincaId, this.certsPorFinca);
    agrupar(raw.mensajes, (x) => x.fincaId, this.mensajesPorFinca);
    agrupar(raw.expediente, (x) => x.fincaId, this.expedientePorFinca);
    for (const e of raw.expediente) this.expedientePorLote.set(e.loteId, e);

    this.zonas = this.construirZonas();
    this.acopios = this.construirAcopios();
  }

  meta(): BaseCafeto['meta'] {
    return this.raw.meta;
  }

  kgDeFinca(id: string): number {
    return (this.lotesPorFinca.get(id) ?? []).reduce((a, l) => a + l.kg, 0);
  }

  /** Peor estado de expediente entre los lotes de la finca. */
  estadoFinca(id: string): EstadoExpediente {
    const filas = this.expedientePorFinca.get(id) ?? [];
    if (filas.some((f) => f.estado === 'BLOQUEADO')) return 'BLOQUEADO';
    if (filas.some((f) => f.estado === 'REVISAR')) return 'REVISAR';
    return 'COMPLETO';
  }

  motivosDeFinca(id: string): string[] {
    const set = new Set<string>();
    for (const f of this.expedientePorFinca.get(id) ?? []) {
      for (const m of f.motivos) set.add(m);
    }
    return [...set];
  }

  fincasDeAcopio(coopId: string): Finca[] {
    return this.raw.fincas.filter((f) => f.coopId === coopId);
  }

  acopiosDeZona(zona: string): Acopio[] {
    return this.acopios.filter((a) => a.zonas.includes(zona));
  }

  private construirZonas(): Zona[] {
    const porDepto = new Map<string, Finca[]>();
    for (const f of this.raw.fincas) {
      const arr = porDepto.get(f.departamento) ?? [];
      arr.push(f);
      porDepto.set(f.departamento, arr);
    }
    const out: Zona[] = [];
    for (const [nombre, fincas] of porDepto) {
      const pts = fincas.map((f) => [f.lon, f.lat] as [number, number]);
      const estados = fincas.map((f) => this.estadoFinca(f.id));
      out.push({
        nombre,
        fincas,
        acopios: [...new Set(fincas.map((f) => f.coopId))],
        kg: fincas.reduce((a, f) => a + this.kgDeFinca(f.id), 0),
        casco: cascoConvexo(pts),
        centro: [
          pts.reduce((a, p) => a + p[0], 0) / pts.length,
          pts.reduce((a, p) => a + p[1], 0) / pts.length,
        ],
        bloqueados: estados.filter((e) => e === 'BLOQUEADO').length,
        revisar: estados.filter((e) => e === 'REVISAR').length,
        completos: estados.filter((e) => e === 'COMPLETO').length,
      });
    }
    return out.sort((a, b) => b.kg - a.kg);
  }

  private construirAcopios(): Acopio[] {
    const ids = [...new Set(this.raw.fincas.map((f) => f.coopId))];
    return ids.map((id) => {
      const fincas = this.fincasDeAcopio(id);
      const coop = this.coopPorId.get(id) ?? {
        id, nombre: 'Entrega directa (sin cooperativa)',
        municipioSede: '—', nit: '—', nFincas: fincas.length,
      };
      return {
        ...coop,
        lat: fincas.reduce((a, f) => a + f.lat, 0) / fincas.length,
        lon: fincas.reduce((a, f) => a + f.lon, 0) / fincas.length,
        fincasIds: fincas.map((f) => f.id),
        kg: fincas.reduce((a, f) => a + this.kgDeFinca(f.id), 0),
        zonas: [...new Set(fincas.map((f) => f.departamento))],
      };
    }).sort((a, b) => b.kg - a.kg);
  }
}

function agrupar<T>(xs: readonly T[], clave: (x: T) => string, destino: Map<string, T[]>): void {
  for (const x of xs) {
    const k = clave(x);
    const arr = destino.get(k) ?? [];
    arr.push(x);
    destino.set(k, arr);
  }
}

/** Envolvente convexa (monotone chain). Devuelve el anillo cerrado. */
export function cascoConvexo(pts: Array<[number, number]>): Array<[number, number]> {
  if (pts.length < 3) return pts.slice();
  const p = [...pts].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const cruz = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const baja: Array<[number, number]> = [];
  for (const q of p) {
    while (baja.length >= 2 && cruz(baja[baja.length - 2], baja[baja.length - 1], q) <= 0) baja.pop();
    baja.push(q);
  }
  const alta: Array<[number, number]> = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (alta.length >= 2 && cruz(alta[alta.length - 2], alta[alta.length - 1], q) <= 0) alta.pop();
    alta.push(q);
  }
  baja.pop(); alta.pop();
  return baja.concat(alta);
}

let cache: Base | null = null;

export async function cargarBase(url = 'data/cafeto.json'): Promise<Base> {
  if (cache) return cache;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar la base (${res.status})`);
  cache = new Base(await res.json() as BaseCafeto);
  return cache;
}

export function baseCargada(): Base | null {
  return cache;
}
