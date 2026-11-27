import type { Base } from './db';
import { normalizar, destinos } from './operacion';
import type { Clase, Destino, Entrega, Medicion, Origen } from './operacion';

export interface FuenteAcopio {
  canal: 'Excel' | 'WhatsApp' | 'simulación';
  externo?: string;
  ficticio?: boolean;
  confirmadoEn?: string;
}
export interface IdentificacionProductor {
  nroId: string;
  fincaId: string;
  coopId?: string;
}
export interface MedicionCafe {
  porcentaje: number | null;
  metodo?: string;
  fecha?: string;
  fuente?: FuenteAcopio;
}
export interface ResultadoCalidad {
  muestra?: string;
  defectos?: string;
  clasificacionConfirmada?: Clase;
  destinoConfirmado?: Destino;
  fuente?: FuenteAcopio;
}
export const estadosHorno = ['Pendiente de medición', 'Pendiente de prueba de horno', 'Prueba en proceso', 'Prueba finalizada', 'Pendiente de evaluación', 'Evaluado'] as const;
export type EstadoHorno = typeof estadosHorno[number];
export interface PruebaHorno {
  entregaId: string;
  lote: string;
  estado: EstadoHorno;
  muestraId?: string;
  inicial?: { gramos: number; muestraId: string; neto: boolean };
  final?: { gramos: number; muestraId: string; neto: boolean };
  inicio?: string;
  fin?: string;
  temperatura?: number;
  duracionMin?: number;
  defectos?: string;
  observaciones?: string;
  destinoConfirmado?: Destino;
  fuente?: FuenteAcopio;
}
export const estadosPago = ['Pagado', 'Pendiente', 'Parcial', 'Sin información'] as const;
export type EstadoPago = typeof estadosPago[number];
export interface PagoReportado {
  entregaId: string;
  compra: number | null;
  pagado: number | null;
  metodo: 'Efectivo' | 'Transferencia' | 'Otro' | 'Sin información';
  estado: EstadoPago;
  fecha?: string;
  descuentos: number | null;
  premio: number | null;
  fuente?: FuenteAcopio;
}
export interface EntregaReportada {
  id: string;
  productor: IdentificacionProductor;
  fecha: string;
  kg: number;
  lote: string;
  medicion: MedicionCafe;
  calidad: ResultadoCalidad;
  fuente: FuenteAcopio;
  estado: 'Información recibida' | 'Información incompleta' | 'Pendiente de confirmación' | 'Pendiente de sincronización' | 'Confirmado por el servidor';
}
export interface ConsolidacionReportada {
  id: string;
  lote: string;
  fecha: string;
  aportes: { entregaId: string; fincaId: string; kg: number }[];
  calidad: Clase;
  verificacionAmbiental: Origen;
  fuente: FuenteAcopio;
}
export interface BodegaReportada extends Medicion { fuente?: FuenteAcopio }

export const registroVisible = (id: string) => !/^(?:demo-ac-|demo-bod-|demo-con-)/.test(id);
export const fincaIdDe = (e: Entrega) => e.fincaId ?? String(e.celdas?.fincaId ?? '');
export function perteneceAcopio(e: Entrega, base: Base, coopId: string): boolean {
  const declarado = e.coopId || String(e.celdas?.coopId ?? '');
  const finca = base.fincaPorId.get(fincaIdDe(e));
  if (declarado) return declarado === coopId && (!finca || finca.coopId === coopId);
  return identificar(e, base)?.coopId === coopId;
}
export const formatoHumedad = (n: number | null | undefined) => n == null ? '—' : `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(n)} %`;

export function identificar(e: Entrega, base: Base) {
  const fincaId = e.fincaId || String(e.celdas?.fincaId ?? '');
  const coopId = e.coopId || String(e.celdas?.coopId ?? '');
  const finca = base.fincaPorId.get(fincaId);
  return finca && finca.nroId === e.productorId && (!coopId || finca.coopId === coopId) &&
    (!e.ficticio || finca.coopId === 'COOP-03') ? finca : undefined;
}

