/**
 * Liquidación de una entrega en el acopio.
 *
 * El precio base es el precio interno de referencia de la FNC por carga de
 * 125 kg al factor de rendimiento 94. Un factor distinto cambia cuánto
 * excelso sale de la misma carga, así que el valor escala con 94/FR.
 *
 * El descuento por humedad es una REGLA ILUSTRATIVA: cada cooperativa aplica
 * la suya. Se expone aquí para que sea discutible, no para fingir que es
 * oficial.
 */
import {
  FR_REFERENCIA, H_MAX, KG_POR_CARGA, PRECIO_CARGA_FR94,
} from './constants';

export interface EntradaLiquidacion {
  kg: number;
  /** Factor de rendimiento medido en el análisis. */
  factor: number;
  /** Humedad en base húmeda, 0–1. */
  humedad: number;
  /** Premio por trazabilidad verificada, en COP por carga. */
  premioPorCarga: number;
  trazado: boolean;
}

export interface LineaLiquidacion {
  concepto: string;
  valor: number;
  /** Las líneas destacadas se muestran con énfasis. */
  destacar?: boolean;
  nota?: string;
}

export interface Liquidacion {
  lineas: LineaLiquidacion[];
  total: number;
  rechazado: boolean;
  motivoRechazo?: string;
  /** COP por kilo efectivamente pagados. */
  porKg: number;
}

/** Precio por carga ajustado por factor de rendimiento. */
export function precioPorCarga(factor: number): number {
  return PRECIO_CARGA_FR94 * (FR_REFERENCIA / factor);
}

/** Fracción de descuento por humedad fuera de rango. Regla ilustrativa. */
export function descuentoHumedad(humedad: number): number {
  const pct = humedad * 100;
  if (pct <= H_MAX * 100) return 0;
  if (pct > 14) return 1;
  return Math.min(0.9, (pct - H_MAX * 100) * 0.015);
}

export function liquidar(e: EntradaLiquidacion): Liquidacion {
  const cargas = e.kg / KG_POR_CARGA;
  const base = cargas * precioPorCarga(FR_REFERENCIA);
  const ajusteFactor = cargas * (precioPorCarga(e.factor) - precioPorCarga(FR_REFERENCIA));
  const subtotal = base + ajusteFactor;

  const fraccion = descuentoHumedad(e.humedad);
  if (fraccion >= 1) {
    return {
      lineas: [],
      total: 0,
      rechazado: true,
      motivoRechazo: `Humedad de ${(e.humedad * 100).toFixed(1)} %: por encima de 14 % no se recibe.`,
      porKg: 0,
    };
  }

  const descuento = -subtotal * fraccion;
  const premio = e.trazado ? cargas * e.premioPorCarga : 0;
  const total = subtotal + descuento + premio;

  const lineas: LineaLiquidacion[] = [
    {
      concepto: `Precio base · ${cargas.toFixed(2)} cargas a FR ${FR_REFERENCIA}`,
      valor: base,
    },
    {
      concepto: `Ajuste por factor de rendimiento ${e.factor.toFixed(0)}`,
      valor: ajusteFactor,
      nota: e.factor < FR_REFERENCIA ? 'Mejor que la referencia' : e.factor > FR_REFERENCIA ? 'Peor que la referencia' : 'En la referencia',
    },
  ];

  if (fraccion > 0) {
    lineas.push({
      concepto: `Descuento por humedad ${(e.humedad * 100).toFixed(1)} %`,
      valor: descuento,
      nota: 'Regla ilustrativa de la cooperativa',
    });
  }

  lineas.push({
    concepto: e.trazado ? 'Premio por trazabilidad verificada' : 'Premio por trazabilidad (no aplica)',
    valor: premio,
    destacar: true,
    nota: e.trazado
      ? 'Línea separada y auditable: así se verifica que llegó al caficultor'
      : 'Sin finca verificada no hay premio',
  });

  return { lineas, total, rechazado: false, porKg: total / e.kg };
}
