import { h, mount } from '../lib/dom';
import { entero } from '../lib/fmt';
import { boton, card, kpi } from '../lib/ui';
import { fetchSummary } from '../api/client';

export function vistaResumen(): HTMLElement {
  const contenido = h('div', { role: 'status', text: 'Consultando el resumen de Lote Claro…' });
  const actualizar = async () => {
    recargar.toggleAttribute('disabled', true);
    mount(contenido, 'Consultando el resumen de Lote Claro…');
    try {
      const resumen = await fetchSummary();
      if (!resumen || ![resumen.farms, resumen.lots, resumen.events].every((value) => Number.isSafeInteger(value) && value >= 0)) {
        throw new Error('Resumen no disponible');
      }
      mount(contenido, h('div', { class: 'kpis' },
        kpi('Fincas registradas', entero(resumen.farms)),
        kpi('Lotes registrados', entero(resumen.lots)),
        kpi('Eventos EPCIS', entero(resumen.events)),
      ));
    } catch {
      mount(contenido, 'Resumen de Lote Claro no disponible. Los datos de demostración siguen disponibles.');
    } finally {
      recargar.toggleAttribute('disabled', false);
    }
  };

  const recargar = boton('Actualizar resumen', actualizar);
  void actualizar();
  return card('Registros de Lote Claro', 'Totales de PostgreSQL',
    contenido,
    recargar,
  );
}