export function calcularHorno(p: PruebaHorno) {
  const i = p.inicial, f = p.final;
  if (!i || !f || !i.neto || !f.neto || !i.muestraId || i.muestraId !== f.muestraId ||
    (p.muestraId && p.muestraId !== i.muestraId) || !Number.isFinite(i.gramos) || !Number.isFinite(f.gramos) ||
    i.gramos <= 0 || f.gramos <= 0 || f.gramos > i.gramos) return null;
  const perdida = i.gramos - f.gramos;
  return { perdida, humedad: perdida / i.gramos * 100 };
}
export function pruebaDe(e: Entrega): PruebaHorno | undefined {
  if (e.horno) return e.horno;
  if (e.destino === 'Prueba de horno') {
    if (e.ficticio && e.id === 'ENT-010') return {
      entregaId: e.id, lote: e.lote, estado: 'Prueba finalizada', muestraId: 'ENT-010-M1',
      inicial: { gramos: 25, muestraId: 'ENT-010-M1', neto: true },
      final: { gramos: 21.5, muestraId: 'ENT-010-M1', neto: true },
      inicio: new Date(Date.parse(e.fecha) + 9 * 3600000).toISOString(),
      fin: new Date(Date.parse(e.fecha) + 13 * 3600000).toISOString(),
      observaciones: 'Requiere evaluación.',
      fuente: { canal: 'simulación', ficticio: true },
    };
    return { entregaId: e.id, lote: e.lote, estado: 'Pendiente de prueba de horno', fuente: { canal: 'Excel', ficticio: e.ficticio } };
  }
  if (e.humedad === null) return { entregaId: e.id, lote: e.lote, estado: 'Pendiente de medición' };
}
export function diagnosticoCalidad(e: Entrega, min: number, max: number) {
  const p = pruebaDe(e);
  const humedad = (p && calcularHorno(p)?.humedad) ?? e.humedad;
  const muestra = normalizar(`${e.muestra} ${e.defectos} ${p?.defectos ?? ''}`);
  if (e.clase === 'Rechazado') return { etiqueta: 'Rechazo confirmado', tono: 'bad', destino: 'Devolución' } as const;
  if (/moho|contamina|dano confirmado|olor anormal/.test(muestra)) return { etiqueta: 'Revisión de calidad', tono: 'warn', destino: 'Pendiente de evaluación' } as const;
  if (humedad === null) return { etiqueta: 'Medición pendiente', tono: 'neutro', destino: 'Pendiente de evaluación' } as const;
  if (humedad > max) return { etiqueta: 'Retener por humedad', tono: 'warn', destino: 'Secado' } as const;
  if (humedad < min) return { etiqueta: 'Posible sobresecado', tono: 'warn', destino: 'Prueba de horno' } as const;
  if (!muestra.trim() || /pendiente/.test(muestra)) return { etiqueta: 'Muestra pendiente', tono: 'neutro', destino: 'Pendiente de evaluación' } as const;
  if (/^(?:conforme|sin defectos(?: relevantes)?|ninguno|ninguna)[. ]*$/.test(muestra.trim())) return { etiqueta: 'Candidato a aceptación', tono: 'ok', destino: 'Bodega' } as const;
  return { etiqueta: 'Revisar defectos', tono: 'warn', destino: 'Pendiente de evaluación' } as const;
}
export const destinoConfirmado = (e: Entrega): string => {
  const previo = String(e.celdas?.Destino ?? '');
  const declarado = normalizar(previo) === 'pendiente' ? 'Pendiente de evaluación' : destinos.find((d) => normalizar(d) === normalizar(previo));
  const d = e.horno?.destinoConfirmado ?? e.destinoConfirmado ?? declarado;
  return d && destinos.includes(d) ? d : 'Sin confirmar';
};
export function pagoDe(e: Entrega): PagoReportado {
  if (e.finanzas) {
    const p = e.finanzas;
    return { ...p, pagado: p.estado === 'Pagado' || p.estado === 'Parcial' ? p.pagado : null };
  }
  const metodo = normalizar(e.metodo);
  const anterior = Object.entries(e.celdas ?? {}).find(([k]) => ['estado del pago', 'estado pago'].includes(normalizar(k)))?.[1];
  const estado = e.estadoPagoReportado ?? estadosPago.find((s) => normalizar(s) === normalizar(String(anterior ?? ''))) ??
    (metodo === 'pendiente' ? 'Pendiente' : 'Sin información');
  return {
    entregaId: e.id, compra: null, pagado: estado === 'Pagado' || estado === 'Parcial' ? e.pago : null,
    metodo: metodo === 'efectivo' ? 'Efectivo' : metodo === 'transferencia' ? 'Transferencia' :
      metodo && metodo !== 'pendiente' ? 'Otro' : 'Sin información',
    estado, descuentos: null, premio: null,
  };
}
export function sincronizacion(e: Entrega): EntregaReportada['estado'] | 'Guardado en este equipo' {
  if (!e.ficticio && e.fuente?.confirmadoEn && Number.isFinite(Date.parse(e.fuente.confirmadoEn))) return 'Confirmado por el servidor';
  if (e.sincronizacion === 'Pendiente de sincronización') return e.sincronizacion;
  if (e.estadoReporte && e.estadoReporte !== 'Confirmado por el servidor' &&
    (e.estadoReporte !== 'Información recibida' || (!e.ficticio && e.fuente?.canal === 'WhatsApp' && e.fuente.externo))) return e.estadoReporte;
  if (e.humedad === null || !e.productorId || !(e.fincaId || e.celdas?.fincaId)) return 'Información incompleta';
  return 'Guardado en este equipo';
}
