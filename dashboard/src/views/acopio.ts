import { h } from '../lib/dom';
import { slot } from '../lib/reactive';
import { boton, callout, card, fila, grid, nota, pill, readout, slider } from '../lib/ui';
import { cop, entero, horas, mmss, num } from '../lib/fmt';
import { liquidar } from '../domain/pricing';
import { RED_TEXTO, store, toast } from '../state';
import type { EntregaViva, Red } from '../state';
import type { Base } from '../data/db';

/** Presupuesto de tiempo por entrega, en segundos. Estimación a cronometrar en campo. */
const SEG_CUADERNO = 450;
const SEG_CAFETO_BASE = 190;
const SEG_MEDIR_HUMEDAD = 45;

const CHECK: Record<Red, { marca: string; clase: string; texto: string }> = {
  0: { marca: '✓', clase: 'c1', texto: 'guardado en el teléfono · espera el QR o la mula' },
  1: { marca: '✓✓', clase: 'c2', texto: 'enviado por SMS, un solo mensaje' },
  2: { marca: '✓✓', clase: 'c2', texto: 'subido en el lote comprimido' },
  3: { marca: '✓✓', clase: 'c3', texto: 'sincronizado y visible para el comprador' },
};

/** Cola de la jornada, armada con lotes reales de la base. */
function cola(b: Base): EntregaViva[] {
  const out: EntregaViva[] = [];
  const lotes = b.raw.lotes.filter((l) => l.coopId === 'COOP-03').slice(0, 5);
  for (const l of lotes) {
    const f = b.fincaPorId.get(l.fincaId);
    if (!f) continue;
    out.push({
      loteId: l.id, fincaId: f.id, nombre: f.titular, finca: f.nombre,
      kg: l.kg, humedad: l.humedad / 100, hectareas: f.areaSembradaHa,
      trazado: f.consentimiento === 'SI', sacoId: `SC-${l.sacoIni}`,
    });
  }
  out.splice(3, 0, {
    loteId: '—', fincaId: '', nombre: 'Comprador de paso', finca: 'origen sin verificar',
    kg: 95, humedad: 0.129, hectareas: 0, trazado: false, sacoId: '—',
  });
  return out;
}

function bytesDemo(seq: number): string {
  let x = (seq * 2654435761) >>> 0;
  const out: string[] = [];
  for (let i = 0; i < 48; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    out.push(((x >>> 16) & 255).toString(16).padStart(2, '0'));
  }
  return out.join(' ');
}

function ventanilla(b: Base): HTMLElement {
  const s = store.get();
  const q = cola(b);
  const siguiente = q[s.cursorEntrega % q.length];
  const ultima = s.cursorEntrega > 0 ? q[(s.cursorEntrega - 1) % q.length] : null;
  const ahorro = s.segViejo - s.segNuevo;

  return h('div', {},
    h('div', { class: 'next' },
      h('span', { class: 'next-l', text: 'Siguiente en la fila' }),
      h('strong', { class: 'next-n', text: siguiente.nombre }),
      h('span', { class: 'next-m', text: `${num(siguiente.kg)} kg · ${siguiente.trazado ? siguiente.sacoId : 'sin QR'}` }),
    ),
    h('h3', { class: 'h3', text: 'Tiempo acumulado en la ventanilla' }),
    h('div', { class: 'rows' },
      fila('Con cuaderno y efectivo', mmss(s.segViejo)),
      fila('Con Cafeto', mmss(s.segNuevo)),
      fila('Tiempo devuelto a Hernán', ahorro > 0 ? horas(ahorro) : '0 min', 'proyectado a 120 entregas/día: ~1 h'),
    ),
    nota('Los tiempos con cuaderno son estimación nuestra. El primer trabajo del piloto es cronometrar la ventanilla real durante una semana.'),
    h('h3', { class: 'h3', text: 'El registro que viajó' }),
    h('pre', { class: 'bytes', text: ultima ? bytesDemo(s.cursorEntrega) : '—' }),
    nota('48 bytes: finca, secuencia, fecha, peso, humedad, delta de GPS y firma. En base32 son 77 caracteres: cabe en un solo SMS de 160.'),
  );
}

function liquidacion(b: Base): HTMLElement {
  const s = store.get();
  const q = cola(b);
  const ultima = s.cursorEntrega > 0 ? q[(s.cursorEntrega - 1) % q.length] : null;
  if (!ultima) return nota('Pulse «Escanear la siguiente tula» para ver el desglose.');

  const liq = liquidar({
    kg: ultima.kg, factor: 94, humedad: ultima.humedad,
    premioPorCarga: s.premioPorCarga, trazado: ultima.trazado,
  });

  return h('div', {},
    h('p', { class: 'panel-h', text: `${ultima.nombre} · ${ultima.finca} · ${ultima.sacoId}` }),
    liq.rechazado
      ? readout('RECHAZADO', 'No se recibe', liq.motivoRechazo ?? '', 'bad')
      : readout(cop(liq.total), `${entero(liq.porKg)} COP por kilo`,
          `${num(ultima.kg)} kg · humedad ${num(ultima.humedad * 100)} %`,
          ultima.trazado ? 'ok' : 'warn'),
    !liq.rechazado && h('div', { class: 'rows' },
      ...liq.lineas.map((l) => h('div', { class: `row ${l.destacar ? 'row--mark' : ''}` },
        h('span', { class: 'row-k', text: l.concepto },
          l.nota ? h('em', { class: 'row-n', text: l.nota }) : null as never),
        h('span', { class: `row-v ${l.valor < 0 ? 'is-neg' : ''}`, text: cop(l.valor) }),
      )),
    ),
  );
}

