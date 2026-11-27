import { h, mount } from './lib/dom';
import { limpiarSlots, refrescarSlots, slot } from './lib/reactive';
import { store } from './state';
import type { Vista } from './state';
import { cargarBase } from './data/db';
import type { Base } from './data/db';
import { vistaPanorama } from './views/panorama';
import { vistaCadena } from './views/cadena';
import { vistaExpediente } from './views/expediente';
import { vistaSecado } from './views/secado';
import { vistaBodega } from './views/bodega';
import { vistaAcopio } from './views/acopio';
import { cargarAcopio } from './data/excel';

interface ItemNav { id: Vista; nombre: string; icono: string; sub: string; grupo: string }

const NAV: ItemNav[] = [
  { id: 'panorama', nombre: 'Panorama', icono: '◉', sub: 'todo de un vistazo', grupo: 'Datos' },
  { id: 'cadena', nombre: 'Cadena', icono: '⇄', sub: 'etapa por etapa', grupo: 'Datos' },
  { id: 'expediente', nombre: 'Expediente', icono: '▤', sub: 'EUDR · Laura', grupo: 'Datos' },
  { id: 'secado', nombre: 'Secado', icono: '☀', sub: 'Rosa Elvira', grupo: 'Instrumentos' },
  { id: 'bodega', nombre: 'Bodega', icono: '◳', sub: 'Hernán', grupo: 'Instrumentos' },
  { id: 'acopio', nombre: 'Ventanilla', icono: '⚖', sub: 'la fila', grupo: 'Instrumentos' },
];

const VALIDAS = new Set<string>(NAV.map((n) => n.id));
function irA(v: Vista): void {
  if (location.hash.slice(1) !== v) location.hash = v;
  else store.set({ vista: v });
}

function sidebar(abrirCumplimiento: () => void, ultimaActualizacion: Date | null): HTMLElement {
  const grupos = [...new Set(NAV.map((n) => n.grupo))];
  return h('nav', { class: 'side', 'aria-label': 'Secciones' },
    h('div', { class: 'brand' },
      h('span', { class: 'brand-mark', text: '☕' }),
      h('div', {}, h('strong', { text: 'Cafeto' }), h('em', { text: 'trazabilidad sin señal' })),
    ),
    ...grupos.map((g) => h('div', { class: 'navgrupo' },
      h('p', { class: 'navgrupo-t', text: g }),
      h('ul', { class: 'nav' }, ...NAV.filter((n) => n.grupo === g).map((n) => h('li', {},
        slot(() => h('button', {
          class: `nav-b ${n.id === store.get().vista ? 'is-active' : ''}`,
          type: 'button', onClick: () => irA(n.id),
          'aria-current': n.id === store.get().vista ? 'page' : undefined,
        },
          h('span', { class: 'nav-i', text: n.icono }),
          h('span', { class: 'nav-t' }, h('strong', { text: n.nombre }), h('em', { text: n.sub })),
        )),
      ))),
    )),
    h('a', { href: import.meta.env.BASE_URL, class: 'nav-b nav-b--enlace', text: 'Cumplimiento EUDR', onClick: (ev: MouseEvent) => {
      if (ev.button || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      ev.preventDefault();
      abrirCumplimiento();
    } }),
    h('footer', { class: 'side-f' },
      h('p', {
        text: `Última actualización: ${
          ultimaActualizacion
            ? ultimaActualizacion.toLocaleTimeString('es-CO', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })
            : '—'
        }`,
      }),
      h('p', { text: 'Base de 50 fincas registradas. Gravimet de Cenicafé, ecuación de Magnus y precio interno FNC del 25-nov-2026.' }),
    ),
  );
}

function cuerpo(b: Base, v: Vista): HTMLElement {
  switch (v) {
    case 'cadena': return vistaCadena(b);
    case 'expediente': return vistaExpediente(b);
    case 'secado': return vistaSecado();
    case 'bodega': return vistaBodega();
    case 'acopio': return vistaAcopio(b);
    default: return vistaPanorama(b, irA);
  }
}

function pantallaCarga(mensaje: string, error = false): HTMLElement {
  return h('div', { class: `cargando ${error ? 'is-error' : ''}` },
    h('div', { class: 'spinner' }),
    h('p', { text: mensaje }),
  );
}

export function montarCafeto(root: HTMLElement, abrirCumplimiento: () => void): () => void {
  let base: Base | null = null;
  let vistaMontada: Vista | null = null;
  let ultimaActualizacion: Date | null = null;
  let activo = true;
  const actualizarRuta = () => {
    const hash = location.hash.slice(1);
    store.set({ vista: VALIDAS.has(hash) ? hash as Vista : 'panorama' });
  };

  function montar(): void {
    const s = store.get();
    limpiarSlots();
    if (!base) {
      mount(root, s.error ? pantallaCarga(s.error, true) : pantallaCarga('Cargando la base de fincas…'));
      return;
    }

    mount(root,
      sidebar(abrirCumplimiento, ultimaActualizacion),
      h('main', { class: 'content' }, cuerpo(base, s.vista)),
      slot(() => h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' },
        ...store.get().toasts.map((t) => h('div', { class: `toast toast--${t.tono}`, text: t.texto })),
      )),
    );
    vistaMontada = s.vista;
    root.querySelector('.content')?.scrollTo({ top: 0 });
  }

  store.set({ cargando: true, error: null });
  actualizarRuta();
  const desuscribir = store.subscribe(({ vista }) => {
    if (!base || vista !== vistaMontada) montar();
    else refrescarSlots();
  });
  window.addEventListener('hashchange', actualizarRuta);
  montar();

  const url = (ruta: string) => `${import.meta.env.BASE_URL}${ruta}`;
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register(url('sw.js')).catch((error) => console.warn('Cafeto sin caché offline', error));
  }

  void cargarBase(url('data/cafeto.json'))
    .then(async (b) => {
      if (!activo) return;
      await cargarAcopio(b, url('data/Acopio_Hernan_vinculado_repo.xlsx')).catch((error) => console.warn('Cafeto sin datos de acopio', error));
      if (!activo) return;
      base = b;
      ultimaActualizacion = new Date();
      store.set({ cargando: false });
    })
    .catch((e: unknown) => {
      if (activo) store.set({ cargando: false, error: `No se pudo cargar la base: ${String(e)}` });
    });

  return () => {
    activo = false;
    desuscribir();
    window.removeEventListener('hashchange', actualizarRuta);
    limpiarSlots();
    mount(root);
  };
}
