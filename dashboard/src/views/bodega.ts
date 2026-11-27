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
  { nombre: 'La trampa clásica', dentro: { t: 22, rh: 70 }, fuera: { t: 30, rh: 60 } },
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
          ? `Aunque afuera marque ${num(s.fuera.rh, 0)} % contra ${num(s.dentro.rh, 0)} % adentro, por la temperatura trae más gramos de agua por metro cúbico.`
          : 'Afuera hay más humedad. Mantenga cerrado.',
      d.ventilar ? 'ok' : 'bad',
    ),
    d.trampa ? h('div', { class: 'alerta' },
      h('strong', { text: '⚠ Caso contraintuitivo. ' }),
      'Comparar porcentajes engaña: lo que decide es la humedad absoluta, y para eso hace falta temperatura en los dos lados.',
    ) : h('div', {}),
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
      fila('Hacia qué humedad tiende el grano', `${num(d.humedadEquilibrio)} %`, 'modelo Cenicafé'),
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
    return money('good', `Con ${s.cargasBodega} cargas no está perdiendo peso ni calidad. Puede aguantar semanas esperando mejor precio.`);
  }
  return money('lose', `Con ${s.cargasBodega} cargas el grano gana agua y sale de rango. El riesgo no es el peso: es perder <b>${cop(kg * PRECIO_KG)}</b> de café para el mercado europeo.`);
}

export function vistaBodega(): HTMLElement {
  const s = store.get();

  return grid(
    registroBodega(),
    card('Instrumento de ventilación',
      'Simula una lectura interior y otra exterior para comparar las condiciones del aire.',
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
      callout('Por qué no basta mirar el porcentaje de afuera:',
        'si el aire exterior trae más gramos de agua por metro cúbico, ventilar empeora el problema aunque su humedad relativa sea menor. Lo que se compara es la humedad absoluta, y eso exige temperatura en los dos lados.'),
    ),

    card('Lo que ve Hernán en la pared', 'Una palabra. Sin gráficas ni interpretación.',
      slot(veredicto),
      callout('Cenicafé advierte:',
        'con humedad del grano sobre 12 %, ambiente sobre 70 % y más de 20 °C se acelera el deterioro de la bebida. Y la apariencia del pergamino puede seguir siendo normal mientras la almendra se decolora por dentro.'),
    ),

    card('Las 24 horas que registró el nodo',
      `Humedad relativa interior hora a hora. La banda verde es el rango seguro de ${RH_SEGURA_MIN}–${RH_SEGURA_MAX} % que recomienda Cenicafé.`,
      slot(() => franja24(cicloDiario(store.get().dentro).map((c) => c.rh), [RH_SEGURA_MIN, RH_SEGURA_MAX], [30, 100])),
      nota('El nodo guarda el registro en tarjeta SD y lo entrega al nodo de acopio por WiFi local. No necesita internet en ningún momento.'),
    ),

    card('Tres decisiones que el dato habilita', null,
      h('div', { class: 'rows' },
        fila('Despachar por riesgo', 'el más húmedo sale primero', 'no el más viejo'),
        fila('No mezclar bandas', 'bajo 11 % · 11–12 % · sobre 12 %', 'el promedio tranquiliza y engaña'),
        fila('Cuánto puede aguantar', 'lo calcula el nodo', 'convierte una corazonada en un número'),
        fila('Calibración mensual', 'frascos de sal saturada', 'NaCl 75,3 % · MgCl₂ 32,8 % a 25 °C'),
      ),
    ),
  );
}
