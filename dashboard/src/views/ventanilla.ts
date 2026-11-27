import { h, mount } from '../lib/dom';
import { boton, card, fila, kpi, pill } from '../lib/ui';
import { cop, entero, num } from '../lib/fmt';
import { clases, destinos, leer, guardar, fechaCO, fechaLocal, normalizar } from '../data/operacion';
import type { Consolidado, Entrega } from '../data/operacion';
import type { Base } from '../data/db';
import { calcularHorno, destinoConfirmado, diagnosticoCalidad, estadosHorno, estadosPago, fincaIdDe, formatoHumedad, identificar, pagoDe, perteneceAcopio, pruebaDe, registroVisible, sincronizacion } from '../data/supervision';
import { importarExcel, exportarExcel, descargar } from '../data/excel';
import { campo, enviar, porcentaje, requerido, secundario, tablaOperacion, texto } from './operacion-ui';
import { registroBodega } from './registro-bodega';
import { store } from '../state';

const secciones = ['Resumen', 'Recepción', 'Pruebas de horno', 'Requieren atención', 'Consolidación', 'Pagos', 'Bodega', 'Fincas asociadas'] as const;
const peso = (e: Entrega[]) => e.reduce((s, r) => s + r.kg, 0);
const dinero = (n: number | null | undefined) => n == null ? '—' : cop(n);
const zona = 'America/Bogota';
const soloFecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeZone: zona });
const horaBogota = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zona });
/** Una hora a medianoche exacta es una fecha sin hora informada: no se muestra «12:00 a. m.». */
const fecha = (f?: string) => !f ? '—' : horaBogota.format(new Date(f)) === '00:00' ? soloFecha.format(new Date(f)) : fechaCO(f);
const fechaRecepcion = (e: Entrega) => e.horaRecepcionInformada === false
  ? `${new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(e.fecha))} · hora sin informar`
  : fecha(e.fecha);
const dato = (n?: number) => n === undefined ? '—' : num(n, 2);
const fincaId = fincaIdDe;
const tono = { Aceptado: 'ok', Retenido: 'warn', Rechazado: 'bad', 'Sin evaluar': 'neutro' } as const;

function grafico(titulo: string, series: [string, number][], unidad: string, max = Math.max(1, ...series.map(([, v]) => v))): HTMLElement {
  return h('details', { class: 'op-grafico', open: true }, h('summary', { text: titulo }),
    series.length ? h('ul', {}, ...series.map(([nombre, valor]) => h('li', {},
      h('span', { text: nombre }), h('meter', { min: 0, max, value: valor, 'aria-label': `${nombre}: ${unidad === 'pagos' ? entero(valor) : num(valor)} ${unidad}` }),
      h('span', { text: `${unidad === 'pagos' ? entero(valor) : num(valor)} ${unidad}` }),
    ))) : h('p', { text: 'Sin datos para el filtro.' }),
  );
}

