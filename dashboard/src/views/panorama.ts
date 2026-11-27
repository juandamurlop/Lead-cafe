import { h } from '../lib/dom';
import { slot } from '../lib/reactive';
import { card, grid, kpi, nota } from '../lib/ui';
import { cop, entero, horas, num } from '../lib/fmt';
import { evaluarSecado } from '../domain/gravimet';
import { EXPLICACION_BANDA, diagnosticar } from '../domain/psychro';
import { store } from '../state';
import type { Vista } from '../state';
import type { Base } from '../data/db';
import { vistaResumen } from './resumen';

const FECHA_EUDR = new Date('2026-12-30T00:00:00-05:00');

interface Aviso { texto: string; tono: 'ok' | 'warn' | 'bad'; ir: Vista }

function avisos(b: Base): Aviso[] {
  const s = store.get();
  const sec = evaluarSecado(s.loteLavadoKg, s.muestraG);
  const bod = diagnosticar(s.dentro, s.fuera);
  const out: Aviso[] = [];

  const blo = b.raw.expediente.filter((e) => e.estado === 'BLOQUEADO');
  if (blo.length) {
    const kg = blo.reduce((a, e) => a + (b.raw.lotes.find((l) => l.id === e.loteId)?.kg ?? 0), 0);
    out.push({ texto: `${blo.length} lotes bloqueados retienen ${entero(kg)} kg fuera del mercado europeo.`, tono: 'bad', ir: 'expediente' });
  }
  const sinCons = b.raw.fincas.filter((f) => f.consentimiento !== 'SI');
  if (sinCons.length) {
    out.push({ texto: `${sinCons.length} fincas sin consentimiento de datos firmado. Sin eso no se pueden usar sus coordenadas.`, tono: 'warn', ir: 'expediente' });
  }
  const defo = b.raw.fincas.filter((f) => f.sat.resultado === 'Deforestación confirmada');
  if (defo.length) {
    out.push({ texto: `${defo.length} fincas con deforestación confirmada posterior al 31-dic-2020.`, tono: 'bad', ir: 'expediente' });
  }
  if (sec.estado === 'sobreseco') {
    out.push({ texto: `Secado sobrepasado: ${num(sec.humedad * 100)} % de humedad. Regala ${cop(Math.abs(sec.deltaCOP))} en ese lote.`, tono: 'bad', ir: 'secado' });
  }
  if (bod.banda === 'critica' || bod.banda === 'alta') {
    out.push({ texto: `Bodega al ${num(s.dentro.rh, 0)} % de humedad relativa. ${EXPLICACION_BANDA[bod.banda]}`, tono: 'bad', ir: 'bodega' });
  }
  if (bod.ventilar) out.push({ texto: 'El aire de afuera está más seco: conviene abrir la bodega ahora.', tono: 'ok', ir: 'bodega' });
  return out;
}

function tarjetasKpi(b: Base): HTMLElement {
  const s = store.get();
  const sec = evaluarSecado(s.loteLavadoKg, s.muestraG);
  const bod = diagnosticar(s.dentro, s.fuera);
  const comp = b.raw.expediente.filter((e) => e.estado === 'COMPLETO').length;
  const total = b.raw.expediente.length;
  const ahorro = s.segViejo - s.segNuevo;

  return h('div', { class: 'kpis' },
    kpi('Lotes aptos para la UE', `${comp}/${total}`,
      `${Math.round((comp / total) * 100)} % de los lotes en regla`, comp / total > 0.6 ? 'ok' : 'warn'),
    kpi('Café registrado', `${entero(b.meta().kgTotal / 1000)} t`,
      `${b.meta().nFincas} fincas · ${b.acopios.length} acopios · ${b.zonas.length} departamentos`, 'neutro'),
    kpi('Humedad en secado', `${num(sec.humedad * 100)} %`,
      sec.estado === 'listo' ? 'en rango 10–12 %' : sec.estado === 'sobreseco' ? 'regalando peso' : `faltan ${num(sec.diasRestantes)} días de sol`,
      sec.estado === 'listo' ? 'ok' : sec.estado === 'sobreseco' ? 'bad' : 'warn'),
    kpi('Bodega', bod.ventilar ? 'ABRIR' : 'CERRAR',
      `Simulación · ${num(s.dentro.rh, 0)} % HR · tiende a ${num(bod.humedadEquilibrio)} %`,
      bod.banda === 'segura' ? 'ok' : bod.banda === 'critica' ? 'bad' : 'warn'),
    kpi('Tiempo ahorrado en ventanilla', ahorro > 0 ? horas(ahorro) : '—',
      `Simulación · ${s.cursorEntrega} ${s.cursorEntrega === 1 ? 'entrega' : 'entregas'} en la ventanilla`, 'neutro'),
  );
}

export function vistaPanorama(b: Base, irA: (v: Vista) => void): HTMLElement {
  const dias = Math.max(0, Math.ceil((FECHA_EUDR.getTime() - Date.now()) / 86_400_000));
  const kgTotal = b.meta().kgTotal;

  return grid(
    h('section', { class: 'hero' },
      h('div', {},
        h('p', { class: 'hero-eyebrow', text: `${b.meta().nFincas} fincas · 10 departamentos · trazabilidad activa` }),
        h('h1', { class: 'hero-h', text: 'Trazabilidad de café que funciona sin señal' }),
        h('p', { class: 'hero-p', text: 'Controle el secado, la bodega y la recepción del café, y prepare el expediente EUDR de cada lote.' }),
      ),
      h('div', { class: 'hero-count' },
        h('strong', { text: String(dias) }),
        h('span', { text: dias === 1 ? 'día para el EUDR' : 'días para el EUDR' }),
        h('em', { text: '30 de diciembre de 2026' }),
      ),
    ),

    slot(() => tarjetasKpi(b)),

    vistaResumen(),

    card('Qué necesita atención', null,
      slot(() => h('div', { class: 'avisos' }, ...avisos(b).map((a) => h('button', {
        class: `aviso aviso--${a.tono}`, type: 'button', onClick: () => irA(a.ir),
      },
        h('span', { class: 'aviso-dot' }),
        h('span', { text: a.texto }),
        h('span', { class: 'aviso-go', text: '→' }),
      )))),
    ),

    card('Por dónde empezar', null,
      h('div', { class: 'tri' },
        h('article', { class: 'tri-i', onClick: () => irA('cadena') },
          h('span', { class: 'tri-n', text: '01' }),
          h('h3', { text: 'Cadena de suministro' }),
          h('p', { text: `Siga los ${entero(kgTotal)} kg desde los caficultores hasta la exportadora.` }),
        ),
        h('article', { class: 'tri-i', onClick: () => irA('expediente') },
          h('span', { class: 'tri-n', text: '02' }),
          h('h3', { text: 'Expediente EUDR' }),
          h('p', { text: `Revise el estado de los ${b.raw.expediente.length} lotes y los motivos de retención, y copie el GeoJSON para el Sistema de Información.` }),
        ),
      ),
      nota(b.meta().aviso),
    ),
  );
}
