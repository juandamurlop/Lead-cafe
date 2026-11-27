import { Workbook } from 'exceljs';
import type { CellValue } from 'exceljs';
import JSZip from 'jszip';
import { apiUrl, demoData } from '../api/config';
import { clases, destinos, hojas, origenes, guardar, leer, recomendar, registrar, consolidar, normalizar } from './operacion';
import type { Entrega, Medicion, Movimiento } from './operacion';
import type { Base } from './db';
import { calcularHorno, diagnosticoCalidad, estadosHorno, estadosPago, identificar, pagoDe, perteneceAcopio, pruebaDe, registroVisible, destinoConfirmado } from './supervision';

const recepcion = ['ID entrega', 'ID productor', 'Productor', 'Finca', 'Fecha', 'Peso (kg)', 'Humedad (%)', 'Resultado de muestra', 'Defectos', 'Número de lote', 'Pago (COP)', 'Método de pago', 'Estado del pago', 'Clasificación', 'Destino', 'Verificación del origen', 'Sincronización', 'Canal', 'ID externo', 'Datos ficticios', 'Historial', 'fincaId', 'coopId', 'Método de medición', 'Estado de procedencia', 'Destino recomendado'];
const consolidacion = ['ID consolidado', 'Número de lote', 'Fecha de consolidación', 'Productores', 'Fincas', 'Pesos aportados (kg)', 'Peso total (kg)', 'Entregas originales', 'Estado de calidad', 'Verificación del origen', 'Datos ficticios'];
const bodega = ['ID medición', 'Fecha y hora', 'Temperatura (°C)', 'Humedad ambiental (%)', 'Zona de almacenamiento', 'Responsable', 'Acción tomada', 'Alerta', 'Datos ficticios', 'Temperatura exterior (°C)', 'Humedad exterior (%)', 'Observaciones', 'coopId'];
const columnas = [recepcion, consolidacion, bodega];
const libroDemo = 'acopio-hernan-vinculado-v2';
const aliases: Record<string, string[]> = {
  Productor: ['Nombre productor', 'Nombre del productor', 'Productores aportantes'],
  Finca: ['Nombre finca', 'Nombre de la finca', 'Finca (si informa)'],
  Fecha: ['Fecha de recepción', 'Fecha recepción', 'Fecha entrega', 'Fecha de entrega'],
  'Peso (kg)': ['Peso entregado', 'Peso entregado (kg)', 'Peso recibido (kg)', 'Kg'],
  'Humedad (%)': ['Humedad', 'Humedad medida', 'Humedad medida (%)'],
  'Resultado de muestra': ['Resultados de la muestra', 'Resultado muestra', 'Resultado de la muestra', 'Muestra', 'Defectos / muestra'],
  'Número de lote': ['Lote', 'Lote ID', 'Número lote', 'Lote consolidado', 'Lote origen', 'Código de lote'],
  'ID productor': ['ID caficultor (nroId)'],
  Clasificación: ['Estado calidad'],
  Sincronización: ['Estado sincronización'],
  'Pago (COP)': ['Monto del pago', 'Monto del pago (COP)', 'Monto pagado (COP)', 'Pago', 'Valor pago (COP)'],
  'Estado del pago': ['Estado pago'],
  'Método de pago': ['Método pago', 'Forma de pago'],
  'Verificación del origen': ['Estado de verificación del origen', 'Estado del origen', 'Origen'],
  'Entregas originales': ['Entregas', 'IDs de entregas', 'Lotes de origen', 'Lotes originales'],
  'Temperatura (°C)': ['Temperatura', 'Temperatura (C)'],
  'Humedad ambiental (%)': ['Humedad ambiental', 'Humedad relativa (%)', 'Humedad (%)', 'HR (%)'],
  'Zona de almacenamiento': ['Zona'],
  'Fecha y hora': ['Fecha', 'Fecha/hora'],
};
const clave = (v: string) => normalizar(v).replace(/[^a-z0-9]/g, '');
const claves = (v: string) => [v, ...(aliases[v] ?? [])].map(clave);
function valor(v: CellValue): string | number | boolean {
  if (v instanceof Date) return v.toISOString().slice(0, 19);
  if (v && typeof v === 'object') {
    if ('result' in v) return valor(v.result);
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
    return '';
  }
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : '';
}
function numero(v: ReturnType<typeof valor>): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const texto = String(v).replace(/[^\d.,+-]/g, '');
  const n = Number(texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto.replace(/\.(?=\d{3}(?:\.|$))/g, ''));
  return texto && Number.isFinite(n) ? n : null;
}
function fecha(v: ReturnType<typeof valor>): string {
  if (typeof v === 'number') v = new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 19);
  const raw = String(v).trim();
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const local = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] ?? '0').padStart(2, '0')}:${m[5] ?? '00'}:${m[6] ?? '00'}` : raw;
  const iso = local.length === 10 ? `${local}T00:00:00-05:00` : /^\d{4}-\d\d-\d\dT[\d:.]+$/.test(local) ? `${local}-05:00` : local;
  if (!Number.isFinite(Date.parse(iso))) throw new Error(`Fecha de Excel inválida: ${raw || 'vacía'}`);
  return new Date(iso).toISOString();
}
const opcion = <T extends string>(opciones: T[], v: string, alternativa: T): T =>
  opciones.find((o) => clave(o) === clave(v)) ?? alternativa;
const afirmativo = (v: string) => /^(si|true|pagado|realizado|1)$/.test(normalizar(v));
const identificador = (prefijo: string, ...partes: unknown[]) => `${prefijo}:${JSON.stringify(partes)}`;
const porAporte = (encabezados: string[]) =>
  ['ID entrega', 'Peso aportado (kg)', 'Lote consolidado'].every((col) => encabezados.some((h) => clave(h) === clave(col)));
const demoEnTexto = (v: string) => /\b(?:demo|ficticio|simulad[ao])\b/.test(normalizar(v));
const esPendiente = (v: string) => normalizar(v).startsWith('pendiente');

async function abrirLibro(buffer: ArrayBuffer): Promise<Workbook> {
  const zip = await JSZip.loadAsync(buffer);
  const nombres = Object.keys(zip.files).filter((n) => n.startsWith('xl/') && n.endsWith('.xml'));
  // ExcelJS espera etiquetas sin prefijo en SpreadsheetML. La plantilla usa x:.
  const prefijo = /xmlns:x=(["'])http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main\1/g;
  let adaptado = false;
  for (const nombre of nombres) {
    const xml = await zip.file(nombre)!.async('string');
    const normalizado = xml.replace(prefijo, 'xmlns=$1http://schemas.openxmlformats.org/spreadsheetml/2006/main$1');
    if (normalizado === xml) continue;
    zip.file(nombre, normalizado.replace(/(<\/?)(x:)/g, '$1'));
    adaptado = true;
  }
  const libro = new Workbook();
  await libro.xlsx.load(adaptado ? await zip.generateAsync({ type: 'arraybuffer' }) : buffer);
  return libro;
}
function historial(serializado: string): Movimiento[] {
  const datos: Movimiento[] = JSON.parse(serializado);
  if (!Array.isArray(datos) || !datos.length || !datos.every((m) => m &&
    typeof m.fecha === 'string' && Number.isFinite(Date.parse(m.fecha)) &&
    (m.humedad === null || (typeof m.humedad === 'number' && m.humedad >= 0 && m.humedad <= 100)) &&
    clases.includes(m.clase) && destinos.includes(m.destino) && typeof m.nota === 'string')) {
    throw new Error('Historial inválido.');
  }
  return datos;
}

export async function importarExcel(buffer: ArrayBuffer, demo = false, base?: Base): Promise<number[]> {
  return importarLibro(await abrirLibro(buffer), demo, base);
}

export async function importarLibro(libro: Workbook, demo = false, base?: Base): Promise<number[]> {
  const conteos = [0, 0, 0];
  guardar((actual) => {
    if (demo && actual.demoCargada === libroDemo) return;
    const verificarOrigen = (ids: string[], declarado: string) => {
      const aportes = ids.map((id) => actual.entregas.find((item) => item.id === id));
      if ((declarado === 'Verificado' || aportes.some((e) => e?.origen === 'Verificado')) && aportes.some((e) => {
        return !e || e.origen !== 'Verificado' || !base || !identificar(e, base);
      })) throw new Error('Un lote declarado verificado requiere aportes con procedencia identificada y origen verificado.');
    };
    hojas.forEach((nombre, indice) => {
      const hoja = libro.worksheets.find((h) => clave(h.name) === clave(nombre));
      if (!hoja) throw new Error(`Falta la hoja ${nombre}.`);
      const encabezados = Array.from({ length: hoja.getRow(1).cellCount }, (_, i) => String(valor(hoja.getRow(1).getCell(i + 1).value)).trim());
      if (encabezados.some((h) => !h) || new Set(encabezados.map(clave)).size !== encabezados.length) throw new Error(`Revisa los encabezados de ${nombre}.`);
      const anteriores = actual.encabezados[nombre] ?? [];
      actual.encabezados[nombre] = [...new Set(demo ? [...encabezados, ...anteriores] : [...anteriores, ...encabezados])];
      const agrupada = indice === 1 && porAporte(encabezados);
      const grupos = new Map<string, {
        lote: string; dia: string; id: string; origen: string; filas: Record<string, NonNullable<Entrega['celdas']>>;
      }>();
      hoja.eachRow((fila, filaNum) => {
        if (filaNum === 1) return;
        const celdas = Object.fromEntries(encabezados.map((h, i) => {
          const celda = fila.getCell(i + 1);
          let dato = valor(celda.value);
          if (typeof dato === 'number' && /%/.test(celda.numFmt ?? '')) dato *= 100;
          return [h, dato];
        }));
        if (Object.values(celdas).every((v) => v === '')) return;
        const columna = (k: string) => encabezados.findIndex((h) => claves(k).includes(clave(h)));
        const v = (k: string) => celdas[encabezados[columna(k)]] ?? '';
        const t = (k: string) => String(v(k)).trim();
        const ficticio = demo || afirmativo(t('Datos ficticios')) || demoEnTexto(t('Observaciones')) || (indice === 2 && demoEnTexto(t('Responsable')));
        const lote = agrupada ? t('Lote consolidado') : t('Número de lote');
        const origen = opcion(origenes, t('Verificación del origen'), 'Desconocido');
        try {
          if (indice === 0) {
            const productor = t('Productor'), finca = t('Finca'), dia = fecha(v('Fecha'));
            const kg = numero(v('Peso (kg)')), humedad = numero(v('Humedad (%)'));
            const muestra = t('Resultado de muestra'), defectos = t('Defectos');
            if (!productor || !lote || kg === null || kg <= 0 ||
              (t('Humedad (%)') && humedad === null) || (humedad !== null && (humedad < 0 || humedad > 100))) throw new Error('Revisa productor, finca, lote, peso y humedad.');
            const id = t('ID entrega') || identificador('excel', ficticio, productor, finca, dia, lote, kg);
            const externo = t('ID externo') || undefined;
            if (actual.entregas.some((e) => e.id === id || (externo && e.externo === externo))) return;
            if (actual.consolidados.some((c) => normalizar(c.lote) === normalizar(lote))) throw new Error('Ese número pertenece a un lote consolidado.');
            const [clase, destino] = recomendar(humedad, muestra, defectos, actual.rangos);
            const pago = numero(v('Pago (COP)')), metodo = t('Método de pago');
            const formatoFecha = fila.getCell(columna('Fecha') + 1).numFmt;
            const fechaOrigen = v('Fecha');
            const horaRecepcionInformada = /h/i.test(formatoFecha ?? '') || (typeof fechaOrigen === 'number'
              ? fechaOrigen % 1 !== 0 : /(?:T|\s)(?!00:00(?::00)?$)\d{1,2}:\d{2}/.test(String(fechaOrigen)));
            const destinoExcel = normalizar(t('Destino')) === 'pendiente' ? 'Pendiente de evaluación' : t('Destino');
            const confirmado = destinos.find((d) => clave(d) === clave(destinoExcel));
            const entrega = registrar({
              id, productorId: t('ID productor') || undefined, productor, finca, fecha: dia, kg, humedad, muestra, defectos, lote,
              fincaId: t('fincaId') || undefined, coopId: t('coopId') || undefined, horaRecepcionInformada,
              metodoHumedad: t('Método de medición') || undefined, destinoConfirmado: confirmado,
              pago, metodo, pagado: afirmativo(t('Estado del pago')),
              estadoPagoReportado: estadosPago.find((estado) => clave(estado) === clave(t('Estado del pago'))) ?? (afirmativo(t('Estado del pago')) ? 'Pagado' : undefined),
              destino: confirmado ?? destino, canal: opcion(['manual', 'Excel', 'WhatsApp'], t('Canal'), 'Excel'), externo,
            }, esPendiente(t('Clasificación')) ? 'Sin evaluar' : opcion(clases, t('Clasificación'), clase), origen, ficticio);
            entrega.historial[0].fecha = dia;
            if (t('Historial')) entrega.historial = historial(t('Historial'));
            if (esPendiente(t('Sincronización'))) entrega.sincronizacion = 'Pendiente de sincronización';
            actual.entregas.push({ ...entrega, celdas });
          } else if (indice === 1) {
            const dia = fecha(v('Fecha de consolidación') || v('Fecha'));
            const id = t('ID consolidado') || identificador('consolidado', ficticio, lote, dia);
            if (agrupada) {
              const ref = t('ID entrega');
              const aporte = actual.entregas.find((e) => e.id === ref);
              if (!lote || !aporte || numero(v('Peso aportado (kg)')) !== aporte.kg) throw new Error('El aporte debe corresponder a una entrega existente y tener su peso completo.');
              const k = normalizar(lote);
              const previo = grupos.get(k);
              if (previo && (previo.dia !== dia || previo.id !== id || previo.origen !== origen || Object.hasOwn(previo.filas, ref))) throw new Error('Aporte duplicado o con fecha, identificador u origen distinto.');
              const grupo = previo ?? { lote, dia, id, origen, filas: Object.create(null) };
              grupo.filas[ref] = celdas;
              grupos.set(k, grupo);
              return;
            }
            if (actual.consolidados.some((c) => c.id === id)) return;
            const referencias = t('Entregas originales').split(/[,;\n|]+/).map((ref) => ref.trim()).filter(Boolean);
            let ids: string[];
            if (t('Entregas originales').startsWith('[')) {
              ids = JSON.parse(t('Entregas originales'));
              if (!Array.isArray(ids) || !ids.every((ref) => typeof ref === 'string')) throw new Error('Entregas originales inválidas.');
            } else {
              ids = referencias.map((ref) => {
                const coincidencias = actual.entregas.filter((e) => e.ficticio === ficticio && (e.id === ref || e.lote === ref));
                if (coincidencias.length !== 1) throw new Error(`Entrega no encontrada o ambigua: ${ref}`);
                return coincidencias[0].id;
              });
            }
            const total = numero(v('Peso total (kg)'));
            const suma = actual.entregas.filter((e) => ids.includes(e.id)).reduce((kg, e) => kg + e.kg, 0);
            if (new Set(ids).size !== ids.length || (total !== null && Math.abs(total - suma) > 0.000001)) throw new Error('Revisa entregas duplicadas y el peso total.');
            verificarOrigen(ids, origen);
            const consolidado = consolidar(actual, ids, lote, dia, id);
            consolidado.celdas = celdas;
          } else {
            const dia = fecha(v('Fecha y hora')), zona = t('Zona de almacenamiento');
            const temperatura = numero(v('Temperatura (°C)')), humedad = numero(v('Humedad ambiental (%)'));
            if (!zona || temperatura === null || humedad === null || humedad < 0 || humedad > 100) throw new Error('Revisa zona, temperatura y humedad.');
            const humedadExterior = numero(v('Humedad exterior (%)'));
            if (humedadExterior !== null && (humedadExterior < 0 || humedadExterior > 100)) throw new Error('Revisa la humedad relativa exterior.');
            const id = t('ID medición') || identificador('bodega', ficticio, dia, zona, temperatura, humedad);
            const coopId = demo ? 'COOP-03' : t('coopId') || undefined;
            const anterior = actual.mediciones.find((m) => m.id === id);
            if (anterior) {
              if (demo && anterior.ficticio && !anterior.coopId) anterior.coopId = coopId;
              return;
            }
            actual.mediciones.push({ id, coopId, fecha: dia, temperatura, humedad, zona, responsable: t('Responsable'), accion: t('Acción tomada'), alerta: t('Alerta'), ficticio, celdas,
              temperaturaExterior: numero(v('Temperatura exterior (°C)')) ?? undefined,
              humedadExterior: humedadExterior ?? undefined, observaciones: t('Observaciones'),
            });
          }
          conteos[indice]++;
        } catch (error) {
          throw new Error(`${nombre}, fila ${filaNum}: ${(error as Error).message}`);
        }
      });
      for (const grupo of grupos.values()) {
        const ids = Object.keys(grupo.filas);
        if (actual.consolidados.some((c) => c.id === grupo.id)) continue;
        try {
          verificarOrigen(ids, grupo.origen);
          const consolidado = consolidar(actual, ids, grupo.lote, grupo.dia, grupo.id);
          consolidado.aportesExcel = grupo.filas;
          conteos[1]++;
        } catch (error) {
          throw new Error(`Consolidación, lote ${grupo.lote}: ${(error as Error).message}`);
        }
      }
    });
    for (const nombre of ['Pruebas de horno', 'Pagos']) {
      const hoja = libro.getWorksheet(nombre);
      if (!hoja) continue;
      const cabecera = hoja.getRow(1);
      const indices = new Map<string, number>();
      cabecera.eachCell((c, i) => indices.set(clave(String(valor(c.value))), i));
      if (!indices.has(clave('ID entrega'))) continue;
      hoja.eachRow((r, i) => {
        if (i === 1) return;
        const v = (k: string) => {
          const col = indices.get(clave(k));
          return col ? valor(r.getCell(col).value) : '';
        };
        const t = (k: string) => String(v(k)).trim();
        const fechaOpcional = (k: string) => t(k) ? fecha(v(k)) : undefined;
        const id = t('ID entrega');
        if (!id) return;
        try {
          const e = actual.entregas.find((item) => item.id === id);
          if (!e || (t('Lote') && t('Lote') !== e.lote)) throw new Error('La entrega o lote no coincide con Recepción.');
          if (nombre === 'Pagos') {
            if (e.finanzas) return;
            const p = pagoDe(e);
            e.finanzas = { ...p, compra: numero(v('Valor de compra (COP)')), pagado: numero(v('Monto pagado (COP)')),
              metodo: opcion(['Efectivo', 'Transferencia', 'Otro', 'Sin información'], t('Método'), 'Sin información'),
              estado: opcion([...estadosPago], t('Estado'), 'Sin información'), fecha: fechaOpcional('Fecha de pago'),
              descuentos: numero(v('Descuentos (COP)')), premio: numero(v('Premio (COP)')), fuente: { canal: 'Excel', ficticio: e.ficticio } };
          } else {
            if (e.horno) return;
            const muestraId = t('Muestra') || undefined;
            const pesoDe = (tipo: 'inicial' | 'final') => {
              const gramos = numero(v(`Peso ${tipo} neto (g)`));
              const muestra = t(`ID muestra ${tipo}`);
              return gramos !== null && muestra ? { gramos, muestraId: muestra, neto: true } : undefined;
            };
            e.horno = { entregaId: id, lote: e.lote, muestraId, inicial: pesoDe('inicial'), final: pesoDe('final'),
              inicio: fechaOpcional('Fecha inicial'), fin: fechaOpcional('Fecha final'), temperatura: numero(v('Temperatura (°C)')) ?? undefined,
              duracionMin: numero(v('Duración (min)')) ?? undefined, estado: opcion([...estadosHorno], t('Estado'), 'Pendiente de evaluación'),
              defectos: t('Defectos'), observaciones: t('Observaciones'), destinoConfirmado: destinos.find((d) => clave(d) === clave(t('Destino confirmado'))),
              fuente: { canal: e.ficticio && t('Fuente') === 'simulación' ? 'simulación' : 'Excel', ficticio: e.ficticio },
            };
          }
        } catch (error) {
          throw new Error(`${nombre}, fila ${i}: ${(error as Error).message}`);
        }
      });
    }
    if (demo) actual.demoCargada = libroDemo;
  });
  return conteos;
}

type FilaAcopio = Record<string, string | number | boolean>;
interface AcopioApi {
  encabezados: Record<string, string[]>;
  recepcion: FilaAcopio[];
  consolidacion: FilaAcopio[];
  bodega: FilaAcopio[];
}

/** Reconstruye en memoria las hojas del libro de acopio a partir de las filas de la base de datos. */
function libroDesde(datos: AcopioApi): Workbook {
  const libro = new Workbook();
  const hojasApi: Array<[string, FilaAcopio[]]> = [
    ['Recepción', datos.recepcion], ['Consolidación', datos.consolidacion], ['Bodega', datos.bodega],
  ];
  for (const [nombre, filas] of hojasApi) {
    const encabezados = datos.encabezados[nombre] ?? [];
    const hoja = libro.addWorksheet(nombre);
    hoja.addRow(encabezados);
    filas.forEach((fila) => hoja.addRow(encabezados.map((h) => fila[h] ?? null)));
  }
  return libro;
}

export async function cargarAcopio(base: Base, urlDemo: string): Promise<void> {
  if (leer().demoCargada === libroDemo) return;
  const respuesta = await fetch(apiUrl('/api/cafeto/acopio'), { cache: 'no-store', signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (respuesta?.ok) {
    await importarLibro(libroDesde(await respuesta.json() as AcopioApi), true, base);
    return;
  }
  const estatico = demoData ? await fetch(urlDemo) : null;
  if (!estatico?.ok) throw new Error('No se pudieron cargar los datos de acopio.');
  await importarExcel(await estatico.arrayBuffer(), true, base);
}

const fechaExcel = (iso: string) => new Date(Date.parse(iso) - 5 * 3600000);
export async function exportarExcel(filtro?: Entrega[], mediciones?: Medicion[], base?: Base, coopId?: string): Promise<Blob> {
  const actual = leer();
  const libro = new Workbook();
  const disponibles = actual.entregas.filter((e) => registroVisible(e.id) && (!coopId || (base && perteneceAcopio(e, base, coopId))));
  const permitidos = new Set(disponibles.map((e) => e.id));
  const seleccion = filtro ? filtro.filter((e) => permitidos.has(e.id)) : disponibles;
  const ids = new Set(seleccion.map((e) => e.id));
  const lotes = actual.consolidados.filter((c) => registroVisible(c.id) && c.entregas.every((id) => permitidos.has(id)) && (!filtro || c.entregas.some((id) => ids.has(id))));
  // Exporta todos los aportes de un consolidado incluido para conservar su procedencia.
  lotes.forEach((c) => c.entregas.forEach((id) => ids.add(id)));
  const incluidas = actual.entregas.filter((e) => ids.has(e.id));
  const datos = [
    incluidas.map((e) => {
      const f = base && identificar(e, base);
      const destino = destinoConfirmado(e);
      return [e, [e.id, e.productorId, e.productor, e.finca, fechaExcel(e.fecha), e.kg, e.humedad, e.muestra, e.defectos, e.lote, e.pago, e.metodo, pagoDe(e).estado, e.clase,
        destino === 'Sin confirmar' ? undefined : destino, e.origen, e.sincronizacion, e.canal, e.externo, e.ficticio ? 'Sí' : 'No', JSON.stringify(e.historial),
        e.fincaId ?? e.celdas?.fincaId, e.coopId ?? e.celdas?.coopId, e.metodoHumedad, base ? (f ? 'Identificada' : 'Pendiente de verificación') : undefined,
        diagnosticoCalidad(e, actual.rangos.min, actual.rangos.max).destino]] as const;
    }),
    lotes.map((c) => {
      const aportes = c.entregas.map((id) => actual.entregas.find((e) => e.id === id)!);
      return [c, [c.id, c.lote, fechaExcel(c.fecha), aportes.map((e) => e.productor).join('; '), aportes.map((e) => e.finca).join('; '), aportes.map((e) => e.kg).join('; '), aportes.reduce((kg, e) => kg + e.kg, 0), JSON.stringify(c.entregas), 'Aceptado', c.origen, c.ficticio ? 'Sí' : 'No']] as const;
    }),
    (mediciones ?? actual.mediciones).filter((m) => registroVisible(m.id) && (!coopId || m.coopId === coopId)).map((m) => [m, [m.id, fechaExcel(m.fecha), m.temperatura, m.humedad, m.zona, m.responsable, m.accion, m.alerta, m.ficticio ? 'Sí' : 'No', m.temperaturaExterior, m.humedadExterior, m.observaciones, m.coopId]] as const),
  ] as const;
  hojas.forEach((nombre, i) => {
    const h = libro.addWorksheet(nombre);
    const originales = (actual.encabezados[nombre] ?? []).filter((c) => clave(c) !== 'identificadorqr');
    const agrupada = i === 1 && porAporte(originales);
    const extras = agrupada ? ['ID consolidado', 'Estado de calidad', 'Verificación del origen', 'Datos ficticios'] : columnas[i];
    const encabezados = [...originales, ...extras.filter((c) => !originales.some((o) => claves(c).includes(clave(o))))];
    h.addRow(encabezados);
    function fila(registro: typeof datos[number][number][0], valores: readonly CellValue[], detalle?: Record<string, CellValue>) {
      h.addRow(encabezados.map((c) => {
        if (detalle && Object.hasOwn(detalle, c)) return detalle[c];
        const indice = columnas[i].findIndex((col) => claves(col).includes(clave(c)));
        return indice < 0 ? registro.celdas?.[c] : valores[indice];
      })).eachCell((celda, col) => {
        if (celda.value instanceof Date) celda.numFmt = i === 0 && 'horaRecepcionInformada' in registro && registro.horaRecepcionInformada === false
          ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm';
        if (claves('Pago (COP)').includes(clave(encabezados[col - 1]))) celda.numFmt = '"COP" #,##0.00';
      });
    }
    if (agrupada) {
      const entregas = new Map(actual.entregas.map((e) => [e.id, e]));
      datos[1].forEach(([lote, valores]) => {
        for (const id of lote.entregas) {
          const e = entregas.get(id)!;
          fila(lote, valores, {
            ...lote.aportesExcel?.[id],
            'Lote consolidado': lote.lote, 'ID entrega': e.id, 'Lote origen': e.lote,
            'Peso aportado (kg)': e.kg, Fecha: fechaExcel(lote.fecha), Productor: e.productor,
            'ID caficultor (nroId)': e.productorId, fincaId: e.fincaId ?? e.celdas?.fincaId,
          });
        }
      });
    } else {
      datos[i].forEach(([registro, valores]) => fila(registro, valores));
    }
    h.views = [{ state: 'frozen', ySplit: 1 }];
  });
  const horno = libro.addWorksheet('Pruebas de horno');
  const pagos = libro.addWorksheet('Pagos');
  const clavesTraza = ['ID entrega', 'Identificación', 'Productor', 'Finca', 'ID finca', 'Lote', 'Peso (kg)'];
  horno.addRow([...clavesTraza, 'Muestra', 'Peso inicial neto (g)', 'Peso final neto (g)', 'Pérdida (g)', 'Humedad (%)', 'Fecha inicial', 'Fecha final', 'Temperatura (°C)', 'Duración (min)', 'Estado', 'Defectos', 'Observaciones', 'Destino recomendado', 'Destino confirmado', 'Fuente', 'ID muestra inicial', 'ID muestra final']);
  pagos.addRow([...clavesTraza, 'Valor de compra (COP)', 'Monto pagado (COP)', 'Método', 'Estado', 'Fecha de pago', 'Descuentos (COP)', 'Premio (COP)']);
  for (const e of incluidas) {
    const traza = [e.id, e.productorId, e.productor, e.finca, e.fincaId ?? e.celdas?.fincaId, e.lote, e.kg];
    const p = pruebaDe(e);
    if (p) {
      const resultado = calcularHorno(p);
      horno.addRow([...traza, p.muestraId, p.inicial?.neto ? p.inicial.gramos : undefined, p.final?.neto ? p.final.gramos : undefined,
        resultado?.perdida, resultado?.humedad, p.inicio && fechaExcel(p.inicio), p.fin && fechaExcel(p.fin), p.temperatura, p.duracionMin, p.estado,
        p.defectos || e.defectos, p.observaciones, diagnosticoCalidad(e, actual.rangos.min, actual.rangos.max).destino, destinoConfirmado(e), p.fuente?.canal, p.inicial?.muestraId, p.final?.muestraId]);
    }
    const pago = pagoDe(e);
    pagos.addRow([...traza, pago.compra, pago.pagado, pago.metodo, pago.estado, pago.fecha && fechaExcel(pago.fecha), pago.descuentos, pago.premio]);
  }
  for (const hoja of [horno, pagos]) hoja.eachRow((r) => r.eachCell((c, i) => {
    if (c.value instanceof Date) c.numFmt = 'dd/mm/yyyy hh:mm';
    if (String(hoja.getRow(1).getCell(i).value).endsWith('(COP)')) c.numFmt = '"COP" #,##0.00';
  }));
  return new Blob([await libro.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
