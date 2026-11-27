/** Modelo de la base de 50 fincas. Todos los datos son ficticios. */

export type SiNo = 'SI' | 'NO' | 'PENDIENTE';
export type EstadoExpediente = 'COMPLETO' | 'REVISAR' | 'BLOQUEADO';
export type ResultadoSat = 'Sin deforestación' | 'Alerta - revisar' | 'Deforestación confirmada';
export type CanalMensaje = 'voz' | 'sms' | 'app';

export interface Cooperativa {
  id: string;
  nombre: string;
  municipioSede: string;
  nit: string;
  nFincas: number;
}

export interface UsoSuelo {
  cafe: number; asociados: number; pasto: number;
  bosque: number; rastrojo: number; infra: number;
  estadoSuma: string; estadoCafe: string; fuente: string;
}

export interface VerificacionSat {
  id: string; fecha: string; fuente: string; resolucionM: number;
  perdidaHa: number; resultado: ResultadoSat; proveedor: string;
}

export interface Finca {
  id: string;
  nombre: string;
  titular: string;
  tipoId: string;
  nroId: string;
  telefono: string;
  email: string;
  departamento: string;
  municipio: string;
  vereda: string;
  coopId: string;
  areaTotalHa: number;
  areaSembradaHa: number;
  consentimiento: SiNo;
  fechaConsentimiento: string;
  alcanceConsentimiento: string;
  lat: number;
  lon: number;
  /** Anillo exterior del polígono: pares [lon, lat]. */
  anillo: Array<[number, number]>;
  nVertices: number;
  areaPoligonoHa: number;
  difAreaPct: number;
  alertaArea: string;
  uso: UsoSuelo;
  sat: VerificacionSat;
}

export interface Lote {
  id: string; fincaId: string; coopId: string; tipoCosecha: string;
  inicio: string; fin: string; entrega: string;
  kg: number; sacoIni: number; sacoFin: number; nSacos: number; kgPorSaco: number;
  rendimientoKgHa: number; beneficio: string; humedad: number;
}

export interface Insumo {
  id: string; fincaId: string; fecha: string; tipo: string; producto: string;
  ia: string; dosis: number; unidad: string; areaHa: number;
  responsable: string; estadoUE: string;
}

export interface Foto {
  id: string; fincaId: string; tipo: string; archivo: string; fecha: string;
  lat: number; lon: number; precisionM: number; hash: string; dentroBbox: SiNo;
}

export interface Certificacion {
  id: string; fincaId: string; tipo: string; entidad: string; nro: string;
  emision: string; vencimiento: string; vigente: SiNo;
}

export interface FilaExpediente {
  loteId: string; fincaId: string; coopId: string;
  poligono: SiNo; alertaArea: string; usoSuelo: string; satelital: ResultadoSat;
  fotosPredio: number; fotosBeneficio: number; fotosFuera: number;
  insumosNoUE: number; certsVigentes: number; decCoop: number;
  consentimiento: SiNo; rendimiento: number; alertaRendimiento: string;
  estado: EstadoExpediente; motivos: string[];
}

export interface Mensaje {
  id: string; fincaId: string; canal: CanalMensaje; texto: string;
  fecha: string; transporte: string; segundos: number | null; loteId: string | null;
}

export interface BaseCafeto {
  meta: { fuente: string; aviso: string; generado: string; nFincas: number; nLotes: number; kgTotal: number };
  parametros: Record<string, string | number>;
  cooperativas: Cooperativa[];
  fincas: Finca[];
  lotes: Lote[];
  insumos: Insumo[];
  fotos: Foto[];
  certificaciones: Certificacion[];
  expediente: FilaExpediente[];
  mensajes: Mensaje[];
}
