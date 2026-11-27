import { h, type Attrs } from './dom';

export type Tono = 'ok' | 'warn' | 'bad' | 'neutro';

export function card(titulo: string, subtitulo: string | null, ...body: (Node | false | null)[]): HTMLElement {
  return h('section', { class: 'card' },
    h('header', { class: 'card-h' },
      h('h2', { text: titulo }),
      subtitulo && h('p', { class: 'card-sub', text: subtitulo }),
    ),
    ...body.filter(Boolean) as Node[],
  );
}

export function kpi(label: string, valor: string, pie?: string, tono: Tono = 'neutro'): HTMLElement {
  return h('div', { class: `kpi kpi--${tono}` },
    h('span', { class: 'kpi-l', text: label }),
    h('strong', { class: 'kpi-v', text: valor }),
    pie ? h('span', { class: 'kpi-p', text: pie }) : null as never,
  );
}

export function readout(
  valor: string, veredicto: string, porque: string, tono: Tono,
): HTMLElement {
  return h('div', { class: `readout readout--${tono}` },
    h('div', { class: 'readout-v', html: valor }),
    h('div', { class: 'readout-k', text: veredicto }),
    h('p', { class: 'readout-w', text: porque }),
  );
}

export function fila(k: string, v: string, nota?: string): HTMLElement {
  return h('div', { class: 'row' },
    h('span', { class: 'row-k', text: k },
      nota ? h('em', { class: 'row-n', text: nota }) : null as never),
    h('span', { class: 'row-v', text: v }),
  );
}

export function slider(opts: {
  label: string; min: number; max: number; step: number; value: number;
  sufijo?: string; id?: string; onInput: (v: number) => void;
}): HTMLElement {
  const out = h('output', { class: 'sl-out', text: `${opts.value}${opts.sufijo ?? ''}` });
  const input = h('input', {
    type: 'range', min: opts.min, max: opts.max, step: opts.step, value: opts.value,
    class: 'sl-input', 'aria-label': opts.label, id: opts.id,
    'data-sufijo': opts.sufijo ?? '',
    onInput: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      out.textContent = `${v}${opts.sufijo ?? ''}`;
      opts.onInput(v);
    },
  });
  return h('label', { class: 'sl' },
    h('span', { class: 'sl-top' }, h('span', { class: 'sl-lbl', text: opts.label }), out),
    input,
  );
}

/** Sincroniza un slider desde fuera, sin disparar su manejador. */
export function fijarSlider(id: string, valor: number): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.value = String(valor);
  const out = el.parentElement?.querySelector('.sl-out');
  if (out) out.textContent = `${Math.round(valor * 10) / 10}${el.dataset.sufijo ?? ''}`;
}

export function boton(texto: string, onClick: () => void, attrs: Attrs = {}): HTMLElement {
  return h('button', { class: 'btn', type: 'button', onClick, ...attrs }, texto);
}

export function pill(texto: string, tono: Tono): HTMLElement {
  return h('span', { class: `pill pill--${tono}`, text: texto });
}

export function nota(texto: string): HTMLElement {
  return h('p', { class: 'nota', text: texto });
}

export function callout(titulo: string, cuerpo: string): HTMLElement {
  return h('aside', { class: 'callout' },
    h('strong', { text: titulo }), ' ', cuerpo,
  );
}

export function money(tono: 'good' | 'lose', html: string): HTMLElement {
  return h('div', { class: `money money--${tono}`, html });
}

export function grid(...kids: (Node | false | null)[]): HTMLElement {
  return h('div', { class: 'grid' }, ...kids.filter(Boolean) as Node[]);
}

export function tabla(cab: string[], filas: (string | Node)[][]): HTMLElement {
  return h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, ...cab.map((c) => h('th', { text: c })))),
    h('tbody', {}, ...filas.map((f) => h('tr', {},
      ...f.map((c) => h('td', {}, typeof c === 'string' ? document.createTextNode(c) : c)),
    ))),
  );
}
