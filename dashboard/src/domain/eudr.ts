/**
 * Expediente de diligencia debida por lote.
 *
 * El EUDR no exige separar físicamente el café de cada finca: exige poder
 * declarar el conjunto de predios que aportaron. El lote de acopio es, por
 * tanto, un conjunto con nombres.
 */
import { DECIMALES_EUDR, HA_UMBRAL_POLIGONO } from './constants';

export type EstadoCampo = 'ok' | 'pendiente' | 'alerta';

export interface Predio {
  id: string;
  caficultor: string;
  finca: string;
  hectareas: number;
  lat: number;
  lon: number;
  /** Hay polígono disponible (normalmente heredado del SICA). */
  poligono: boolean;
  /** El punto fue capturado con acompañamiento y contrastado con SICA. */
  puntoVerificado: boolean;
  /** Era bosque el 31 de diciembre de 2020 según el mapa del JRC. */
  bosque2020: boolean;
  /** Alertas de pérdida de cobertura posteriores al corte, dentro del disco. */
  alertasPost2020: number;
  /** Soporte de la relación con el predio. */
  tenencia: 'titulo' | 'declaracion' | 'pendiente';
  consentimiento: boolean;
  /** Rendimiento histórico declarado, cargas por año. */
  cargasAnuales: number;
}

export interface Entrega {
  predioId: string;
  kg: number;
  humedad: number;
  factor: number;
  fecha: string;
  sacoId: string;
}

export interface ChequePredio {
  campo: string;
  estado: EstadoCampo;
  detalle: string;
}

/**
 * Radio del disco a analizar alrededor del punto, en metros.
 * Un punto intersecta un píxel de 10 m: para un predio de 1,4 ha eso es
 * 100 m² de 14.000. Se compensa analizando el área declarada como un disco.
 */
export function radioAnalisis(hectareas: number): number {
  return Math.sqrt((hectareas * 10_000) / Math.PI);
}

export function requierePoligono(hectareas: number): boolean {
  return hectareas > HA_UMBRAL_POLIGONO;
}

export function formatoCoordenada(valor: number): string {
  return valor.toFixed(DECIMALES_EUDR);
}

export function evaluarPredio(p: Predio): ChequePredio[] {
  const radio = radioAnalisis(p.hectareas);
  const necesitaPoligono = requierePoligono(p.hectareas);

  return [
    {
      campo: 'Geolocalización',
      estado: p.puntoVerificado ? 'ok' : 'pendiente',
      detalle: p.puntoVerificado
        ? `${formatoCoordenada(p.lat)}, ${formatoCoordenada(p.lon)} · verificado en campo`
        : 'Punto sin verificación presencial',
    },
    {
      campo: necesitaPoligono ? 'Polígono (obligatorio sobre 4 ha)' : 'Polígono (opcional bajo 4 ha)',
      estado: necesitaPoligono && !p.poligono ? 'alerta' : 'ok',
      detalle: p.poligono
        ? 'Disponible desde SICA'
        : necesitaPoligono
          ? `${p.hectareas} ha: el reglamento exige perímetro`
          : `${p.hectareas} ha: basta un punto con ${DECIMALES_EUDR} decimales`,
    },
    {
      campo: 'Cobertura forestal a dic-2020',
      estado: p.bosque2020 ? 'alerta' : 'ok',
      detalle: p.bosque2020
        ? 'El mapa del JRC marca bosque en 2020 · requiere revisión humana'
        : `Sin bosque en el disco de ${radio.toFixed(0)} m según JRC GFC2020 v4`,
    },
    {
      campo: 'Alertas posteriores al corte',
      estado: p.alertasPost2020 === 0 ? 'ok' : 'alerta',
      detalle: p.alertasPost2020 === 0
        ? 'Sin alertas integradas GFW desde 2021'
        : `${p.alertasPost2020} alerta(s) dentro del disco · revisar`,
    },
    {
      campo: 'Legalidad de la tenencia',
      estado: p.tenencia === 'titulo' ? 'ok' : p.tenencia === 'declaracion' ? 'pendiente' : 'alerta',
      detalle: p.tenencia === 'titulo'
        ? 'Título formal aportado'
        : p.tenencia === 'declaracion'
          ? 'Declaración respaldada por la cooperativa'
          : 'Sin soporte de relación con el predio',
    },
    {
      campo: 'Consentimiento de datos',
      estado: p.consentimiento ? 'ok' : 'alerta',
      detalle: p.consentimiento
        ? 'Autorización vigente por propósito, revocable'
        : 'Falta autorización Ley 1581',
    },
  ];
}

export interface ResumenLote {
  kgTotal: number;
  predios: number;
  listos: number;
  conAlerta: number;
  /** 0–100. */
  completitud: number;
  /** Supera el techo de producción plausible. */
  excedeTecho: boolean;
}

export function resumirLote(
  predios: ReadonlyMap<string, Predio>,
  entregas: readonly Entrega[],
): ResumenLote {
  const kgTotal = entregas.reduce((a, e) => a + e.kg, 0);
  const ids = new Set(entregas.map((e) => e.predioId));
  let listos = 0;
  let conAlerta = 0;
  let chequesOk = 0;
  let chequesTotal = 0;
  let excedeTecho = false;

  for (const id of ids) {
    const p = predios.get(id);
    if (!p) continue;
    const cheques = evaluarPredio(p);
    chequesTotal += cheques.length;
    chequesOk += cheques.filter((c) => c.estado === 'ok').length;
    const alerta = cheques.some((c) => c.estado === 'alerta');
    if (alerta) conAlerta++;
    else listos++;

    const kgPredio = entregas.filter((e) => e.predioId === id).reduce((a, e) => a + e.kg, 0);
    if (kgPredio > p.cargasAnuales * 125 * 1.3) excedeTecho = true;
  }

  return {
    kgTotal,
    predios: ids.size,
    listos,
    conAlerta,
    completitud: chequesTotal === 0 ? 0 : Math.round((chequesOk / chequesTotal) * 100),
    excedeTecho,
  };
}

/** GeoJSON tal como lo acepta el Sistema de Información del EUDR. */
export function construirGeoJSON(
  predios: ReadonlyMap<string, Predio>,
  entregas: readonly Entrega[],
): string {
  const ids = [...new Set(entregas.map((e) => e.predioId))];
  const features = ids.map((id) => {
    const p = predios.get(id)!;
    const kg = entregas.filter((e) => e.predioId === id).reduce((a, e) => a + e.kg, 0);
    return {
      type: 'Feature',
      properties: {
        ProducerName: p.caficultor,
        ProducerCountry: 'CO',
        ProductionPlace: p.finca,
        Area: Number(p.hectareas.toFixed(2)),
        QuantityKg: Number(kg.toFixed(1)),
      },
      geometry: {
        type: 'Point',
        coordinates: [Number(p.lon.toFixed(6)), Number(p.lat.toFixed(6))],
      },
    };
  });
  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
}
