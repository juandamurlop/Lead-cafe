import { h } from '../lib/dom';
import { boton } from '../lib/ui';

export function campo(etiqueta: string, nombre: string, valor = '', atributos = {}, opciones?: string[]): HTMLElement {
  return h('label', { class: 'op-campo' }, etiqueta,
    opciones ? h('select', { name: nombre, ...atributos }, ...opciones.map((o) => h('option', {
      value: o, selected: o === valor, text: o || 'Todos',
    }))) : h('input', { name: nombre, value: valor, ...atributos }),
  );
}
export const requerido = { required: true };
export const numerico = { type: 'number', step: 'any' };
export const porcentaje = { ...numerico, min: 0, max: 100 };
export const texto = (datos: FormData, nombre: string) => String(datos.get(nombre) ?? '').trim();
export const secundario = (label: string, fn: () => void) => boton(label, fn, { class: 'btn btn--chip' });
export const enviar = (label: string) => h('button', { class: 'btn', type: 'submit', text: label });
export function tablaOperacion(cabeceras: string[], filas: (string | HTMLElement)[][]): HTMLElement {
  if (!filas.length) return h('p', { text: 'Sin registros.' });
  return h('div', { class: 'op-scroll', tabindex: '0', role: 'region', 'aria-label': 'Tabla de registros' },
    h('table', { class: 'op-tabla' },
      h('thead', {}, h('tr', {}, ...cabeceras.map((c) => h('th', { scope: 'col', text: c })))),
      h('tbody', {}, ...filas.map((f) => h('tr', {}, ...f.map((c) => h('td', {}, c))))),
    ),
  );
}
