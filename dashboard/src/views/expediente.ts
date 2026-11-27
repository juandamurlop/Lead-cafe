import { h } from '../lib/dom';
import { slot } from '../lib/reactive';
import { anillo } from '../lib/charts';
import { boton, card, grid, kpi, nota, pill } from '../lib/ui';
import { entero, num } from '../lib/fmt';
import type { Base } from '../data/db';
import type { EstadoExpediente, FilaExpediente } from '../data/tipos';
import { store, toast } from '../state';

const TONO: Record<EstadoExpediente, 'ok' | 'warn' | 'bad'> = {
  COMPLETO: 'ok', REVISAR: 'warn', BLOQUEADO: 'bad',
};

function filtrar(b: Base): FilaExpediente[] {
  const s = store.get();
  const txt = s.filtroTexto.trim().toLowerCase();
  return b.raw.expediente.filter((e) => {
    if (s.filtroEstado !== 'TODOS' && e.estado !== s.filtroEstado) return false;
    if (!txt) return true;
    const f = b.fincaPorId.get(e.fincaId);
    return [e.loteId, e.fincaId, f?.nombre, f?.titular, f?.municipio, f?.departamento, e.coopId]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(txt));
  });
}

function kgDe(b: Base, filas: FilaExpediente[]): number {
  return filas.reduce((a, e) => a + (b.raw.lotes.find((l) => l.id === e.loteId)?.kg ?? 0), 0);
}

function conteoMotivos(b: Base): Array<{ motivo: string; lotes: number; kg: number }> {
  const m = new Map<string, { lotes: number; kg: number }>();
  for (const e of b.raw.expediente) {
    const kg = b.raw.lotes.find((l) => l.id === e.loteId)?.kg ?? 0;
    for (const mot of e.motivos) {
      const cur = m.get(mot) ?? { lotes: 0, kg: 0 };
      cur.lotes++; cur.kg += kg;
      m.set(mot, cur);
    }
  }
  return [...m].map(([motivo, v]) => ({ motivo, ...v })).sort((a, b2) => b2.kg - a.kg);
}

function barraMotivos(b: Base): HTMLElement {
  const items = conteoMotivos(b);
  const max = Math.max(...items.map((i) => i.kg), 1);
  return h('div', { class: 'motbars' }, ...items.map((i) => h('button', {
    class: 'motbar', type: 'button',
    onClick: () => { store.set({ filtroTexto: '', filtroEstado: 'TODOS' }); toast(`${i.lotes} lotes afectados por: ${i.motivo}`, 'warn'); },
  },
    h('span', { class: 'motbar-l', text: i.motivo }),
    h('span', { class: 'motbar-t' },
      h('span', { class: 'motbar-f', style: `width:${(i.kg / max) * 100}%` }),
    ),
    h('span', { class: 'motbar-v', text: `${i.lotes} lotes · ${entero(i.kg)} kg` }),
  )));
}

function tablaLotes(b: Base): HTMLElement {
  const filas = filtrar(b).slice(0, 80);
  if (!filas.length) return nota('Ningún lote coincide con el filtro.');
  return h('div', { class: 'tblwrap' },
    h('table', { class: 'tbl tbl--datos' },
      h('thead', {}, h('tr', {},
        ...['Lote', 'Finca', 'Titular', 'Acopio', 'kg', 'Satélite', 'Estado', 'Motivos'].map((c) => h('th', { text: c })),
      )),
      h('tbody', {}, ...filas.map((e) => {
        const f = b.fincaPorId.get(e.fincaId);
        const l = b.raw.lotes.find((x) => x.id === e.loteId);
        return h('tr', {
          class: `fila fila--${TONO[e.estado]}`,
        },
          h('td', { class: 'mono', text: e.loteId }),
          h('td', { text: f?.nombre ?? e.fincaId }),
          h('td', { text: f?.titular ?? '—' }),
          h('td', { class: 'mono', text: e.coopId }),
          h('td', { class: 'num', text: entero(l?.kg ?? 0) }),
          h('td', {}, h('span', {
            class: `dot dot--${e.satelital === 'Sin deforestación' ? 'ok' : e.satelital === 'Alerta - revisar' ? 'warn' : 'bad'}`,
            title: e.satelital,
          })),
          h('td', {}, pill(e.estado, TONO[e.estado])),
          h('td', { class: 'motcell', text: e.motivos.join(' · ') || '—' }),
        );
      })),
    ),
  );
}

