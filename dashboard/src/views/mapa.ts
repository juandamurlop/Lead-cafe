import { h, mount } from '../lib/dom';
import { slot } from '../lib/reactive';
import { nota, pill } from '../lib/ui';
import { entero, num } from '../lib/fmt';
import { ajustar, anilloAPath, anilloSuave, areaDeg2, inflar } from '../lib/geo';
import type { LonLat, Proyeccion } from '../lib/geo';
import { cascoConvexo } from '../data/db';
import type { Base, Zona } from '../data/db';
import type { EstadoExpediente, Finca } from '../data/tipos';
import { store } from '../state';
import { clases, fechaCO, leer, normalizar } from '../data/operacion';
import { formatoHumedad, identificar, registroVisible } from '../data/supervision';
import { campo, secundario, tablaOperacion } from './operacion-ui';
import { ventanilla } from './ventanilla';

const W = 580, H = 660;

const TONO: Record<EstadoExpediente, 'ok' | 'warn' | 'bad'> = {
  COMPLETO: 'ok', REVISAR: 'warn', BLOQUEADO: 'bad',
};
const COLOR: Record<EstadoExpediente, string> = {
  COMPLETO: 'var(--ok)', REVISAR: 'var(--warn)', BLOQUEADO: 'var(--bad)',
};

type Nivel = 0 | 1 | 2 | 3;
const abrirFinca = (f: Finca) => store.set({ fincaSel: f.id, zonaSel: f.departamento, acopioSel: f.coopId });
const abrirAcopio = (id: string) => store.set({ acopioSel: id, fincaSel: null });
function accionMapa(etiqueta: string, pulsar: () => void) {
  return { role: 'button', tabindex: '0', 'aria-label': etiqueta, onClick: pulsar, onKeydown: (ev: KeyboardEvent) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    pulsar();
  } };
}

/** Radio mínimo en grados para que una zona pequeña siga siendo un polígono visible. */
const RADIO_MIN = 0.17;

/** Octágono alrededor de un centro, en grados. */
function octagono(centro: [number, number], r: number): LonLat[] {
  return Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return [centro[0] + Math.cos(a) * r, centro[1] + Math.sin(a) * r * 0.9] as LonLat;
  });
}

/**
 * Forma dibujable de una zona. Con menos de tres fincas no hay polígono, y una
 * envolvente larga y delgada se vuelve una astilla imposible de tocar. En ambos
 * casos se une el casco con un núcleo octogonal mínimo: las zonas anchas no
 * cambian (el núcleo les queda dentro) y las delgadas ganan cuerpo sin perder
 * su extensión real.
 */
function formaZona(z: Zona): LonLat[] {
  if (z.casco.length < 3) return octagono(z.centro, RADIO_MIN);
  const nucleo = octagono(z.centro, RADIO_MIN * 0.82);
  const inflado = inflar(z.casco, 1.14) as LonLat[];
  if (areaDeg2(z.casco) > RADIO_MIN * RADIO_MIN * 6) return inflado;
  return cascoConvexo([...inflado, ...nucleo]) as LonLat[];
}

/** Separa verticalmente etiquetas que se encimarían. */
function separar(items: Array<{ y: number; i: number }>, minSep: number): Map<number, number> {
  const orden = [...items].sort((a, b) => a.y - b.y);
  const out = new Map<number, number>();
  let ultimo = -Infinity;
  for (const it of orden) {
    const y = Math.max(it.y, ultimo + minSep);
    out.set(it.i, y);
    ultimo = y;
  }
  return out;
}

function nivelActual(): Nivel {
  const s = store.get();
  if (s.fincaSel) return 3;
  if (s.acopioSel) return 2;
  if (s.zonaSel) return 1;
  return 0;
}

// ------------------------------------------------------------------ mapa

