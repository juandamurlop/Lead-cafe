import { h } from '../lib/dom';
import { registroBodega } from './registro-bodega';
import { slot } from '../lib/reactive';
import { barras, franja24 } from '../lib/charts';
import { boton, callout, card, fijarSlider, fila, grid, money, nota, pill, readout, slider } from '../lib/ui';
import { cop, entero, num } from '../lib/fmt';
import { EXPLICACION_BANDA, cicloDiario, diagnosticar, inestable } from '../domain/psychro';
import { KG_POR_CARGA, PRECIO_KG, RH_SEGURA_MAX, RH_SEGURA_MIN } from '../domain/constants';
import { store, toast } from '../state';
import type { BandaRiesgo } from '../domain/psychro';

const IDS = { tIn: 'sl-tin', hIn: 'sl-hin', tOut: 'sl-tout', hOut: 'sl-hout' };

const TONO_BANDA: Record<BandaRiesgo, 'ok' | 'warn' | 'bad'> = {
  seca: 'warn', segura: 'ok', alta: 'warn', critica: 'bad',
};
const NOMBRE_BANDA: Record<BandaRiesgo, string> = {
  seca: 'Demasiado seca', segura: 'Zona segura', alta: 'Subiendo', critica: 'Riesgo de moho',
};

interface Escenario { nombre: string; dentro: { t: number; rh: number }; fuera: { t: number; rh: number } }

const ESCENARIOS: Escenario[] = [
  { nombre: 'Mañana despejada', dentro: { t: 24, rh: 78 }, fuera: { t: 27, rh: 55 } },
  { nombre: 'Afuera cálido', dentro: { t: 22, rh: 70 }, fuera: { t: 30, rh: 60 } },
  { nombre: 'Noche húmeda', dentro: { t: 20, rh: 68 }, fuera: { t: 17, rh: 92 } },
  { nombre: 'Bodega muy seca', dentro: { t: 26, rh: 52 }, fuera: { t: 29, rh: 40 } },
];

function aplicar(e: Escenario): void {
  store.set({ dentro: { ...e.dentro }, fuera: { ...e.fuera } });
  fijarSlider(IDS.tIn, e.dentro.t); fijarSlider(IDS.hIn, e.dentro.rh);
  fijarSlider(IDS.tOut, e.fuera.t); fijarSlider(IDS.hOut, e.fuera.rh);
  const d = diagnosticar(e.dentro, e.fuera);
  if (d.trampa) toast('Afuera marca menos humedad relativa, pero trae más agua. Cerrar.', 'warn');
}

function veredicto(): HTMLElement {
  const s = store.get();
  const d = diagnosticar(s.dentro, s.fuera);
  return h('div', {},
    readout(
      d.ventilar ? 'ABRIR' : 'CERRAR',
      d.ventilar ? 'El aire de afuera está más seco' : 'El aire de afuera traería más agua',
      d.ventilar
        ? 'Ventilar baja la humedad de la bodega ahora mismo.'
        : d.trampa
          ? `Afuera la humedad relativa es menor (${num(s.fuera.rh, 0)} % frente a ${num(s.dentro.rh, 0)} %), pero el aire está más caliente y trae más agua.`
          : 'Afuera hay más humedad. Mantenga cerrado.',
      d.ventilar ? 'ok' : 'bad',
    ),
    h('h3', { class: 'h3', text: 'Humedad absoluta' }),
    barras([
      { etiqueta: 'Dentro', valor: d.absDentro, color: 'var(--accent)' },
      { etiqueta: 'Afuera', valor: d.absFuera, color: d.ventilar ? 'var(--ok)' : 'var(--bad)' },
    ], Math.max(d.absDentro, d.absFuera) * 1.25, 'g/m³'),
    h('h3', { class: 'h3', text: 'Riesgo del grano almacenado' }),
    h('div', { class: 'bandrow' },
      ...(['seca', 'segura', 'alta', 'critica'] as BandaRiesgo[]).map((b) => h('div', {
        class: `bandseg ${b === d.banda ? `is-on is-${TONO_BANDA[b]}` : ''}`,
        text: b === 'seca' ? '<60 %' : b === 'segura' ? '60–70 %' : b === 'alta' ? '70–75 %' : '>75 %',
      })),
    ),
    h('p', { class: 'bandnote' },
      pill(NOMBRE_BANDA[d.banda], TONO_BANDA[d.banda]), ' ', EXPLICACION_BANDA[d.banda],
    ),
    h('div', { class: 'rows' },
      fila('Actividad de agua de equilibrio', `${num(d.awEquilibrio, 2)}${inestable(d.awEquilibrio) ? ' · zona de mohos' : ' · estable'}`),
      fila('Humedad de equilibrio del grano', `${num(d.humedadEquilibrio)} %`, 'modelo Cenicafé'),
      fila('Punto de rocío interior', `${num(d.rocioDentro)} °C`),
    ),
    dinero(),
  );
}

