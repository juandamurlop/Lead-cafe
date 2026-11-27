/**
 * Método Gravimet (Cenicafé): la materia seca se conserva durante el secado,
 * así que el peso de una muestra es una medida directa de su humedad.
 *
 * Protocolo: 200 g de pergamino lavado en una canastilla que se seca junto al
 * lote. Entre 104 y 106 g, el café está entre 10 % y 12 % de humedad.
 */
import {
  H_MAX, H_MIN, H_OCRATOXINA,
  MATERIA_SECA_G, MUESTRA_G, OBJETIVO_G, PRECIO_KG,
} from './constants';

export type EstadoSecado = 'secando' | 'humedo' | 'casi' | 'listo' | 'sobreseco';

export interface LecturaSecado {
  /** Peso actual de la muestra (g). */
  muestraG: number;
  /** Humedad en base húmeda, 0–1. */
  humedad: number;
  estado: EstadoSecado;
  /** Peso del lote completo en este momento (kg). */
  loteKg: number;
  /** Peso al que debe quedar el lote para estar al 11 % (kg). */
  loteObjetivoKg: number;
  /** Materia seca del lote: constante durante todo el secado (kg). */
  materiaSecaKg: number;
  /** Días de sol transcurridos, estimados por la curva. */
  diaEstimado: number;
  /** Días de sol que faltan para llegar al objetivo. */
  diasRestantes: number;
  /**
   * Diferencia en pesos frente a parar justo en el objetivo.
   * Negativa = está regalando peso por sobresecado.
   */
  deltaCOP: number;
}

/** Humedad en base húmeda a partir del peso de la muestra. */
export function humedadDesdeMuestra(muestraG: number): number {
  if (muestraG <= MATERIA_SECA_G) return 0;
  return 1 - MATERIA_SECA_G / muestraG;
}

/** Peso que debe marcar la muestra para una humedad dada (g). */
export function muestraParaHumedad(humedad: number): number {
  return MATERIA_SECA_G / (1 - humedad);
}

/** Peso del lote completo cuando la muestra marca `muestraG` (kg). */
export function loteDesdeMuestra(loteLavadoKg: number, muestraG: number): number {
  return (loteLavadoKg * muestraG) / MUESTRA_G;
}

/**
 * Curva de secado solar. Asíntota en 96 g con constante de tiempo de 2,8 días,
 * que reproduce el rango de 5 a 12 días que reporta Cenicafé para llegar a
 * 10–12 % en patio o marquesina.
 */
const ASINTOTA_G = 96;
const TAU_DIAS = 2.8;

export function pesoEnDia(dia: number): number {
  return ASINTOTA_G + (MUESTRA_G - ASINTOTA_G) * Math.exp(-dia / TAU_DIAS);
}

export function diaDesdePeso(muestraG: number): number {
  if (muestraG >= MUESTRA_G) return 0;
  if (muestraG <= ASINTOTA_G + 0.2) return 12;
  return -TAU_DIAS * Math.log((muestraG - ASINTOTA_G) / (MUESTRA_G - ASINTOTA_G));
}

export function clasificar(humedad: number): EstadoSecado {
  if (humedad > 0.16) return 'secando';
  if (humedad > H_OCRATOXINA) return 'humedo';
  if (humedad > H_MAX) return 'casi';
  if (humedad >= H_MIN) return 'listo';
  return 'sobreseco';
}

/** Evalúa una lectura completa del secado. */
export function evaluarSecado(loteLavadoKg: number, muestraG: number): LecturaSecado {
  const humedad = humedadDesdeMuestra(muestraG);
  const loteKg = loteDesdeMuestra(loteLavadoKg, muestraG);
  const loteObjetivoKg = loteDesdeMuestra(loteLavadoKg, OBJETIVO_G);
  const diaEstimado = diaDesdePeso(muestraG);
  const diasRestantes = Math.max(0, diaDesdePeso(OBJETIVO_G) - diaEstimado);

  return {
    muestraG,
    humedad,
    estado: clasificar(humedad),
    loteKg,
    loteObjetivoKg,
    materiaSecaKg: (loteLavadoKg * MATERIA_SECA_G) / MUESTRA_G,
    diaEstimado,
    diasRestantes,
    deltaCOP: (loteKg - loteObjetivoKg) * PRECIO_KG,
  };
}

/**
 * Tabla de Cenicafé: kilos de pergamino seco que se pierden por cada 1.000 kg
 * de café lavado, según dónde se detenga el secado, tomando el 11 % como
 * referencia.
 */
export const PERDIDA_POR_TONELADA_LAVADO: ReadonlyArray<{ humedad: number; kg: number }> = [
  { humedad: 10.0, kg: 5.9 },
  { humedad: 9.5, kg: 8.8 },
  { humedad: 9.0, kg: 11.6 },
  { humedad: 8.5, kg: 14.4 },
  { humedad: 8.0, kg: 17.5 },
];

/** Puntos de la curva para graficar. */
export function curvaSecado(pasos = 49): Array<{ dia: number; peso: number }> {
  const out: Array<{ dia: number; peso: number }> = [];
  for (let i = 0; i < pasos; i++) {
    const dia = (i / (pasos - 1)) * 12;
    out.push({ dia, peso: pesoEnDia(dia) });
  }
  return out;
}
