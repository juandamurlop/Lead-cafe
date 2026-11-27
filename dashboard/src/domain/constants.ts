/**
 * Constantes del dominio cafetero colombiano.
 * Las cifras monetarias usan el precio interno de referencia de la FNC
 * del 25 de noviembre de 2026.
 */

/** Precio total por carga de 125 kg de pergamino seco, factor de rendimiento 94 (COP). */
export const PRECIO_CARGA_FR94 = 2_180_000;

/** Kilos de café pergamino seco en una carga. */
export const KG_POR_CARGA = 125;

/** Factor de rendimiento de referencia: kg de pergamino para 70 kg de excelso. */
export const FR_REFERENCIA = 94;

/** Precio por kilo de pergamino seco al factor de referencia (COP). */
export const PRECIO_KG = PRECIO_CARGA_FR94 / KG_POR_CARGA;

// ---------------------------------------------------------------- secado

/** Muestra estándar del método Gravimet de Cenicafé (g). */
export const MUESTRA_G = 200;

/** Peso de la muestra al 11 % de humedad, según Cenicafé (g). */
export const OBJETIVO_G = 105;

/** Humedad objetivo, centro del rango comercial. */
export const H_OBJETIVO = 0.11;

/** Rango exigido para comercializar café pergamino seco en Colombia. */
export const H_MIN = 0.10;
export const H_MAX = 0.12;

/** Umbral del Codex por encima del cual se favorece la ocratoxina. */
export const H_OCRATOXINA = 0.125;

/** Materia seca contenida en la muestra estándar (g). No cambia al secar. */
export const MATERIA_SECA_G = OBJETIVO_G * (1 - H_OBJETIVO);

/** Humedad del pergamino recién lavado, deducida de la relación de Gravimet. */
export const H_LAVADO = 1 - MATERIA_SECA_G / MUESTRA_G;

// ------------------------------------------------------------- bodega

/** Rango de humedad relativa recomendado por Cenicafé para almacenamiento. */
export const RH_SEGURA_MIN = 60;
export const RH_SEGURA_MAX = 70;

/** Actividad de agua por encima de la cual el grano deja de ser estable. */
export const AW_LIMITE = 0.70;

/** Modelo lineal de Cenicafé (2024) para café excelso: aw = a + b·H(%). */
export const AW_INTERCEPTO = 0.13778;
export const AW_PENDIENTE = 0.04234;

// -------------------------------------------------------------- EUDR

/** Fecha de corte del EUDR. */
export const CORTE_EUDR = '2020-12-31';

/** Área bajo la cual basta un punto de geolocalización (ha). */
export const HA_UMBRAL_POLIGONO = 4;

/** Decimales exigidos en las coordenadas. */
export const DECIMALES_EUDR = 6;