function dinero(): HTMLElement {
  const s = store.get();
  const d = diagnosticar(s.dentro, s.fuera);
  const kg = s.cargasBodega * KG_POR_CARGA;
  const hEq = Math.max(0.05, Math.min(0.19, d.humedadEquilibrio / 100));
  const delta = kg - (kg * (1 - 0.11)) / (1 - hEq);

  if (d.banda === 'seca') {
    return money('lose', `Con ${s.cargasBodega} cargas, dejar que el grano se equilibre a esta humedad relativa evapora cerca de <b>${entero(Math.abs(delta))} kg</b> = <b>${cop(Math.abs(delta) * PRECIO_KG)}</b>. Nadie lo roba: se evapora.`);
  }
  if (d.banda === 'segura') {
    return money('good', 'El café almacenado está en rango. Siga controlando la humedad.');
  }
  return money('lose', `El grano está ganando humedad y sale de rango. Valor en riesgo: <b>${cop(kg * PRECIO_KG)}</b> (${entero(s.cargasBodega)} ${s.cargasBodega === 1 ? 'carga' : 'cargas'}).`);
}

export function vistaBodega(): HTMLElement {
  const s = store.get();

  return grid(
    registroBodega(),
    card('Simulador de ventilación',
      'Ajuste las lecturas de adentro y de afuera para saber si conviene ventilar.',
      h('h3', { class: 'h3', text: 'Dentro de la bodega' }),
      h('div', { class: 'stack2' },
        slider({ id: IDS.tIn, label: 'Temperatura', min: 14, max: 34, step: 0.5, value: s.dentro.t, sufijo: ' °C',
          onInput: (t) => store.set((st) => ({ dentro: { ...st.dentro, t } })) }),
        slider({ id: IDS.hIn, label: 'Humedad relativa', min: 35, max: 95, step: 1, value: s.dentro.rh, sufijo: ' %',
          onInput: (rh) => store.set((st) => ({ dentro: { ...st.dentro, rh } })) }),
      ),
      h('h3', { class: 'h3', text: 'Afuera, a la sombra' }),
      h('div', { class: 'stack2' },
        slider({ id: IDS.tOut, label: 'Temperatura', min: 10, max: 36, step: 0.5, value: s.fuera.t, sufijo: ' °C',
          onInput: (t) => store.set((st) => ({ fuera: { ...st.fuera, t } })) }),
        slider({ id: IDS.hOut, label: 'Humedad relativa', min: 25, max: 98, step: 1, value: s.fuera.rh, sufijo: ' %',
          onInput: (rh) => store.set((st) => ({ fuera: { ...st.fuera, rh } })) }),
      ),
      h('h3', { class: 'h3', text: 'Escenarios' }),
      h('div', { class: 'btnrow' },
        ...ESCENARIOS.map((e) => boton(e.nombre, () => aplicar(e), { class: 'btn btn--chip' })),
      ),
      h('h3', { class: 'h3', text: 'Café almacenado' }),
      slider({ label: 'Cargas de 125 kg en bodega', min: 10, max: 600, step: 10,
        value: s.cargasBodega, sufijo: ' cargas', onInput: (v) => store.set({ cargasBodega: v }) }),
      nota('Compare la humedad absoluta (g/m³), no solo el porcentaje. Para calcularla se necesita la temperatura adentro y afuera.'),
    ),

    card('Recomendación', null,
      slot(veredicto),
      callout('Riesgo de deterioro:',
        'grano con más de 12 % de humedad, ambiente sobre 70 % y más de 20 °C. El daño puede no verse en el pergamino. (Cenicafé)'),
    ),

    card('Humedad en las últimas 24 horas',
      `Humedad relativa interior hora a hora. La banda verde es el rango seguro de ${RH_SEGURA_MIN}–${RH_SEGURA_MAX} % que recomienda Cenicafé.`,
      slot(() => franja24(cicloDiario(store.get().dentro).map((c) => c.rh), [RH_SEGURA_MIN, RH_SEGURA_MAX], [30, 100])),
      nota('Los datos se guardan en el equipo y se envían al centro de acopio por la red local, sin internet.'),
    ),

    card('Recomendaciones', null,
      h('div', { class: 'rows' },
        fila('Despache primero el lote más húmedo', ''),
        fila('Separe los lotes por humedad', 'bajo 11 % · 11–12 % · sobre 12 %'),
        fila('Tiempo de almacenamiento', 'cálculo automático'),
        fila('Calibración mensual', 'frascos de sal saturada', 'NaCl 75,3 % · MgCl₂ 32,8 % a 25 °C'),
      ),
    ),
  );
}
