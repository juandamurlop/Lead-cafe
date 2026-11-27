import type { EntregaReportada, FuenteAcopio, PagoReportado, PruebaHorno } from './supervision';

export type Clase = 'Aceptado' | 'Retenido' | 'Rechazado' | 'Sin evaluar';
export type Destino = 'Bodega' | 'Producción' | 'Secado' | 'Producción o secado' | 'Prueba de horno' | 'Devolución' | 'Pendiente de evaluación';
export type Origen = 'Verificado' | 'Declarado' | 'Desconocido';
export type Canal = 'manual' | 'Excel' | 'WhatsApp';
export const clases: Clase[] = ['Aceptado', 'Retenido', 'Rechazado', 'Sin evaluar'];
export const destinos: Destino[] = ['Bodega', 'Producción', 'Secado', 'Producción o secado', 'Prueba de horno', 'Devolución', 'Pendiente de evaluación'];
export const origenes: Origen[] = ['Verificado', 'Declarado', 'Desconocido'];

/** Modelo frontend sujeto al acuerdo de integración con el backend. */
export interface RegistroRecepcion {
  id: string;
  productorId?: string;
  fincaId?: string;
  coopId?: string;
  metodoHumedad?: string;
  destinoConfirmado?: Destino;
  productor: string;
  finca: string;
  fecha: string;
  horaRecepcionInformada?: boolean;
  kg: number;
  humedad: number | null;
  muestra: string;
  defectos: string;
  lote: string;
  pago: number | null;
  metodo: string;
  pagado: boolean;
  estadoPagoReportado?: PagoReportado['estado'];
  destino: Destino;
  canal: Canal;
  externo?: string;
}

export interface Movimiento {
  fecha: string;
  humedad: number | null;
  clase: Clase;
  destino: Destino;
  nota: string;
}
export interface Entrega extends RegistroRecepcion {
  horno?: PruebaHorno;
  finanzas?: PagoReportado;
  fuente?: FuenteAcopio;
  estadoReporte?: EntregaReportada['estado'];
  clase: Clase;
  origen: Origen;
  historial: Movimiento[];
  ficticio: boolean;
  sincronizacion: 'Guardado localmente' | 'Pendiente de sincronización' | 'Sincronizado';
  celdas?: Record<string, string | number | boolean>;
}
export interface Consolidado {
  id: string;
  lote: string;
  fecha: string;
  origen: Origen;
  entregas: string[];
  ficticio: boolean;
  celdas?: Entrega['celdas'];
  aportesExcel?: Record<string, NonNullable<Entrega['celdas']>>;
}
export interface Medicion {
  id: string;
  coopId?: string;
  fecha: string;
  temperatura: number;
  humedad: number;
  temperaturaExterior?: number;
  humedadExterior?: number;
  observaciones?: string;
  zona: string;
  responsable: string;
  accion: string;
  alerta: string;
  ficticio: boolean;
  celdas?: Entrega['celdas'];
}
export const hojas = ['Recepción', 'Consolidación', 'Bodega'] as const;
export interface Operacion {
  entregas: Entrega[];
  consolidados: Consolidado[];
  mediciones: Medicion[];
  rangos: { min: number; max: number };
  encabezados: Partial<Record<typeof hojas[number], string[]>>;
  demoCargada: boolean | string;
}
const clave = 'cafeto-operacion-v1';
const inicial: Operacion = {
  entregas: [], consolidados: [], mediciones: [],
  rangos: { min: 10, max: 12 }, encabezados: {}, demoCargada: false,
};
export const leer = (): Operacion => {
  const guardado = localStorage.getItem(clave);
  return guardado ? JSON.parse(guardado) : structuredClone(inicial);
};
export function guardar(cambio: (actual: Operacion) => void): void {
  const actual = leer();
  cambio(actual);
  localStorage.setItem(clave, JSON.stringify(actual));
}
export const idNuevo = (): string => crypto.randomUUID();
export const ahora = () => new Date().toISOString();
export const normalizar = (valor: string) => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function recomendar(humedad: number | null, muestra: string, defectos: string, rangos: Operacion['rangos']): [Clase, Destino] {
  if (/rechaz|daño confirmado|moho confirmado|no apt[oa]/.test(`${muestra} ${defectos}`.toLowerCase())) return ['Rechazado', 'Devolución'];
  if (humedad === null) return ['Sin evaluar', 'Pendiente de evaluación'];
  if (humedad > rangos.max) return ['Retenido', 'Producción o secado'];
  if (humedad < rangos.min) return ['Retenido', 'Prueba de horno'];
  const limpio = /^(ninguno|ninguna|sin defectos|no|0|0[.,]0+\s*%?)$/;
  const resultado = normalizar(muestra);
  if ((defectos.trim() && !limpio.test(normalizar(defectos))) || /pendiente|dudoso|revisar|no conforme/.test(resultado)) {
    return ['Retenido', 'Prueba de horno'];
  }
  return ['Aceptado', 'Bodega'];
}
export function registrar(datos: RegistroRecepcion, clase: Clase, origen: Origen, ficticio = false): Entrega {
  return {
    ...datos, clase, origen, ficticio,
    historial: [{ fecha: ahora(), humedad: datos.humedad, clase, destino: datos.destino, nota: 'Recepción' }],
    sincronizacion: 'Guardado localmente',
  };
}
export function consolidar(actual: Operacion, ids: string[], lote: string, fecha = ahora(), id = idNuevo()): Consolidado {
  const nombre = lote.trim();
  if (!nombre || actual.consolidados.some((c) => normalizar(c.lote) === normalizar(nombre)) ||
    actual.entregas.some((e) => normalizar(e.lote) === normalizar(nombre))) throw new Error('Usa un número de lote consolidado único.');
  const seleccion = [...new Set(ids)].map((i) => actual.entregas.find((e) => e.id === i));
  const primera = seleccion[0];
  if (seleccion.length < 2 || !primera || seleccion.some((e) => !e || e.clase !== 'Aceptado' ||
    e.destino !== 'Bodega' || e.origen !== primera.origen || e.ficticio !== primera.ficticio ||
    actual.consolidados.some((c) => c.entregas.includes(e.id)))) {
    throw new Error('Selecciona al menos dos entregas aceptadas para bodega, con el mismo estado de origen y tipo de datos, sin consolidar.');
  }
  const registro = { id, lote: nombre, fecha, origen: primera.origen, entregas: [...new Set(ids)], ficticio: primera.ficticio };
  actual.consolidados.push(registro);
  const nota = `Consolidación en ${nombre}`;
  for (const e of seleccion) {
    if (e && !e.historial.some((m) => m.fecha === fecha && m.nota === nota)) {
      e.historial.push({ fecha, humedad: e.humedad, clase: e.clase, destino: e.destino, nota });
    }
  }
  return registro;
}
export const fechaCO = (fecha: string) => new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota',
}).format(new Date(fecha));
export const fechaLocal = (fecha = ahora()) => new Date(new Date(fecha).getTime() - 5 * 3600000).toISOString().slice(0, 16);
