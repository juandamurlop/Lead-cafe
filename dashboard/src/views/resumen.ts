import { h, mount } from '../lib/dom';
import { entero } from '../lib/fmt';
import { boton, card, kpi } from '../lib/ui';

interface Resumen {
  farms: number;
  lots: number;
  events: number;
}

async function consultar(url: string): Promise<Resumen> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Resumen no disponible');
  const data = await response.json();
  if (!data || ![data.farms, data.lots, data.events].every(
    (value) => Number.isSafeInteger(value) && value >= 0,
  )) {
    throw new Error('Resumen inválido');
  }
  return data;
}

export function vistaResumen(): HTMLElement {
  const url = document.querySelector<HTMLMetaElement>('meta[name="cafeto-summary-url"]')?.content;
  const contenido = h('div', { role: 'status', text: 'Consultando el resumen de Lote Claro…' });
  const actualizar = async () => {
    recargar.toggleAttribute('disabled', true);
    mount(contenido, 'Consultando el resumen de Lote Claro…');
    try {
      if (!url) throw new Error('Resumen no configurado');
      const resumen = await consultar(url);
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