function loteAbierto(): HTMLElement {
  const s = store.get();
  const kg = s.entregas.reduce((a, e) => a + e.kg, 0);
  const predios = new Set(s.entregas.map((e) => e.fincaId)).size;
  return h('div', {},
    readout(
      `${entero(kg)} <small>kg</small>`,
      s.loteCerrado ? 'Cerrado y conciliado' : 'Lote abierto',
      `${predios} predios declarados · ${s.rechazadas} entregas desviadas a la pila sin trazar`,
      s.loteCerrado ? 'ok' : 'neutro',
    ),
    s.entregas.length
      ? h('div', { class: 'list' }, ...s.entregas.map((e) => h('div', { class: 'item' },
          h('div', {},
            h('strong', { text: e.nombre }),
            h('span', { class: 'item-m', text: `${e.finca} · ${num(e.hectareas, 2)} ha · ${num(e.humedad * 100)} % humedad` }),
          ),
          h('span', { class: 'item-kg', text: `${entero(e.kg)} kg` }),
        )))
      : nota('Vacío.'),
  );
}

function colaSync(): HTMLElement {
  const s = store.get();
  if (!s.entregas.length) return nota('Nada pendiente.');
  const c = CHECK[s.red];
  return h('div', { class: 'list' }, ...s.entregas.map((e) => h('div', { class: 'item' },
    h('span', { class: `chk ${c.clase}`, text: c.marca }),
    h('div', {},
      h('strong', { text: e.nombre }),
      h('span', { class: 'item-m', text: c.texto }),
    ),
    h('span', { class: 'item-kg', text: `${entero(e.kg)} kg` }),
  )));
}

export function vistaAcopio(b: Base): HTMLElement {
  const escanear = () => {
    const st = store.get();
    if (st.loteCerrado) { toast('El lote está cerrado. Reinicie la jornada.', 'warn'); return; }
    const q = cola(b);
    const e = q[st.cursorEntrega % q.length];
    const porMuestreo = e.trazado && st.cursorEntrega % 3 !== 1;

    store.set({
      cursorEntrega: st.cursorEntrega + 1,
      segViejo: st.segViejo + SEG_CUADERNO,
      segNuevo: st.segNuevo + SEG_CAFETO_BASE + (porMuestreo ? 0 : SEG_MEDIR_HUMEDAD),
      entregas: e.trazado ? [...st.entregas, e] : st.entregas,
      rechazadas: e.trazado ? st.rechazadas : st.rechazadas + 1,
    });

    if (!e.trazado) toast('Entrega sin finca verificada: va a la pila sin trazar.', 'bad');
    else if (e.humedad > 0.12) toast(`${e.nombre}: humedad ${num(e.humedad * 100)} %. Se aplica descuento.`, 'warn');
    else toast(`${e.nombre} · ${entero(e.kg)} kg sumados al lote.`, 'ok');
  };

  return grid(
    card('La ventanilla', 'Cada entrega que llega con QR se registra sola. La trazabilidad no es un paso adicional: es consecuencia del escaneo que ya hizo.',
      h('div', { class: 'btnrow' },
        boton('⚡ Escanear la siguiente tula', escanear),
        boton('Cerrar el lote', () => {
          if (!store.get().entregas.length) { toast('El lote está vacío.', 'warn'); return; }
          store.set({ loteCerrado: true });
          toast('Lote cerrado y conciliado contra el peso del silo.', 'ok');
        }, { class: 'btn btn--ghost' }),
        boton('Reiniciar jornada', () => store.set({
          entregas: [], rechazadas: 0, segViejo: 0, segNuevo: 0, cursorEntrega: 0, loteCerrado: false,
        }), { class: 'btn btn--ghost' }),
      ),
      slot(() => ventanilla(b)),
    ),

    card('Liquidación de la última entrega', 'Con el precio interno de referencia de la FNC del 25 de noviembre de 2026.',
      slot(() => liquidacion(b)),
      h('h3', { class: 'h3', text: 'Premio por trazabilidad' }),
      slider({
        label: 'COP por carga que recibe el caficultor', min: 0, max: 200_000, step: 10_000,
        value: store.get().premioPorCarga, sufijo: ' COP',
        onInput: (v) => store.set({ premioPorCarga: v }),
      }),
      callout('Por qué va como línea separada:',
        'un premio mezclado en el precio no se puede verificar, y la experiencia de las certificaciones sugiere que a menudo no llega abajo.'),
    ),

    card('Lote de acopio del día', 'No hay que separar el café de cada finca. Hay que saber qué predios aportaron.',
      slot(loteAbierto),
      callout('Separación física por estatus, no por finca:',
        'el EUDR no permite mezclar café libre de deforestación con café de origen desconocido. Dos pilas, no trescientas.'),
    ),

    card('Cola de sincronización', null,
      slot(() => h('div', {},
        h('p', { class: 'panel-h', text: RED_TEXTO[store.get().red].detalle }),
        colaSync(),
      )),
      h('p', { class: 'leyenda' },
        pill('✓ en el teléfono', 'neutro'), pill('✓✓ en el acopio', 'neutro'), pill('✓✓ lo vio el comprador', 'ok'),
      ),
      nota('Es el modelo mental de WhatsApp. Estar sin señal nunca se muestra como error: es el estado normal de la vereda.'),
    ),
  );
}
