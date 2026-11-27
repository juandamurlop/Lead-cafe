import { h } from '../lib/dom';
import { slot, zonaArrastrable } from '../lib/reactive';
import { curva, fraccionAEjeX } from '../lib/charts';
import { boton, callout, card, fijarSlider, fila, grid, money, nota, readout, slider, tabla } from '../lib/ui';
import { cop, num, pct } from '../lib/fmt';
import {
  PERDIDA_POR_TONELADA_LAVADO, curvaSecado, diaDesdePeso,
  evaluarSecado, muestraParaHumedad, pesoEnDia,
} from '../domain/gravimet';
import { MUESTRA_G, OBJETIVO_G, PRECIO_KG } from '../domain/constants';
import { store, toast } from '../state';
import type { EstadoSecado } from '../domain/gravimet';

const ID_MUESTRA = 'sl-muestra';

const TONO: Record<EstadoSecado, 'ok' | 'warn' | 'bad'> = {
  secando: 'warn', humedo: 'bad', casi: 'warn', listo: 'ok', sobreseco: 'bad',
};

const VEREDICTO: Record<EstadoSecado, string> = {
  secando: 'SECANDO · todavía falta',
  humedo: 'NO LO GUARDE ASÍ',
  casi: 'CASI · falta poco',
  listo: 'LISTO · guarde el café',
  sobreseco: 'SOBRESECADO · está regalando peso',
};

function fijarMuestra(v: number): void {
  const vv = Math.max(96, Math.min(200, v));
  store.set({ muestraG: vv });
  fijarSlider(ID_MUESTRA, Math.round(vv * 2) / 2);
}

function lectura(): HTMLElement {
  const s = store.get();
  const r = evaluarSecado(s.loteLavadoKg, s.muestraG);
  const tono = TONO[r.estado];

  const porque = r.estado === 'secando'
    ? `Van ${num(r.diaEstimado)} días de sol. Faltan unos ${num(r.diasRestantes)} para llegar a 105 g.`
    : r.estado === 'humedo'
      ? `Sobre 12,5 % arrancan los mohos y la ocratoxina. Faltan ${num(r.diasRestantes)} días de sol.`
      : r.estado === 'casi'
        ? 'Está apenas por encima del rango. Un día más de sol.'
        : r.estado === 'listo'
          ? 'Está dentro del rango de comercialización de 10 a 12 %.'
          : 'Por debajo de 10 %, el agua que evaporó eran kilos que le pagaban.';

  const dinero = r.estado === 'sobreseco'
    ? `Regaló <b>${num(r.loteObjetivoKg - r.loteKg)} kg</b> = <b>${cop(Math.abs(r.deltaCOP))}</b> en este solo lote. Nadie se lo descuenta: se evaporó.`
    : r.estado === 'listo'
      ? `Su lote vale <b>${cop(r.loteKg * PRECIO_KG)}</b>. Está en el punto: pare aquí.`
      : r.estado === 'casi' || r.estado === 'humedo'
        ? 'Por encima de 12 % el acopio aplica descuento, y guardado así se daña.'
        : 'Siga revolviendo y pesando una vez al día. La canastilla tiene que llegar a <b>105 g</b>.';

  return h('div', {},
    readout(`${num(r.humedad * 100)} <small>% humedad</small>`, VEREDICTO[r.estado], porque, tono),
    money(r.estado === 'listo' ? 'good' : 'lose', dinero),
    h('div', { class: 'rows' },
      fila('Objetivo de la canastilla', `${num(OBJETIVO_G, 0)} g`),
      fila('Objetivo del lote completo', `${num(r.loteObjetivoKg)} kg`),
      fila('Peso actual del lote', `${num(r.loteKg)} kg`),
      fila('Materia seca', `${num(r.materiaSecaKg)} kg`),
      fila('Días de sol que faltan', r.muestraG <= OBJETIVO_G ? 'ninguno, ya pasó' : num(r.diasRestantes)),
    ),
  );
}

