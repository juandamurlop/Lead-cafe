import { Store } from './lib/store';
import type { Aire } from './domain/psychro';
import type { EstadoExpediente } from './data/tipos';

export type Vista = 'panorama' | 'cadena' | 'expediente' | 'secado' | 'bodega' | 'acopio';
export type Red = 0 | 1 | 2 | 3;

export interface Toast { id: number; texto: string; tono: 'ok' | 'warn' | 'bad' }

/** Una entrega simulada en la ventanilla, derivada de la base real. */
export interface EntregaViva {
  loteId: string;
  fincaId: string;
  nombre: string;
  finca: string;
  kg: number;
  humedad: number;
  hectareas: number;
  trazado: boolean;
  sacoId: string;
}

export interface Estado {
  vista: Vista;
  red: Red;
  cargando: boolean;
  error: string | null;

  // instrumento de secado
  loteLavadoKg: number;
  muestraG: number;

  // instrumento de bodega
  dentro: Aire;
  fuera: Aire;
  cargasBodega: number;

  // ventanilla del acopio
  entregas: EntregaViva[];
  rechazadas: number;
  segViejo: number;
  segNuevo: number;
  loteCerrado: boolean;
  cursorEntrega: number;
  premioPorCarga: number;

  // navegación de datos
  zonaSel: string | null;
  zonaHover: string | null;
  acopioSel: string | null;
  fincaSel: string | null;
  nodoSel: string | null;
  loteSel: string | null;
  filtroEstado: EstadoExpediente | 'TODOS';
  filtroTexto: string;

  toasts: Toast[];
}

export const RED_TEXTO: Record<Red, { nombre: string; detalle: string }> = {
  0: { nombre: 'Sin señal', detalle: 'Puede seguir registrando sin conexión.' },
  1: { nombre: 'Una raya', detalle: 'Hay voz y SMS: cada lote sale en un mensaje de 160 caracteres.' },
  2: { nombre: '2G intermitente', detalle: 'Escenario de envío de la cola en un solo viaje de ida y vuelta.' },
  3: { nombre: 'WiFi del acopio', detalle: 'Escenario para enviar fotos y audios y tramitar pagos.' },
};

export const store = new Store<Estado>({
  vista: 'panorama',
  red: 0,
  cargando: true,
  error: null,

  loteLavadoKg: 100,
  muestraG: 131,

  dentro: { t: 24, rh: 78 },
  fuera: { t: 27, rh: 55 },
  cargasBodega: 150,

  entregas: [],
  rechazadas: 0,
  segViejo: 0,
  segNuevo: 0,
  loteCerrado: false,
  cursorEntrega: 0,
  premioPorCarga: 60_000,

  zonaSel: null,
  zonaHover: null,
  acopioSel: null,
  fincaSel: null,
  nodoSel: null,
  loteSel: null,
  filtroEstado: 'TODOS',
  filtroTexto: '',

  toasts: [],
});

let toastId = 0;
export function toast(texto: string, tono: Toast['tono'] = 'ok'): void {
  const id = ++toastId;
  store.set((s) => ({ toasts: [...s.toasts, { id, texto, tono }] }));
  setTimeout(() => {
    store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, 4200);
}