function dibujarMapa(b: Base, mostrarFinca: (f: Finca) => boolean, mostrarAcopio: (id: string) => boolean): SVGSVGElement {
  const s = store.get();
  const nivel = nivelActual();
  const kids: Element[] = [];

  if (nivel === 3) return mapaFinca(b, s.fincaSel!);

  const zonas: Zona[] = nivel === 0 ? b.zonas : b.zonas.filter((z) => nivel === 2 ? z.acopios.includes(s.acopioSel!) : z.nombre === s.zonaSel);
  const fincasVisibles = zonas.flatMap((z) => z.fincas).filter((f) => (nivel !== 2 || f.coopId === s.acopioSel) && mostrarFinca(f));
  const acopiosVis = b.acopios.filter((a) => a.id === s.acopioSel ||
    (mostrarAcopio(a.id) && (nivel === 0 || (nivel === 1 && a.zonas.includes(s.zonaSel!)))));

  const puntos: LonLat[] = zonas.flatMap((z) => formaZona(z));
  for (const f of fincasVisibles) puntos.push([f.lon, f.lat]);
  for (const a of acopiosVis) puntos.push([a.lon, a.lat]);
  const p = ajustar(puntos.length ? puntos : [[-75, 4]], W, H, 40);

  // etiquetas sin encimarse (solo en el nivel 0)
  const yEtiqueta = nivel === 0
    ? separar(zonas.map((z, i) => ({ y: p.y(z.centro[1]), i })), 42)
    : new Map<number, number>();

  // polígonos de zona
  zonas.forEach((z, iz) => {
    const estado: EstadoExpediente = z.bloqueados ? 'BLOQUEADO' : z.revisar ? 'REVISAR' : 'COMPLETO';
    const activa = nivel > 0;
    kids.push(h('path', {
      d: anilloSuave(formaZona(z), p),
      class: `zona ${activa ? 'is-activa' : ''}`,
      stroke: COLOR[estado],
      ...accionMapa(`Departamento ${z.nombre}`, () => store.set({ zonaSel: z.nombre, acopioSel: null, fincaSel: null })),
    }, h('title', { text: `${z.nombre} · ${z.fincas.length} ${z.fincas.length === 1 ? 'finca' : 'fincas'} · ${entero(z.kg)} kg` })));

    if (nivel === 0) {
      const cx = p.x(z.centro[0]);
      const cy = p.y(z.centro[1]);
      const ey = yEtiqueta.get(iz) ?? cy;
      const dcha = cx < W * 0.52;
      const lx = dcha ? cx + 34 : cx - 34;
      if (Math.abs(ey - cy) > 3) {
        kids.push(h('path', {
          d: `M${cx} ${cy}L${lx} ${ey - 4}`, class: 'guia',
        }));
      }
      kids.push(h('circle', { cx, cy, r: 3.5, class: 'zona-c' }));
      kids.push(h('text', {
        x: lx, y: ey - 3, class: 'zona-t',
        'text-anchor': dcha ? 'start' : 'end', text: z.nombre,
      }));
      kids.push(h('text', {
        x: lx, y: ey + 10, class: 'zona-s',
        'text-anchor': dcha ? 'start' : 'end',
        text: `${z.fincas.length} ${z.fincas.length === 1 ? 'finca' : 'fincas'} · ${entero(z.kg / 1000)} t`,
      }));
    }
  });

  // enlaces acopio -> finca
  if (nivel >= 1) {
    for (const a of acopiosVis) {
      const suyas = fincasVisibles.filter((f) => f.coopId === a.id);
      if (!suyas.length) continue;
      const ax = p.x(a.lon), ay = p.y(a.lat);
      for (const f of suyas) {
        kids.push(h('line', {
          x1: ax, y1: ay, x2: p.x(f.lon), y2: p.y(f.lat),
          'data-finca': f.id,
          class: `enlace ${s.acopioSel === a.id ? 'is-on' : ''}`,
        }));
      }
    }
  }

  // fincas
  for (const f of fincasVisibles) {
      const est = b.estadoFinca(f.id);
      if (nivel >= 1 && f.anillo.length >= 4) kids.push(h('path', {
        d: anilloAPath(f.anillo, p), class: 'predio-poly predio-poly--red', stroke: COLOR[est],
        ...accionMapa(`Polígono ${f.id}`, () => abrirFinca(f)),
      }));
      kids.push(h('g', { class: `nodo ${nivel === 2 ? 'nodo--asociado' : ''}`, 'data-finca': f.id,
        ...accionMapa(`Finca ${f.id}: ${f.nombre}`, () => abrirFinca(f)) },
        h('circle', {
          cx: p.x(f.lon), cy: p.y(f.lat), r: nivel === 0 ? 4 : 7, fill: COLOR[est], class: 'finca-pt',
        }),
        h('title', { text: `${f.nombre} · ${f.titular} · ${f.areaTotalHa} ha · ${est}` }),
      ));
  }

  // acopios
  for (const a of acopiosVis) {
    const x = p.x(a.lon), y = p.y(a.lat);
    const sel = s.acopioSel === a.id;
    kids.push(h('g', {
      class: `acopio ${sel ? 'is-on' : ''}`,
      ...accionMapa(`Centro ${a.id}: ${a.nombre}`, () => abrirAcopio(a.id)),
    },
      h('rect', {
        x: x - 9, y: y - 9, width: 18, height: 18, rx: 4,
        transform: `rotate(45 ${x} ${y})`, class: 'acopio-m',
      }),
      nivel >= 1 && h('text', { x, y: y - 16, class: 'acopio-t', 'text-anchor': 'middle', text: a.id }),
      h('title', { text: `${a.nombre} · posición aproximada · ${a.fincasIds.length} fincas` }),
    ));
  }

  return h('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'mapa', role: 'group',
    'aria-label': 'Mapa de zonas cafeteras con centros de acopio y fincas',
  }, ...kids) as unknown as SVGSVGElement;
}

