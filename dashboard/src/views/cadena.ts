import { h } from '../lib/dom';
import { slot } from '../lib/reactive';
import { card, grid, nota, pill } from '../lib/ui';
import { entero, num } from '../lib/fmt';
import type { Base } from '../data/db';
import type { EstadoExpediente } from '../data/tipos';
import { store } from '../state';

const W = 660, H = 556;
const COL_X = [34, 248, 450, 606];
const GAP = 7;

const TONO: Record<EstadoExpediente, 'ok' | 'warn' | 'bad'> = {
  COMPLETO: 'ok', REVISAR: 'warn', BLOQUEADO: 'bad',
};

interface Nodo {
  id: string; etiqueta: string; sub: string; kg: number;
  col: number; y: number; alto: number; tono?: 'ok' | 'warn' | 'bad';
}

interface Enlace { de: Nodo; a: Nodo; kg: number; y0: number; y1: number; tono?: string }

/** Recorta una etiqueta al ancho disponible del nodo. */
function corto(s: string, max = 15): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function cinta(x0: number, y0: number, x1: number, y1: number, grosor: number): string {
  const xm = (x0 + x1) / 2;
  return `M${x0} ${y0}C${xm} ${y0},${xm} ${y1},${x1} ${y1}`
    + `L${x1} ${y1 + grosor}C${xm} ${y1 + grosor},${xm} ${y0 + grosor},${x0} ${y0 + grosor}Z`;
}

function construirRed(b: Base) {
  const total = b.raw.lotes.reduce((a, l) => a + l.kg, 0);
  const util = H - 128;
  const escala = (kg: number) => (kg / total) * util;

  // columna 0: zonas
  const zonas = b.zonas.filter((z) => z.kg > 0);
  // columna 1: acopios
  const acopios = b.acopios.filter((a) => a.kg > 0);

  // kg por (zona, acopio)
  const flujoZA = new Map<string, number>();
  for (const f of b.raw.fincas) {
    const kg = b.kgDeFinca(f.id);
    if (!kg) continue;
    const k = `${f.departamento}|${f.coopId}`;
    flujoZA.set(k, (flujoZA.get(k) ?? 0) + kg);
  }

  // kg por acopio y estado
  const flujoAE = new Map<string, number>();
  for (const e of b.raw.expediente) {
    const lote = b.raw.lotes.find((l) => l.id === e.loteId);
    if (!lote) continue;
    const apto = e.estado === 'COMPLETO' ? 'APTO' : 'NOAPTO';
    flujoAE.set(`${e.coopId}|${apto}`, (flujoAE.get(`${e.coopId}|${apto}`) ?? 0) + lote.kg);
  }

  const nodos: Nodo[] = [];
  const poner = (lista: Array<{ id: string; etiqueta: string; sub: string; kg: number; tono?: 'ok' | 'warn' | 'bad' }>, col: number) => {
    let y = 46;
    for (const it of lista) {
      const alto = Math.max(5, escala(it.kg));
      nodos.push({ ...it, col, y, alto });
      y += alto + GAP;
    }
  };

  poner(zonas.map((z) => ({
    id: `Z:${z.nombre}`, etiqueta: z.nombre,
    sub: `${z.fincas.length} fincas`, kg: z.kg,
  })), 0);

  poner(acopios.map((a) => ({
    id: `A:${a.id}`, etiqueta: a.id,
    sub: `${a.fincasIds.length} fincas`, kg: a.kg,
  })), 1);

  const kgApto = [...flujoAE].filter(([k]) => k.endsWith('APTO') && !k.endsWith('NOAPTO'))
    .reduce((a, [, v]) => a + v, 0);
  const kgNo = total - kgApto;

  poner([{ id: 'X:LAURA', etiqueta: 'Exportadora', sub: 'Laura · Buenaventura', kg: total }], 2);
  poner([
    { id: 'D:APTO', etiqueta: 'Apto UE', sub: 'expediente completo', kg: kgApto, tono: 'ok' },
    { id: 'D:NO', etiqueta: 'No apto', sub: 'revisar o bloqueado', kg: kgNo, tono: 'bad' },
  ], 3);

  const byId = new Map(nodos.map((n) => [n.id, n]));
  const enlaces: Enlace[] = [];
  const cursor = new Map<string, number>();
  const avanzar = (id: string, base: number, d: number) => {
    const c = cursor.get(id) ?? base;
    cursor.set(id, c + d);
    return c;
  };

  for (const [k, kg] of [...flujoZA].sort((a, b2) => b2[1] - a[1])) {
    const [zona, coop] = k.split('|');
    const de = byId.get(`Z:${zona}`), a = byId.get(`A:${coop}`);
    if (!de || !a) continue;
    const g = escala(kg);
    enlaces.push({ de, a, kg, y0: avanzar(de.id, de.y, g), y1: avanzar(a.id, a.y, g) });
  }
  const laura = byId.get('X:LAURA')!;
  for (const a of acopios) {
    const de = byId.get(`A:${a.id}`);
    if (!de) continue;
    const g = escala(a.kg);
    enlaces.push({
      de, a: laura, kg: a.kg,
      y0: avanzar(`${de.id}:out`, de.y, g), y1: avanzar(laura.id, laura.y, g),
    });
  }
  for (const [id, kg, tono] of [['D:APTO', kgApto, 'ok'], ['D:NO', kgNo, 'bad']] as const) {
    const dest = byId.get(id);
    if (!dest || kg <= 0) continue;
    const g = escala(kg);
    enlaces.push({
      de: laura, a: dest, kg,
      y0: avanzar(`${laura.id}:out`, laura.y, g), y1: avanzar(dest.id, dest.y, g),
      tono,
    });
  }

  return { nodos, enlaces, total, kgApto, kgNo };
}