function grafico(): SVGSVGElement {
  const s = store.get();
  const r = evaluarSecado(s.loteLavadoKg, s.muestraG);
  const tono = TONO[r.estado];
  return curva({
    datos: curvaSecado().map((p) => ({ x: p.dia, y: p.peso })),
    xr: [0, 12], yr: [94, 202],
    bandaY: [104, 106],
    marcador: { x: r.diaEstimado, y: r.muestraG },
    colorMarcador: tono === 'ok' ? 'var(--ok)' : tono === 'bad' ? 'var(--bad)' : 'var(--warn)',
    ticksX: [0, 3, 6, 9, 12],
    ticksY: [200, 160, 120],
    etiquetaX: 'días de sol  ·  arrastre sobre la gráfica',
  });
}

export function vistaSecado(): HTMLElement {
  const s = store.get();

  return grid(
    card('Método Gravimet, de Cenicafé',
      'Aparte 200 g de pergamino lavado en una canastilla, séquela junto al lote y pésela cada día. El peso indica cuánta humedad queda.',
      h('div', { class: 'stack' },
        slider({
          label: 'Pergamino lavado del lote', min: 20, max: 400, step: 5,
          value: s.loteLavadoKg, sufijo: ' kg',
          onInput: (v) => store.set({ loteLavadoKg: v }),
        }),
        slider({
          id: ID_MUESTRA,
          label: 'Peso de la canastilla hoy', min: 96, max: 200, step: 0.5,
          value: Math.round(s.muestraG * 2) / 2, sufijo: ' g',
          onInput: (v) => store.set({ muestraG: v }),
        }),
      ),
      h('div', { class: 'btnrow' },
        boton('☀ Simular un día de sol', () => {
          const d = Math.min(12, diaDesdePeso(store.get().muestraG) + 1);
          fijarMuestra(pesoEnDia(d));
          const e = evaluarSecado(store.get().loteLavadoKg, store.get().muestraG);
          if (e.estado === 'listo') toast('La canastilla llegó al rango. Guarde el café.', 'ok');
          if (e.estado === 'sobreseco') toast('¡Alarma! Bajó de 104 g: está regalando peso.', 'bad');
        }),
        boton('↺ Volver al día 0', () => fijarMuestra(MUESTRA_G), { class: 'btn btn--ghost' }),
        boton('Llevar al 11 %', () => fijarMuestra(muestraParaHumedad(0.11)), { class: 'btn btn--ghost' }),
      ),
      callout('Meta:',
        'entre 104 y 106 g (10 % a 12 % de humedad, rango de comercialización). Fuente: Cenicafé.'),
    ),

    card('Estado del secado', null,
      slot(lectura),
      h('h3', { class: 'h3', text: 'Curva de secado' }),
      zonaArrastrable(grafico, (f) => fijarMuestra(pesoEnDia(fraccionAEjeX(f, [0, 12])))),
      nota('Banda verde: meta de 104 a 106 g. Por debajo de 104 g, el café está sobresecado y pierde peso.'),
    ),

    card('Pérdida por sobresecado',
      'Kilos de pergamino seco que se pierden por cada 1.000 kg de café lavado, frente a una humedad final de 11 %. Fuente: Cenicafé.',
      tabla(['Si para en', 'Pierde', 'Al precio del 25-nov-2026'],
        PERDIDA_POR_TONELADA_LAVADO.map((p) => [`${num(p.humedad)} %`, `${num(p.kg)} kg`, cop(p.kg * PRECIO_KG)])),
      nota('1.000 kg de café lavado equivalen a unas 4 cargas de pergamino seco.'),
    ),

    card('Equipo necesario', null,
      h('div', { class: 'rows' },
        fila('Instrumento', 'balanza digital de 0,1 g', 'COP 40.000 a 90.000'),
        fila('Conexión necesaria', 'ninguna'),
        fila('Energía', 'dos pilas AAA'),
        fila('Humedad del pergamino lavado', pct(0.5328)),
        fila('Error contra el método de estufa', '0,09 % a 1,92 %'),
      ),
      nota('Un medidor electrónico para pergamino cuesta entre COP 1,5 y 3 millones. La balanza digital es más económica y no necesita señal.'),
    ),
  );
}