function mapaFinca(b: Base, fincaId: string): SVGSVGElement {
  const f = b.fincaPorId.get(fincaId)!;
  const fotos = b.fotosPorFinca.get(fincaId) ?? [];
  const pts: LonLat[] = [...f.anillo, ...fotos.map((x) => [x.lon, x.lat] as LonLat)];
  const p: Proyeccion = ajustar(pts.length ? pts : [[f.lon, f.lat]], W, H, 64);
  const est = b.estadoFinca(f.id);

  const lonMin = Math.min(...f.anillo.map((q) => q[0]));
  const lonMax = Math.max(...f.anillo.map((q) => q[0]));
  const latMin = Math.min(...f.anillo.map((q) => q[1]));
  const latMax = Math.max(...f.anillo.map((q) => q[1]));

  const kids: Element[] = f.anillo.length >= 4 ? [
    h('rect', {
      x: p.x(lonMin), y: p.y(latMax),
      width: Math.abs(p.x(lonMax) - p.x(lonMin)), height: Math.abs(p.y(latMin) - p.y(latMax)),
      class: 'bbox',
    }),
    h('path', { d: anilloAPath(f.anillo, p), class: 'predio-poly', stroke: COLOR[est] }),
  ] : [];

  f.anillo.forEach((q, i) => {
    kids.push(h('circle', { cx: p.x(q[0]), cy: p.y(q[1]), r: 3.5, class: 'vertice' },
      h('title', { text: `vértice ${i + 1}: ${q[1].toFixed(6)}, ${q[0].toFixed(6)}` })));
  });

  kids.push(h('circle', { cx: p.x(f.lon), cy: p.y(f.lat), r: 6, class: 'centroide' },
    h('title', { text: `centroide ${f.lat.toFixed(6)}, ${f.lon.toFixed(6)}` })));
  kids.push(h('text', {
    x: p.x(f.lon), y: p.y(f.lat) - 14, class: 'zona-t', 'text-anchor': 'middle',
    text: `${f.lat.toFixed(6)}, ${f.lon.toFixed(6)}`,
  }));

  for (const ft of fotos) {
    kids.push(h('g', { class: 'foto-pt' },
      h('path', {
        d: `M${p.x(ft.lon)} ${p.y(ft.lat) - 7}l6 7l-6 7l-6 -7z`,
        class: ft.dentroBbox === 'SI' ? 'foto-ok' : 'foto-mal',
      }),
      h('title', { text: `${ft.tipo} · ${ft.archivo} · ${ft.dentroBbox === 'SI' ? 'dentro' : 'FUERA'} del predio · ±${ft.precisionM} m` }),
    ));
  }

  return h('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'mapa mapa--predio', role: 'img',
    'aria-label': `Polígono del predio ${f.nombre}`,
  }, ...kids) as unknown as SVGSVGElement;
}

// ------------------------------------------------------------- panel