function dibujarRed(b: Base): SVGSVGElement {
  const { nodos, enlaces } = construirRed(b);
  const sel = store.get().nodoSel;
  const kids: Element[] = [];

  const titulos = ['Caficultores', 'Centros de acopio', 'Exportador', 'Destino'];
  titulos.forEach((t, i) => {
    kids.push(h('text', { x: COL_X[i], y: 26, class: 'red-col', text: t }));
  });

  for (const e of enlaces) {
    const activo = !sel || e.de.id === sel || e.a.id === sel;
    kids.push(h('path', {
      d: cinta(COL_X[e.de.col] + 110, e.y0, COL_X[e.a.col], e.y1, Math.max(4, (e.de.alto * e.kg) / (e.de.kg || 1))),
      class: `cinta ${activo ? '' : 'is-off'} ${e.tono ? `cinta--${e.tono}` : ''}`,
    }, h('title', { text: `${e.de.etiqueta} → ${e.a.etiqueta}: ${entero(e.kg)} kg` })));
  }

  for (const n of nodos) {
    const activo = !sel || n.id === sel;
    kids.push(h('g', {
      class: `rednodo ${activo ? '' : 'is-off'} ${n.tono ? `rednodo--${n.tono}` : ''}`,
      onClick: () => store.set({ nodoSel: sel === n.id ? null : n.id }),
    },
      h('rect', { x: COL_X[n.col], y: n.y, width: 110, height: n.alto, rx: 4, class: 'rednodo-r' }),
      h('text', { x: COL_X[n.col] + 6, y: n.y + Math.min(14, n.alto / 2 + 4), class: 'rednodo-t', text: corto(n.etiqueta) }),
      n.alto > 26 && h('text', { x: COL_X[n.col] + 6, y: n.y + 28, class: 'rednodo-s', text: `${entero(n.kg)} kg` }),
      h('title', { text: `${n.etiqueta} · ${n.sub} · ${entero(n.kg)} kg` }),
    ));
  }

  return h('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'red', role: 'img',
    'aria-label': 'Flujo de volumen desde los caficultores hasta el destino',
  }, ...kids) as unknown as SVGSVGElement;
}

