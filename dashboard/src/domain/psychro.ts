/**
 * Psicrometría para la bodega de acopio.
 *
 * El café es higroscópico: en el equilibrio, su actividad de agua iguala la
 * humedad relativa del aire dividida entre 100. Cenicafé recomienda mantener
 * el aire entre 60 % y 70 % de humedad relativa para almacenamiento seguro de
 * pergamino seco, y señala que por encima de 0,70 de actividad de agua el
 * grano deja de ser estable.
 */
import {
  AW_INTERCEPTO, AW_PENDIENTE, AW_LIMITE,
  RH_SEGURA_MAX, RH_SEGURA_MIN,
} from './constants';

export interface Aire {
  /** Temperatura en °C. */
  t: number;
  /** Humedad relativa en %. */
  rh: number;
}

export type BandaRiesgo = 'seca' | 'segura' | 'alta' | 'critica';

export interface DiagnosticoBodega {
  dentro: Aire;
  fuera: Aire;
  /** Gramos de agua por metro cúbico. */
  absDentro: number;
  absFuera: number;
  /** Punto de rocío interior, °C. */
  rocioDentro: number;
  ventilar: boolean;
  /**
   * Verdadero cuando ventilar sería un error pese a que afuera marca menos
   * humedad relativa que adentro. Es el caso contraintuitivo.
   */
  trampa: boolean;
  banda: BandaRiesgo;
  /** Actividad de agua hacia la que tiende el grano. */
  awEquilibrio: number;
  /** Humedad de equilibrio estimada, en %. */
  humedadEquilibrio: number;
}

/** Presión de vapor de saturación por la ecuación de Magnus, en hPa. */
export function presionVaporSat(t: number): number {
  return 6.112 * Math.exp((17.67 * t) / (t + 243.5));
}

/** Humedad absoluta en g/m³. */
export function humedadAbsoluta({ t, rh }: Aire): number {
  const e = (rh / 100) * presionVaporSat(t);
  return (216.7 * e) / (t + 273.15);
}

/** Punto de rocío en °C. */
export function puntoRocio({ t, rh }: Aire): number {
  const a = 17.67;
  const b = 243.5;
  const alpha = Math.log(Math.max(rh, 1) / 100) + (a * t) / (b + t);
  return (b * alpha) / (a - alpha);
}

/** Humedad de equilibrio del grano a partir de la actividad de agua. */
export function humedadEquilibrio(aw: number): number {
  const h = (aw - AW_INTERCEPTO) / AW_PENDIENTE;
  return Math.min(22, Math.max(3, h));
}

export function bandaRiesgo(rh: number): BandaRiesgo {
  if (rh < RH_SEGURA_MIN) return 'seca';
  if (rh <= RH_SEGURA_MAX) return 'segura';
  if (rh <= 75) return 'alta';
  return 'critica';
}

/** Margen mínimo de humedad absoluta para que valga la pena abrir (g/m³). */
const MARGEN_VENTILACION = 0.3;

export function diagnosticar(dentro: Aire, fuera: Aire): DiagnosticoBodega {
  const absDentro = humedadAbsoluta(dentro);
  const absFuera = humedadAbsoluta(fuera);
  const ventilar = absFuera < absDentro - MARGEN_VENTILACION;
  const aw = dentro.rh / 100;

  return {
    dentro,
    fuera,
    absDentro,
    absFuera,
    rocioDentro: puntoRocio(dentro),
    ventilar,
    trampa: !ventilar && fuera.rh < dentro.rh,
    banda: bandaRiesgo(dentro.rh),
    awEquilibrio: aw,
    humedadEquilibrio: humedadEquilibrio(aw),
  };
}

/** Texto corto de consecuencia por banda. */
export const EXPLICACION_BANDA: Record<BandaRiesgo, string> = {
  seca: 'El café baja del 10 % y pierde peso que el acopio ya pagó.',
  segura: 'Rango recomendado por Cenicafé. El grano se mantiene estable.',
  alta: 'El grano sube sobre 12 %. El deterioro de taza arranca y no se ve por fuera.',
  critica: 'Riesgo de moho y ocratoxina. Hay que despachar o resecar los lotes más húmedos.',
};

/** ¿Supera el umbral de estabilidad? */
export function inestable(aw: number): boolean {
  return aw > AW_LIMITE;
}

/**
 * Variación diaria simulada de un sitio de ladera, para dibujar las 24 horas
 * que el nodo habría registrado. Determinista.
 */
export function cicloDiario(base: Aire, horas = 24): Array<Aire & { hora: number }> {
  const out: Array<Aire & { hora: number }> = [];
  for (let h = 0; h < horas; h++) {
    const fase = ((h - 15) / 24) * 2 * Math.PI;
    const t = base.t + 4.5 * Math.cos(fase);
    const rh = Math.min(99, Math.max(25, base.rh - 11 * Math.cos(fase)));
    out.push({ hora: h, t, rh });
  }
  return out;
}