function cabecera(b: Base): HTMLElement {
  const s = store.get();
  const filas = filtrar(b);
  const total = b.raw.expediente.length;
  const comp = b.raw.expediente.filter((e) => e.estado === 'COMPLETO');
  const rev = b.raw.expediente.filter((e) => e.estado === 'REVISAR');
  const blo = b.raw.expediente.filter((e) => e.estado === 'BLOQUEADO');

  const botonFiltro = (val: EstadoExpediente | 'TODOS', etiqueta: string) => h('button', {
    class: `fbtn ${s.filtroEstado === val ? 'is-on' : ''}`, type: 'button',
    onClick: () => store.set({ filtroEstado: val }),
    text: etiqueta,
  });

  return h('div', {},
    h('div', { class: 'kpis kpis--4' },
      kpi('Lotes aptos', `${comp.length}`, `${Math.round((comp.length / total) * 100)} % · ${entero(kgDe(b, comp))} kg`, 'ok'),
      kpi('Por revisar', `${rev.length}`, `${entero(kgDe(b, rev))} kg retenidos`, 'warn'),
      kpi('Bloqueados', `${blo.length}`, `${entero(kgDe(b, blo))} kg`, 'bad'),
      kpi('Volumen total', `${entero(b.meta().kgTotal / 1000)} t`, `${b.meta().nFincas} fincas · ${total} lotes`, 'neutro'),
    ),
    h('div', { class: 'filtros' },
      botonFiltro('TODOS', 'Todos'),
      botonFiltro('COMPLETO', 'Completos'),
      botonFiltro('REVISAR', 'Revisar'),
      botonFiltro('BLOQUEADO', 'Bloqueados'),
      h('input', {
        class: 'buscar', type: 'search', placeholder: 'Buscar finca, titular, municipio…',
        value: s.filtroTexto,
        onInput: (e: Event) => store.set({ filtroTexto: (e.target as HTMLInputElement).value }),
      }),
      h('span', { class: 'fcount', text: `${filas.length} de ${total}` }),
    ),
  );
}

export function vistaExpediente(b: Base): HTMLElement {
  const total = b.raw.expediente.length;
  const comp = b.raw.expediente.filter((e) => e.estado === 'COMPLETO').length;

  return grid(
    h('section', { class: 'card card--ancho' },
      h('header', { class: 'card-h' },
        h('h2', { text: 'Expediente EUDR' }),
        h('p', { class: 'card-sub', text: 'Revise el estado de cada lote.' }),
      ),
      slot(() => cabecera(b)),
      slot(() => tablaLotes(b)),
    ),

    card('Motivos de retención', 'Ordenados por kilos afectados.',
      h('div', { class: 'ring-wrap' },
        anillo((comp / total) * 100, 'lotes aptos'),
        h('div', { class: 'ring-side' },
          h('div', { class: 'mini' }, h('strong', { text: String(b.meta().nFincas) }), h('span', { text: 'fincas' })),
          h('div', { class: 'mini' }, h('strong', { text: String(b.acopios.length) }), h('span', { text: 'centros de acopio' })),
          h('div', { class: 'mini' }, h('strong', { text: String(b.zonas.length) }), h('span', { text: 'departamentos' })),
        ),
      ),
      barraMotivos(b),
    ),

    card('Exportar para el Sistema de Información', 'Predios de los lotes filtrados, en formato GeoJSON.',
      slot(() => {
        const filas = filtrar(b);
        const ids = [...new Set(filas.map((e) => e.fincaId))];
        const fc = {
          type: 'FeatureCollection',
          features: ids.slice(0, 50).map((id) => {
            const f = b.fincaPorId.get(id)!;
            const kg = filas.filter((e) => e.fincaId === id)
              .reduce((a, e) => a + (b.raw.lotes.find((l) => l.id === e.loteId)?.kg ?? 0), 0);
            return {
              type: 'Feature',
              properties: {
                ProducerName: f.titular, ProducerCountry: 'CO',
                ProductionPlace: f.nombre, Area: f.areaTotalHa,
                QuantityKg: Number(kg.toFixed(1)),
              },
              geometry: f.anillo.length >= 4
                ? { type: 'Polygon', coordinates: [f.anillo] }
                : { type: 'Point', coordinates: [Number(f.lon.toFixed(6)), Number(f.lat.toFixed(6))] },
            };
          }),
        };
        const txt = JSON.stringify(fc, null, 2);
        return h('div', {},
          h('p', { class: 'panel-h', text: `${ids.length} predios · ${entero(kgDe(b, filas))} kg` }),
          h('pre', { class: 'code code--alto', text: txt.slice(0, 1800) + (txt.length > 1800 ? '\n…' : '') }),
          h('div', { class: 'btnrow' },
            boton('Copiar GeoJSON completo', () => {
              navigator.clipboard?.writeText(txt)
                .then(() => toast('GeoJSON copiado al portapapeles.', 'ok'))
                .catch(() => toast('El navegador no permitió copiar.', 'warn'));
            }),
          ),
          nota(`Incluye el polígono de cada predio cuando está disponible. Área promedio: ${num(b.raw.fincas.reduce((a, f) => a + f.areaTotalHa, 0) / b.raw.fincas.length, 2)} ha.`),
        );
      }),
    ),
  );
}