function seguimientoLote(b: Base): HTMLElement {
  const s = store.get();
  const lote = b.raw.lotes.find((l) => l.id === s.loteSel) ?? b.raw.lotes[0];
  const exp = b.expedientePorLote.get(lote.id);
  const finca = b.fincaPorId.get(lote.fincaId)!;
  const coop = b.coopPorId.get(lote.coopId);
  const est: EstadoExpediente = exp?.estado ?? 'REVISAR';

  const etapas = [
    { n: '1', t: 'Cosecha en finca', f: `${lote.inicio} → ${lote.fin}`, q: `${finca.nombre} · ${finca.vereda}, ${finca.municipio}`, actor: finca.titular },
    { n: '2', t: 'Beneficio', f: lote.fin, q: lote.beneficio, actor: finca.titular },
    { n: '3', t: 'Entrega al acopio', f: lote.entrega, q: `${entero(lote.kg)} kg · sacos ${lote.sacoIni}–${lote.sacoFin} · humedad ${num(lote.humedad, 1)} %`, actor: coop?.nombre ?? 'Entrega directa' },
    { n: '4', t: 'Expediente EUDR', f: String(b.raw.parametros['fecha_corte_calculo'] ?? ''), q: exp ? `${exp.estado}${exp.motivos.length ? ': ' + exp.motivos.join('; ') : ''}` : '—', actor: 'Laura · exportadora' },
  ];

  return h('div', {},
    h('label', { class: 'sel' },
      h('span', { text: 'Seguir un lote' }),
      h('select', {
        class: 'sel-i',
        onChange: (e: Event) => store.set({ loteSel: (e.target as HTMLSelectElement).value }),
      }, ...b.raw.lotes.map((l) => h('option', {
        value: l.id, selected: l.id === lote.id ? 'selected' : undefined,
        text: `${l.id} · ${b.fincaPorId.get(l.fincaId)?.nombre ?? ''} · ${entero(l.kg)} kg`,
      }))),
    ),
    h('div', { class: 'etapas' }, ...etapas.map((e, i) => h('div', { class: 'etapa' },
      h('span', { class: `etapa-n ${i === 3 ? `etapa-n--${TONO[est]}` : ''}`, text: e.n }),
      h('div', {},
        h('strong', { text: e.t }),
        h('span', { class: 'etapa-f', text: e.f }),
        h('p', { class: 'etapa-q', text: e.q }),
        h('span', { class: 'etapa-a', text: e.actor }),
      ),
    ))),
  );
}

export function vistaCadena(b: Base): HTMLElement {
  const { total, kgApto, kgNo } = construirRed(b);
  return grid(
    h('section', { class: 'card card--mapa' },
      h('header', { class: 'card-h' },
        h('h2', { text: 'La cadena, etapa por etapa' }),
        h('p', { class: 'card-sub', text: 'El ancho de cada cinta es el volumen real de la base. Toque un nodo para aislar su flujo.' }),
      ),
      slot(() => dibujarRed(b)),
      h('p', { class: 'leyenda' },
        pill(`${entero(total)} kg en total`, 'neutro'),
        pill(`${entero(kgApto)} kg aptos`, 'ok'),
        pill(`${entero(kgNo)} kg retenidos`, 'bad'),
      ),
      nota('«No apto» no significa que el café sea malo: significa que el expediente todavía no sostiene una declaración. La mayoría se resuelve con un papel o una firma, no cambiando de proveedor.'),
    ),
    card('Trazabilidad de un lote', 'Las cuatro etapas por las que pasa el café, con las fechas y los responsables que exige el EUDR.',
      slot(() => seguimientoLote(b)),
    ),
  );
}