export function ventanilla(base: Base, coopId?: string): HTMLElement {
  let seleccion: typeof secciones[number] = coopId ? 'Resumen' : 'Recepción';
  const centro = coopId ? base.acopios.find((a) => a.id === coopId) : undefined;
  const fincas = coopId ? base.fincasDeAcopio(coopId) : [];
  const pertenece = (e: Entrega) => registroVisible(e.id) && (!coopId || perteneceAcopio(e, base, coopId));
  let detalleId: string | null = null;
  let loteId: string | null = null;
  let zonaBodega = '';
  const panel = h('div', { class: 'op-secciones' });
  const contenido = h('div', { class: 'op-secciones' });
  const barra = h('div', { class: 'btnrow', role: 'group', 'aria-label': 'Secciones de supervisión' });
  const indicadores = h('div', { class: 'kpis' });
  const encabezado = h('div', { class: 'rows' });
  const estado = h('p', { role: 'status', class: 'op-estado' });
  const informar = (mensaje: string) => { estado.textContent = mensaje; };
  const fallo = (e: unknown) => informar((e as Error).message);
  const filtros = h('form', { class: 'op-form', onInput: () => mostrar(), onSubmit: (ev: Event) => ev.preventDefault() },
    campo('Identificación', 'id'), campo('Productor', 'productor'), campo('Finca o ID de finca', 'finca'), campo('Lote', 'lote'),
    campo('Desde', 'desde', '', { type: 'date' }), campo('Hasta', 'hasta', '', { type: 'date' }),
    campo('Clasificación confirmada', 'clase', '', {}, ['', ...clases]),
    campo('Destino confirmado', 'destino', '', {}, ['', ...destinos, 'Sin confirmar']),
    campo('Estado de horno', 'horno', '', {}, ['', ...estadosHorno]),
    campo('Estado del pago', 'pago', '', {}, ['', ...estadosPago]),
  );
  function filtrar(registros: Entrega[]): Entrega[] {
    const f = new FormData(filtros);
    const coincide = (k: string, v: string) => normalizar(v).includes(normalizar(texto(f, k)));
    const exacto = (k: string, v?: string) => !texto(f, k) || texto(f, k) === v;
    return registros.filter((e) => {
      const d = fechaLocal(e.fecha).slice(0, 10);
      return pertenece(e) && coincide('id', e.productorId ?? '') && coincide('productor', e.productor) &&
        coincide('finca', `${e.finca} ${fincaId(e)}`) && coincide('lote', e.lote) &&
        (!texto(f, 'desde') || d >= texto(f, 'desde')) && (!texto(f, 'hasta') || d <= texto(f, 'hasta')) &&
        exacto('clase', e.clase) && exacto('destino', destinoConfirmado(e)) &&
        exacto('horno', pruebaDe(e)?.estado) && exacto('pago', pagoDe(e).estado);
    }).sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
  }
  function accesoFinca(e: Entrega): HTMLElement {
    const f = identificar(e, base);
    if (!f) return pill('Pendiente de verificación', 'warn');
    return h('div', { class: 'op-acciones' },
      base.expedientePorFinca.has(f.id) && secundario('Ver expediente ambiental', () => {
        store.set({ filtroTexto: f.id, filtroEstado: 'TODOS' });
        location.hash = 'expediente';
      }),
    );
  }
  function controlDetalle(e: Entrega): HTMLElement {
    return secundario(`Ver ${e.id}`, () => {
      detalleId = e.id; seleccion = 'Recepción'; mostrar();
      contenido.querySelector('.op-detalle')?.scrollIntoView({ block: 'nearest' });
    });
  }
  function mostrar(): void {
    const op = leer();
    const delCentro = op.entregas.filter(pertenece);
    const disponibles = new Set(delCentro.map((e) => e.id));
    const mediciones = op.mediciones.filter((m) => registroVisible(m.id) && (!coopId || m.coopId === coopId));
    const registros = filtrar(op.entregas);
    const porId = new Map(op.entregas.map((e) => [e.id, e]));
    const clasificar = (e: Entrega) => diagnosticoCalidad(e, op.rangos.min, op.rangos.max);
    const hornos = registros.flatMap((e) => { const p = pruebaDe(e); return p ? [{ e, p }] : []; });
    const terminada = (e: typeof hornos[number]) => ['Prueba finalizada', 'Pendiente de evaluación', 'Evaluado'].includes(e.p.estado) && calcularHorno(e.p) !== null;
    const pagos = registros.map((e) => ({ e, p: pagoDe(e) }));
    const pagosConMonto = pagos.filter(({ p }) => p.pagado !== null);
    const ids = new Set(registros.map((e) => e.id));
    const identificados = registros.filter((e) => identificar(e, base));
    const secado = registros.filter((e) => ['Secado', 'Producción o secado'].includes(destinoConfirmado(e)));
    const kg = (n: number) => `${num(n)} kg`;
    const kgClase = (c: string) => peso(registros.filter((e) => e.clase === c));
    const ultimas = [...delCentro.map((e) => e.fecha), ...mediciones.map((m) => m.fecha),
      ...op.consolidados.filter((c) => c.entregas.length && c.entregas.every((id) => disponibles.has(id))).map((c) => c.fecha),
      ...delCentro.flatMap((e) => [pruebaDe(e)?.fin, e.finanzas?.fecha].filter((f): f is string => !!f))].sort();
    if (centro) mount(encabezado,
      fila('Sede informada', centro.municipioSede || 'Sin informar'),
      fila('Ubicación aproximada en mapa', `${centro.lat.toFixed(4)}, ${centro.lon.toFixed(4)}`),
      fila('Responsable', coopId === 'COOP-03' ? 'Hernán' : (mediciones.find((m) => m.responsable)?.responsable || 'Sin informar')),
      fila('Productores y fincas asociados', `${new Set(fincas.map((f) => f.nroId)).size} productores · ${fincas.length} fincas`),
      fila('Última información disponible', fecha(ultimas.at(-1))),
    );
    mount(indicadores,
      kpi('Entregas', String(registros.length)), kpi('Recibidos', kg(peso(registros))), kpi('Aceptados', kg(kgClase('Aceptado')), undefined, 'ok'),
      kpi('Retenidos', kg(kgClase('Retenido')), undefined, 'warn'), kpi('Rechazados', kg(kgClase('Rechazado')), undefined, 'bad'),
      kpi('Horno pendiente', String(hornos.filter(({ p }) => ['Pendiente de prueba de horno', 'Prueba en proceso'].includes(p.estado)).length)),
      kpi('Horno finalizado', String(hornos.filter(terminada).length)), kpi('Lotes pendientes de secado', String(new Set(secado.map((e) => e.lote)).size)),
      kpi('Productores identificados', String(new Set(identificados.map((e) => e.productorId)).size)),
      kpi('Procedencia identificada', kg(peso(identificados))),
      kpi('Total pagado (COP)', pagosConMonto.length ? cop(pagosConMonto.reduce((s, { p }) => s + (p.pagado ?? 0), 0)) : '—'),
      kpi('Pagos pendientes', String(pagos.filter(({ p }) => p.estado === 'Pendiente' || p.estado === 'Parcial').length)),
      kpi('Pendientes de sincronización', String(registros.filter((e) => sincronizacion(e) === 'Pendiente de sincronización').length)),
      kpi('Pendientes de confirmación', String(pagos.filter(({ e, p }) => sincronizacion(e) === 'Pendiente de confirmación' || p.estado !== 'Pagado').length),
        'Entregas con confirmación operativa o de pago pendiente'),
    );
    indicadores.hidden = !!coopId && seleccion !== 'Resumen';
    filtros.hidden = !!coopId && (seleccion === 'Fincas asociadas' || seleccion === 'Bodega');
    const visibles = coopId ? secciones : secciones.filter((s) => s !== 'Resumen' && s !== 'Fincas asociadas');
    mount(barra, ...visibles.map((s) => boton(s === 'Pruebas de horno' && coopId ? 'Humedad y pruebas de horno' : s, () => { seleccion = s; mostrar(); }, {
      class: `btn ${s === seleccion ? '' : 'btn--chip'}`, 'aria-pressed': String(s === seleccion),
    })));
    const detalle = registros.find((e) => e.id === detalleId);
    const fincaDetalle = detalle && identificar(detalle, base);
    const datosDetalle = detalle ? card(`Entrega ${detalle.id}`, null,
      accesoFinca(detalle),
      h('div', { class: 'rows' },
        fila('Productor y finca', `${detalle.productor} · ${detalle.finca || 'Sin informar'}`),
        fila('Identificación / finca / cooperativa', `${detalle.productorId || '—'} / ${fincaId(detalle) || '—'} / ${fincaDetalle?.coopId ?? '—'}`),
        fila('Ubicación', fincaDetalle ? `${fincaDetalle.municipio}, ${fincaDetalle.departamento}` : 'Pendiente de verificación'),
        fila('Expediente ambiental de la finca', fincaDetalle && base.expedientePorFinca.has(fincaDetalle.id) ? base.estadoFinca(fincaDetalle.id) : 'Sin expediente vinculado'),
        fila('Pago reportado', `${dinero(pagoDe(detalle).pagado)} · ${pagoDe(detalle).estado}`),
        fila('Destino confirmado', destinoConfirmado(detalle)),
        fila('Recomendación', clasificar(detalle).destino),
      ), tablaOperacion(['Fecha', 'Humedad del café', 'Calidad', 'Destino registrado', 'Movimiento'],
        detalle.historial.map((m) => [fecha(m.fecha), formatoHumedad(m.humedad), m.clase, m.destino, m.nota])),
      secundario('Cerrar detalle', () => { detalleId = null; mostrar(); }),
    ) : null;
    datosDetalle?.classList.add('op-detalle');
    const volumen = new Map<string, [string, number]>();
    identificados.forEach((e) => volumen.set(e.productorId!, [e.productor, (volumen.get(e.productorId!)?.[1] ?? 0) + e.kg]));
    if (seleccion === 'Resumen') {
      mount(contenido, card('Resumen operativo', delCentro.length || mediciones.length ? null : 'Este centro aún no tiene registros operativos disponibles.',
        delCentro.length ? h('p', { text: `${identificados.length} entregas con procedencia identificada de ${registros.length} en la consulta.` }) : null,
      ));
    } else if (seleccion === 'Recepción') {
      mount(contenido, datosDetalle || null, card('Historial de recepción', `${registros.length} entregas con los filtros actuales`,
        tablaOperacion(['Entrega', 'Identificación', 'Productor', 'Finca', 'ID finca', 'Recepción (Colombia)', 'kg', 'Humedad', 'Método de medición', 'Muestra', 'Defectos', 'Lote', 'Calidad confirmada', 'Evaluación preliminar', 'Destino confirmado', 'Destino recomendado', 'Importe informado (COP)', 'Monto pagado (COP)', 'Método', 'Estado del pago', 'Procedencia', 'Sincronización', 'Datos'],
          registros.map((e) => {
            const recomendacion = clasificar(e), p = pagoDe(e);
            return [controlDetalle(e), e.productorId || '—', e.productor, e.finca || '—', fincaId(e) || '—', fechaRecepcion(e), num(e.kg),
              formatoHumedad(e.humedad), e.metodoHumedad || 'Sin informar', e.muestra || '—', e.defectos || '—', e.lote, pill(e.clase, tono[e.clase]),
              pill(recomendacion.etiqueta, recomendacion.tono), destinoConfirmado(e), recomendacion.destino, dinero(e.pago), dinero(p.pagado), p.metodo, p.estado,
              identificar(e, base) ? 'Identificada' : pill('Pendiente de verificación', 'warn'), sincronizacion(e), e.canal];
          }))),
        card('Distribuciones de recepción', null, h('div', { class: 'op-graficos' },
          grafico('Café por calidad confirmada', clases.map((c) => [c, kgClase(c)]), 'kg'),
          grafico('Humedad reportada por entrega', registros.flatMap((e) => e.humedad === null ? [] : [[e.id, e.humedad]]), '%'),
          grafico('Volumen por productor identificado', [...volumen.values()].sort((a, b) => b[1] - a[1]), 'kg'),
        )));
    } else if (seleccion === 'Pruebas de horno') {
      mount(contenido, card('Seguimiento de pruebas de horno', 'La pérdida corresponde a la muestra neta.',
        tablaOperacion(['Entrega / historial', 'Lote', 'Caficultor', 'Finca', 'kg entregados', 'Humedad en recepción', 'Inicial neto (g)', 'Final neto (g)', 'Pérdida (g)', 'Humedad calculada', 'Inicio', 'Fin', 'Temperatura (°C)', 'Duración (min)', 'Estado', 'Defectos', 'Observaciones', 'Calidad confirmada', 'Destino recomendado', 'Destino confirmado', 'Fuente'],
          hornos.map(({ e, p }) => {
            const r = calcularHorno(p);
            return [controlDetalle(e), e.lote, e.productor, e.finca, num(e.kg), formatoHumedad(e.humedad), dato(p.inicial?.neto ? p.inicial.gramos : undefined),
              dato(p.final?.neto ? p.final.gramos : undefined), dato(r?.perdida), formatoHumedad(r?.humedad), fecha(p.inicio), fecha(p.fin),
              dato(p.temperatura), dato(p.duracionMin), pill(p.estado, terminada({ e, p }) ? 'ok' : 'warn'), p.defectos || e.defectos || e.muestra || '—',
              [p.observaciones, p.inicial && p.final && !r ? 'Pesos sin validar para calcular humedad.' : ''].filter(Boolean).join(' ') || '—',
              pill(e.clase, tono[e.clase]), clasificar(e).destino, destinoConfirmado(e), p.fuente?.canal === 'simulación' ? 'Registro local' : (p.fuente?.canal ?? '—')];
          }))));
    } else if (seleccion === 'Requieren atención') {
      const prioridad = (e: Entrega) => e.clase === 'Rechazado' ? 0 : e.clase === 'Retenido' ? 1 : e.clase === 'Sin evaluar' ? 2 : 3;
      const cola = registros.filter((e) => prioridad(e) < 3 || clasificar(e).tono !== 'ok').sort((a, b) => prioridad(a) - prioridad(b) || a.fecha.localeCompare(b.fecha));
      mount(contenido, card('Lotes que requieren atención', 'Prioridad por estado de calidad y antigüedad de recepción.',
        tablaOperacion(['Entrega', 'Lote', 'Recibido', 'Espera (días)', 'Confirmado', 'Evaluación', 'Destino recomendado', 'Destino confirmado'],
          cola.map((e) => [controlDetalle(e), e.lote, fecha(e.fecha), String(Math.max(0, Math.floor((Date.now() - Date.parse(e.fecha)) / 86400000))),
            pill(e.clase, tono[e.clase]), pill(clasificar(e).etiqueta, clasificar(e).tono), clasificar(e).destino, destinoConfirmado(e)]))));
    } else if (seleccion === 'Consolidación') {
      const lotes = op.consolidados.filter((c) => registroVisible(c.id) && c.entregas.every((id) => disponibles.has(id)) && c.entregas.some((id) => ids.has(id)));
      const aportes = (c: Consolidado) => c.entregas.flatMap((id) => porId.get(id) ?? []);
      const cuenta = (c: Consolidado, k: 'id' | 'nroId') => new Set(aportes(c).flatMap((e) => identificar(e, base)?.[k] ?? [])).size;
      const seleccionado = lotes.find((c) => c.id === loteId);
      mount(contenido,
        card('Lotes consolidados', 'Calidad física y verificación ambiental se muestran por separado.',
          tablaOperacion(['Lote comercial', 'Fecha de consolidación', 'kg', 'Productores', 'Fincas', 'Calidad', 'Verificación ambiental'],
            lotes.map((c) => [secundario(c.lote, () => { loteId = c.id; mostrar(); }), fecha(c.fecha), num(peso(aportes(c))),
              String(cuenta(c, 'nroId')), String(cuenta(c, 'id')), 'Aceptado', c.origen === 'Desconocido' ? 'Sin verificación' : c.origen]))),
        seleccionado ? card(`Procedencia de ${seleccionado.lote}`, `${kg(peso(aportes(seleccionado)))} sumados de entregas originales`,
          h('ol', { class: 'op-procedencia', 'aria-label': 'Diagrama de aportes y lote comercial' },
            ...aportes(seleccionado).map((e) => h('li', {}, h('span', { text: `${fincaId(e) || 'Finca pendiente'} · ${e.id} · ${kg(e.kg)}` }))),
            h('li', { class: 'op-total', text: `↓ ${seleccionado.lote} · ${kg(peso(aportes(seleccionado)))}` }),
          ),
          tablaOperacion(['Entrega', 'Identificación', 'Productor', 'Finca', 'ID finca', 'Lote original', 'Peso aportado', 'Catálogo'],
            aportes(seleccionado).map((e) => [controlDetalle(e), e.productorId || '—', e.productor, e.finca, fincaId(e), e.lote, kg(e.kg), accesoFinca(e)])),
          h('details', {}, h('summary', { text: 'Historial de los aportes' }),
            tablaOperacion(['Entrega', 'Fecha', 'Movimiento', 'Calidad'], aportes(seleccionado).flatMap((e) =>
              e.historial.map((m) => [e.id, fecha(m.fecha), m.nota, m.clase])))),
        ) : null,
      );
    } else if (seleccion === 'Pagos') {
      mount(contenido, card('Seguimiento financiero', 'Importes en COP. Un guion indica un valor sin informar.',
        tablaOperacion(['Productor', 'Identificación', 'Lote', 'kg', 'Valor de compra', 'Importe informado', 'Monto pagado', 'Método', 'Estado', 'Fecha del pago', 'Descuentos', 'Premio por trazabilidad'],
          pagos.map(({ e, p }) => [e.productor, e.productorId || '—', e.lote, num(e.kg), dinero(p.compra), dinero(e.pago), dinero(p.pagado), p.metodo,
            pill(p.estado, p.estado === 'Pagado' ? 'ok' : p.estado === 'Sin información' ? 'neutro' : 'warn'), fecha(p.fecha), dinero(p.descuentos), dinero(p.premio)])),
        grafico('Distribución de pagos por estado', estadosPago.map((s) => [s, pagos.filter(({ p }) => p.estado === s).length]), 'pagos')));
    } else if (seleccion === 'Fincas asociadas') {
      mount(contenido, card('Fincas asociadas', null,
        tablaOperacion(['ID finca', 'Identificación', 'Productor', 'Finca', 'Departamento', 'Municipio', 'Área (ha)', 'Polígono', 'Entregas', 'Expediente'], fincas.map((f) => [
          secundario(f.id, () => store.set({ fincaSel: f.id, zonaSel: f.departamento, acopioSel: f.coopId })),
          f.nroId, f.titular, f.nombre, f.departamento, f.municipio, num(f.areaTotalHa), f.anillo.length >= 4 ? 'Disponible' : 'Sin polígono',
          String(delCentro.filter((e) => identificar(e, base)?.id === f.id).length),
          base.expedientePorFinca.has(f.id) ? base.estadoFinca(f.id) : 'Sin expediente',
        ]))));
    } else mount(contenido, registroBodega(coopId, (zona) => { zonaBodega = zona; }));
  }
  const alcance = campo('Descargar registros', 'alcance', 'Todos', {}, ['Todos', 'Filtrados']);
  const archivo = h('input', { type: 'file', accept: '.xlsx', hidden: true, onChange: () => {
    const libro = archivo.files?.[0];
    if (!libro) return;
    importar.toggleAttribute('disabled', true);
    void libro.arrayBuffer().then((buffer) => importarExcel(buffer, false, base)).then((n) => {
      mostrar(); informar(`Importados: ${n[0]} entregas, ${n[1]} consolidados y ${n[2]} mediciones.`);
    }).catch(fallo).finally(() => { archivo.value = ''; importar.removeAttribute('disabled'); });
  } });
  const importar = secundario('Importar Excel', () => archivo.click());
  const op = leer();
  const rangos = h('form', { class: 'op-form', onSubmit: (ev: Event) => {
    ev.preventDefault();
    try {
      const f = new FormData(rangos), min = Number(texto(f, 'min')), max = Number(texto(f, 'max'));
      if (min > max) throw new Error('El mínimo debe ser menor o igual al máximo.');
      guardar((o) => { o.rangos = { min, max }; });
      mostrar(); informar('Referencias de evaluación actualizadas.');
    } catch (e) { fallo(e); }
  } }, campo('Mínimo (%)', 'min', String(op.rangos.min), { ...porcentaje, ...requerido }),
  campo('Máximo (%)', 'max', String(op.rangos.max), { ...porcentaje, ...requerido }), enviar('Guardar rango'));
  mount(panel, card(centro ? `${centro.nombre} · ${centro.id}` : 'Supervisión del centro de acopio',
    null,
    encabezado,
    h('div', { class: 'op-form' }, !coopId && archivo, !coopId && importar, alcance, boton('Descargar Excel', () => {
      const filtrado = alcance.querySelector('select')?.value === 'Filtrados';
      const f = new FormData(filtros);
      const medidas = filtrado ? leer().mediciones.filter((m) => {
        const d = fechaLocal(m.fecha).slice(0, 10);
        return registroVisible(m.id) && (seleccion !== 'Bodega' || !zonaBodega || m.zona === zonaBodega) &&
          (!texto(f, 'desde') || d >= texto(f, 'desde')) && (!texto(f, 'hasta') || d <= texto(f, 'hasta'));
      }) : undefined;
      void exportarExcel(filtrado ? filtrar(leer().entregas) : undefined, medidas, base, coopId)
        .then((blob) => descargar(blob, coopId ? `Cafeto-${coopId}.xlsx` : 'Cafeto-Acopio.xlsx')).catch(fallo);
    })), filtros,
    h('details', {}, h('summary', { text: 'Referencias de humedad' }),
      h('p', { text: 'Límites de pergamino seco pendientes de validar con el encargado del acopio.' }), rangos),
    estado,
  ), indicadores, barra, contenido);
  mostrar();
  return panel;
}
