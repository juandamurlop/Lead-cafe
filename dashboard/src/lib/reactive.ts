import { h, mount } from './dom';

type SlotFn = () => Node;

interface Slot { el: HTMLElement; fn: SlotFn }

let slots: Slot[] = [];

/**
 * Trozo de interfaz que se vuelve a dibujar cuando cambia el estado, sin tocar
 * el resto del árbol. Los controles con estado de interacción —sliders, zonas
 * arrastrables— viven FUERA de los slots, así nunca se destruyen a mitad de un
 * gesto y el arrastre no se corta.
 */
export function slot(fn: SlotFn): HTMLElement {
  const el = h('div', { class: 'slot' }, fn());
  slots.push({ el, fn });
  return el;
}

export function refrescarSlots(): void {
  for (const s of slots) mount(s.el, s.fn());
}

export function limpiarSlots(): void {
  slots = [];
}

/**
 * Zona arrastrable estable: el contenedor nunca se recrea, así que los
 * manejadores de puntero sobreviven a cualquier redibujado interior.
 */
export function zonaArrastrable(
  render: () => Node,
  alArrastrar: (fraccion: number) => void,
): HTMLElement {
  const host = h('div', { class: 'drag-host' }, slot(render));

  const leer = (ev: PointerEvent) => {
    const r = host.getBoundingClientRect();
    if (r.width === 0) return;
    alArrastrar(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)));
  };

  host.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    leer(ev);
    const mover = (e: PointerEvent) => leer(e);
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      host.classList.remove('is-dragging');
    };
    host.classList.add('is-dragging');
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  });

  return host;
}