function migas(b: Base): HTMLElement {
  const s = store.get();
  const chips: Node[] = [
    h('button', {
      class: 'miga', type: 'button',
      onClick: () => store.set({ zonaSel: null, acopioSel: null, fincaSel: null }),
      text: 'Colombia',
    }),
  ];
  if (s.zonaSel) {
    chips.push(h('span', { class: 'miga-sep', text: '›' }));
    chips.push(h('button', {
      class: 'miga', type: 'button',
      onClick: () => store.set({ acopioSel: null, fincaSel: null }),
      text: s.zonaSel,
    }));
  }
  if (s.acopioSel) {
    const a = b.acopios.find((x) => x.id === s.acopioSel);
    chips.push(h('span', { class: 'miga-sep', text: '›' }));
    chips.push(h('button', {
      class: 'miga', type: 'button', onClick: () => store.set({ fincaSel: null }),
      text: a ? a.id : s.acopioSel,
    }));
  }
  if (s.fincaSel) {
    chips.push(h('span', { class: 'miga-sep', text: '›' }));
    chips.push(h('span', { class: 'miga is-on', text: s.fincaSel }));
  }
  return h('nav', { class: 'migas', 'aria-label': 'Ruta' }, ...chips);
}

function listaZonas(b: Base): HTMLElement {
  return h('div', { class: 'list' }, ...b.zonas.map((z) => {
    const est: EstadoExpediente = z.bloqueados ? 'BLOQUEADO' : z.revisar ? 'REVISAR' : 'COMPLETO';
    return h('button', {
      class: 'item item--btn', type: 'button',
      onClick: () => store.set({ zonaSel: z.nombre, acopioSel: null, fincaSel: null }),
    },
      h('span', { class: `punto punto--${TONO[est]}` }),
      h('div', {},
        h('strong', { text: z.nombre }),
        h('span', {
          class: 'item-m',
          text: `${z.fincas.length} ${z.fincas.length === 1 ? 'finca' : 'fincas'} · ${z.acopios.length} ${z.acopios.length === 1 ? 'acopio' : 'acopios'} · ${entero(z.kg)} kg`,
        }),
      ),
      h('span', { class: 'item-kg', text: `${z.bloqueados}/${z.fincas.length}` }),
    );
  }));
}

function listaAcopios(b: Base, zona: string): HTMLElement {
  const acopios = b.acopiosDeZona(zona);
  return h('div', { class: 'list' }, ...acopios.map((a) => {
    const suyas = a.fincasIds
      .map((id) => b.fincaPorId.get(id)!)
      .filter((f) => f.departamento === zona);
    return h('button', {
      class: 'item item--btn', type: 'button',
      onClick: () => store.set({ acopioSel: a.id, fincaSel: null }),
    },
      h('span', { class: 'acopio-chip', text: '◆' }),
      h('div', {},
        h('strong', { text: a.nombre }),
        h('span', { class: 'item-m', text: `${a.id} · NIT ${a.nit} · sede ${a.municipioSede}` }),
        h('span', { class: 'item-m', text: `${suyas.length} caficultores en ${zona} · ${entero(a.kg)} kg en total` }),
      ),
      h('span', { class: 'item-go', text: '→' }),
    );
  }));
}

const ICONO_CANAL: Record<string, string> = { voz: '🎙', sms: '✉', app: '▣' };

