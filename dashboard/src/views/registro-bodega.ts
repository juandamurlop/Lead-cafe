import { leer, fechaCO } from '../data/operacion';
import type { Medicion } from '../data/operacion';
import { formatoHumedad, registroVisible } from '../data/supervision';
import { bandaRiesgo, diagnosticar } from '../domain/psychro';
import { RH_SEGURA_MAX, RH_SEGURA_MIN } from '../domain/constants';
import { h, mount } from '../lib/dom';
import { curva } from '../lib/charts';
import { card, kpi, pill } from '../lib/ui';
import { num } from '../lib/fmt';
import { campo, tablaOperacion } from './operacion-ui';

const HORAS_SIN_LECTURA = 48;
const hora = 3600000;
const temperatura = (n?: number) => n === undefined ? '—' : `${num(n)} °C`;
function ventilacion(m: Medicion) {
  if (m.temperaturaExterior === undefined || m.humedadExterior === undefined) return 'Sin lectura exterior completa';
  return diagnosticar({ t: m.temperatura, rh: m.humedad }, { t: m.temperaturaExterior, rh: m.humedadExterior }).ventilar
    ? 'Ventilación recomendada con estas lecturas' : 'Mantener cerrado según estas lecturas';
}
const nombres = { seca: 'Aire seco', segura: 'En rango', alta: 'Humedad elevada', critica: 'Humedad crítica' } as const;

export function registroBodega(coopId?: string, alCambiarZona?: (zona: string) => void): HTMLElement {
  const datos = leer().mediciones.filter((m) => registroVisible(m.id) && (!coopId || m.coopId === coopId)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const zonas = [...new Set(datos.map((m) => m.zona))];
  const filtro = campo('Zona de almacenamiento', 'zona', zonas[0] ?? '', {}, zonas);
  const cuerpo = h('div', {});
  function mostrar() {
    const zona = filtro.querySelector('select')?.value;
    alCambiarZona?.(zona ?? '');
    const lista = datos.filter((m) => m.zona === zona);
    const ultima = lista[0];
    if (!ultima) { mount(cuerpo, h('p', { text: 'Sin mediciones reportadas. Las condiciones actuales son desconocidas.' })); return; }
    const horas = Math.max(0, (Date.now() - Date.parse(ultima.fecha)) / hora);
    const banda = bandaRiesgo(ultima.humedad);
    const curso = [...lista].reverse();
    const antiguedad = horas < 1 ? `${Math.floor(horas * 60)} min` : horas < 48 ? `${Math.floor(horas)} h` : `${Math.floor(horas / 24)} días`;
    const tendencia = curso.length < 2 ? 'Se requieren dos lecturas para comparar.' :
      `Cambio entre las dos lecturas más recientes: ${num(ultima.humedad - lista[1].humedad)} puntos porcentuales.`;
    const grafico = curso.length > 1 ? curva({
      datos: curso.map((m) => ({ x: (Date.parse(m.fecha) - Date.parse(curso[0].fecha)) / hora, y: m.humedad })),
      xr: [0, Math.max(1, (Date.parse(ultima.fecha) - Date.parse(curso[0].fecha)) / hora)],
      yr: [0, 100], bandaY: [RH_SEGURA_MIN, RH_SEGURA_MAX], ticksY: [0, 25, 50, 75, 100], etiquetaX: 'Horas desde la primera medición',
    }) : null;
    mount(cuerpo,
      h('div', { class: 'kpis' },
        kpi('Última humedad ambiental', formatoHumedad(ultima.humedad), fechaCO(ultima.fecha), banda === 'segura' ? 'ok' : 'warn'),
        kpi('Temperatura interior', temperatura(ultima.temperatura), ultima.zona),
        kpi('Tiempo desde la última lectura', antiguedad, undefined),
      ),
      h('p', { role: 'status' }, pill(nombres[banda], banda === 'segura' ? 'ok' : banda === 'critica' ? 'bad' : 'warn'), ' ',
        horas >= HORAS_SIN_LECTURA ? 'Sin lecturas recientes. Las condiciones actuales son desconocidas.' : ventilacion(ultima)),
      h('h3', { text: 'Evolución de humedad ambiental' }), h('p', { text: tendencia }),
      grafico && h('div', { class: 'op-curva' }, grafico),
      tablaOperacion(['Fecha y hora', 'Zona', 'Interior (°C)', 'HR interior', 'Exterior (°C)', 'HR exterior', 'Acción tomada', 'Observaciones', 'Responsable', 'Alerta y ventilación', 'Datos'],
        lista.map((m) => [fechaCO(m.fecha), m.zona, temperatura(m.temperatura), formatoHumedad(m.humedad),
          temperatura(m.temperaturaExterior), formatoHumedad(m.humedadExterior), m.accion || '—', m.observaciones || '—', m.responsable || '—',
          `${nombres[bandaRiesgo(m.humedad)]} · ${ventilacion(m)}`, 'Reportado'])),
    );
  }
  filtro.addEventListener('change', mostrar);
  mostrar();
  const historial = card('Historial de bodega', 'Lecturas ambientales puntuales. La humedad ambiental y la humedad interna del grano se reportan por separado.', filtro, cuerpo);
  historial.classList.add('card--ancho');
  return historial;
}