function detalleFinca(b: Base, id: string): HTMLElement {
  const f = b.fincaPorId.get(id)!;
  const est = b.estadoFinca(id);
  const lotes = b.lotesPorFinca.get(id) ?? [];
  const msgs = b.mensajesPorFinca.get(id) ?? [];
  const motivos = b.motivosDeFinca(id);
  const coop = b.coopPorId.get(f.coopId);
  const insumosMalos = (b.insumosPorFinca.get(id) ?? []).filter((x) => x.estadoUE === 'No aprobado');
  const fotos = b.fotosPorFinca.get(id) ?? [];
  const operacion = leer();
  const entregas = operacion.entregas.filter((e) => registroVisible(e.id) && identificar(e, b)?.id === id);
  const entregaIds = new Set(entregas.map((e) => e.id));
  const consolidados = operacion.consolidados.filter((c) => registroVisible(c.id) && c.entregas.some((e) => entregaIds.has(e)));

  const campo = (k: string, v: string, mono = false) => h('div', { class: 'campo' },
    h('span', { class: 'campo-k', text: k }),
    h('span', { class: `campo-v ${mono ? 'mono' : ''}`, text: v }),
  );

  return h('div', { class: 'detalle' },
    h('header', { class: 'detalle-h' },
      h('div', {},
        h('h3', { text: f.titular }),
        h('p', { text: `${f.nombre} · ${f.id}` }),
      ),
      b.expedientePorFinca.has(id) ? pill(est, TONO[est]) : pill('Sin expediente', 'neutro'),
    ),
    b.acopios.some((a) => a.id === f.coopId) && secundario(`Volver al centro ${f.coopId}`, () => abrirAcopio(f.coopId)),
    h('h4', { class: 'h4', text: 'Entregas al centro de acopio' }),
    entregas.length ? tablaOperacion(['Entrega', 'Fecha', 'Lote individual', 'Peso', 'Humedad', 'Calidad', 'Lote comercial'],
      entregas.map((e) => [e.id, fechaCO(e.fecha).split(',')[0], e.lote, `${num(e.kg)} kg`, formatoHumedad(e.humedad), e.clase,
        consolidados.filter((c) => c.entregas.includes(e.id)).map((c) => c.lote).join(', ') || '—',
      ])) : nota('Esta finca no tiene entregas operativas disponibles.'),

    h('div', { class: 'campos' },
      campo('Documento', `${f.tipoId} ${f.nroId}`, true),
      campo('Teléfono', f.telefono, true),
      campo('Correo', f.email),
      campo('Vereda', `${f.vereda}, ${f.municipio}`),
      campo('Departamento', f.departamento),
      campo('Cooperativa', coop ? coop.nombre : 'Sin cooperativa'),
      campo('Latitud', f.lat.toFixed(6), true),
      campo('Longitud', f.lon.toFixed(6), true),
      campo('Área declarada', `${num(f.areaTotalHa, 2)} ha`),
      campo('Área del polígono', `${num(f.areaPoligonoHa, 2)} ha`),
      campo('Diferencia', `${num(f.difAreaPct * 100, 1)} %`),
      campo('Área sembrada', `${num(f.areaSembradaHa, 2)} ha`),
      campo('Vértices', String(f.nVertices)),
      campo('Consentimiento', f.consentimiento === 'SI' ? `Sí · ${f.fechaConsentimiento}` : f.consentimiento),
    ),

    h('h4', { class: 'h4', text: 'Verificación satelital' }),
    h('div', { class: `satbox satbox--${f.sat.resultado === 'Sin deforestación' ? 'ok' : f.sat.resultado === 'Alerta - revisar' ? 'warn' : 'bad'}` },
      h('strong', { text: f.sat.resultado }),
      h('span', { text: `${f.sat.fuente} · ${f.sat.resolucionM} m · ${f.sat.fecha}` }),
      h('span', { text: `Pérdida de cobertura arbórea posterior al corte: ${num(f.sat.perdidaHa, 2)} ha` }),
      h('span', { class: 'mut', text: `Proveedor: ${f.sat.proveedor}` }),
    ),

    h('h4', { class: 'h4', text: 'Uso del suelo' }),
    h('div', { class: 'barrasuso' },
      ...([
        ['Café', f.uso.cafe, 'var(--accent)'],
        ['Asociados', f.uso.asociados, 'var(--ok)'],
        ['Pasto', f.uso.pasto, 'var(--warn)'],
        ['Bosque', f.uso.bosque, '#2f6f4f'],
        ['Rastrojo', f.uso.rastrojo, '#9aa38f'],
        ['Infra', f.uso.infra, '#8a8178'],
      ] as Array<[string, number, string]>).map(([n2, v, c]) =>
        v > 0 ? h('div', {
          class: 'uso-seg', style: `flex:${v};background:${c}`,
          title: `${n2}: ${num(v, 2)} ha`,
        }, h('span', { text: n2 })) : null as never,
      ),
    ),

    motivos.length ? h('div', {},
      h('h4', { class: 'h4', text: 'Motivos abiertos' }),
      h('ul', { class: 'motivos' }, ...motivos.map((m) => h('li', { text: m }))),
    ) : b.expedientePorFinca.has(id) ? h('p', { class: 'exito-inline', text: '✓ Sin motivos abiertos en el expediente.' }) : null,

    h('h4', { class: 'h4', text: `Lotes entregados (${lotes.length})` }),
    h('div', { class: 'list list--tight' }, ...lotes.map((l) => h('div', { class: 'item' },
      h('div', {},
        h('strong', { text: `${l.id} · ${l.tipoCosecha}` }),
        h('span', { class: 'item-m', text: `cosecha ${l.inicio} a ${l.fin} · entrega ${l.entrega}` }),
        h('span', { class: 'item-m', text: `sacos ${l.sacoIni}–${l.sacoFin} · humedad ${num(l.humedad, 1)} % · ${num(l.rendimientoKgHa, 0)} kg/ha` }),
      ),
      h('span', { class: 'item-kg', text: `${entero(l.kg)} kg` }),
    ))),

    insumosMalos.length ? h('div', {},
      h('h4', { class: 'h4', text: `Agroquímicos sin aprobación UE (${insumosMalos.length})` }),
      h('div', { class: 'list list--tight' }, ...insumosMalos.map((x) => h('div', { class: 'item' },
        h('div', {},
          h('strong', { text: x.ia }),
          h('span', { class: 'item-m', text: `${x.producto} · ${x.fecha} · ${num(x.dosis, 2)} ${x.unidad}` }),
        ),
        pill('No aprobado', 'bad'),
      ))),
    ) : null as never,

    h('h4', { class: 'h4', text: `Mensajes enviados (${msgs.length})` }),
    h('div', { class: 'msgs' }, ...msgs.map((m) => h('div', { class: `msg msg--${m.canal}` },
      h('span', { class: 'msg-i', text: ICONO_CANAL[m.canal] ?? '•' }),
      h('div', {},
        h('p', { class: 'msg-t', text: m.texto }),
        h('span', { class: 'msg-m', text: `${m.fecha} · ${m.transporte}${m.segundos ? ` · nota de voz de ${m.segundos} s` : ''}${m.loteId ? ` · ${m.loteId}` : ''}` }),
      ),
    ))),

    h('h4', { class: 'h4', text: `Fotos georreferenciadas (${fotos.length})` }),
    h('div', { class: 'list list--tight' }, ...fotos.map((ft) => h('div', { class: 'item' },
      h('div', {},
        h('strong', { text: ft.tipo }),
        h('span', { class: 'item-m mono', text: `${ft.lat.toFixed(6)}, ${ft.lon.toFixed(6)} · ±${num(ft.precisionM, 1)} m` }),
        h('span', { class: 'item-m', text: `${ft.fecha} · sha256 ${ft.hash}` }),
      ),
      pill(ft.dentroBbox === 'SI' ? 'dentro' : 'fuera', ft.dentroBbox === 'SI' ? 'ok' : 'bad'),
    ))),
  );
}

export function vistaMapa(b: Base): HTMLElement {
  const busqueda = campo('Buscar finca o centro', 'mapa-busqueda', '', { type: 'search' });
  const ambiente = campo('Expediente ambiental', 'mapa-ambiental', '', {}, ['', 'COMPLETO', 'REVISAR', 'BLOQUEADO']);
  const calidad = campo('Calidad confirmada', 'mapa-calidad', '', {}, ['', ...clases]);
  const resultados = h('div', { class: 'mapa-resultados', 'aria-label': 'Resultados de búsqueda' });
  const tabla = leer().entregas.filter((e) => registroVisible(e.id));
  const textoBusqueda = () => normalizar(busqueda.querySelector('input')!.value);
  const verFinca = (f: Finca) => {
    const est = ambiente.querySelector('select')!.value, clase = calidad.querySelector('select')!.value;
    const centro = b.coopPorId.get(f.coopId);
    return normalizar(`${f.nombre} ${f.titular} ${f.id} ${f.nroId} ${f.coopId} ${centro?.nombre ?? ''}`).includes(textoBusqueda()) &&
      (!est || (b.expedientePorFinca.has(f.id) && b.estadoFinca(f.id) === est)) &&
      (!clase || tabla.some((e) => e.clase === clase && identificar(e, b)?.id === f.id));
  };
  const verAcopio = (id: string) => {
    const a = b.acopios.find((item) => item.id === id)!;
    const visualFiltrado = ambiente.querySelector('select')!.value || calidad.querySelector('select')!.value;
    return (!visualFiltrado && normalizar(`${id} ${a.nombre} ${a.municipioSede}`).includes(textoBusqueda())) ||
      b.fincasDeAcopio(id).some(verFinca);
  };
  const mapa = slot(() => dibujarMapa(b, verFinca, verAcopio));
  const filtros = h('div', { class: 'op-form', onInput: () => {
    mount(mapa, dibujarMapa(b, verFinca, verAcopio));
    if (!textoBusqueda() && !ambiente.querySelector('select')!.value && !calidad.querySelector('select')!.value) {
      mount(resultados); return;
    }
    const fincas = b.raw.fincas.filter(verFinca);
    const centros = b.acopios.filter((a) => verAcopio(a.id));
    mount(resultados, ...centros.map((a) => secundario(`◆ ${a.id} · ${a.nombre}`, () => abrirAcopio(a.id))),
      ...fincas.map((f) => secundario(`● ${f.id} · ${f.nombre}`, () => abrirFinca(f))),
      !fincas.length && !centros.length ? nota('Sin coincidencias en el catálogo.') : null);
  } }, busqueda, ambiente, calidad);
  let clavePanel = '';
  let contenido: HTMLElement | null = null;
  const centroCache = new Map<string, HTMLElement>();
  const seccion = h('div', { class: 'mapa-explorador' });
  const ampliar = h('button', { class: 'btn btn--chip', type: 'button', 'aria-pressed': 'false', text: 'Ampliar panel', onClick: () => {
    const activo = seccion.classList.toggle('mapa-explorador--amplio');
    ampliar.textContent = activo ? 'Restaurar tamaños' : 'Ampliar panel';
    ampliar.setAttribute('aria-pressed', String(activo));
  } });
  mount(seccion,
    h('section', { class: 'card card--mapa' },
      h('header', { class: 'card-h card-h--row' },
        slot(() => migas(b)),
        h('div', { class: 'leyenda-map' },
          h('span', {}, h('i', { class: 'lg lg--ok' }), 'completo'),
          h('span', {}, h('i', { class: 'lg lg--warn' }), 'revisar'),
          h('span', {}, h('i', { class: 'lg lg--bad' }), 'bloqueado'),
          h('span', {}, h('i', { class: 'lg lg--acopio' }), 'centro aproximado'),
          h('span', {}, '● finca'),
          h('span', {}, '▱ polígono de finca'),
          h('span', {}, '— conexión por cooperativa'),
        ),
      ),
      filtros, resultados, mapa,
      slot(() => {
        const s = store.get();
        const n = nivelActual();
        const txt = n === 0
          ? 'Los contornos regionales agrupan fincas del catálogo ficticio. Los centros se ubican de forma aproximada a partir de sus fincas asociadas.'
          : n === 1
            ? `${s.zonaSel}: las líneas unen cada centro de acopio con los caficultores que le entregan.`
            : n === 2
              ? 'Las líneas conectan el centro aproximado con las fincas del mismo coopId.'
              : 'Contorno del predio según el catálogo ficticio, con sus vértices, el centroide y las fotos georreferenciadas disponibles.';
        return nota(txt);
      }),
    ),
    h('section', { class: 'card card--panel mapa-panel', 'aria-label': 'Detalle de trazabilidad' }, ampliar, slot(() => {
      const s = store.get();
      const clave = JSON.stringify([s.fincaSel, s.acopioSel, s.zonaSel]);
      if (clave !== clavePanel || !contenido) {
        if (clavePanel && (s.fincaSel || s.acopioSel) && matchMedia('(max-width:850px)').matches) {
          requestAnimationFrame(() => seccion.querySelector('.mapa-panel')?.scrollIntoView({ block: 'start' }));
        }
        clavePanel = clave;
        if (s.fincaSel) contenido = detalleFinca(b, s.fincaSel);
        else if (s.acopioSel) {
          contenido = centroCache.get(s.acopioSel) ?? ventanilla(b, s.acopioSel);
          centroCache.set(s.acopioSel, contenido);
        } else contenido = s.zonaSel ? h('div', {}, nota(`Centros con presencia en ${s.zonaSel}`), listaAcopios(b, s.zonaSel))
          : h('div', {}, nota('Selecciona un departamento, centro de acopio o finca.'), listaZonas(b));
      }
      return contenido;
    })),
  );
  return seccion;
}
