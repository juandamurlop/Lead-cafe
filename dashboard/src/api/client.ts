import type {
  DashboardSummary,
  EpcisEvent,
  GeoJsonPolygon,
  GfwStatus,
  LotDetail,
  LotSummary,
} from '../types/lot';
import { apiUrl, demoData } from './config';

export type DataSource = 'api' | 'demo';

export interface LotsResult {
  lots: LotSummary[];
  source: DataSource;
}

export interface LotDetailResult {
  lot: LotDetail | null;
  source: DataSource;
}

interface CafetoFinca {
  id: string;
  nombre: string;
  titular: string;
  consentimiento: string;
  fechaConsentimiento: string | null;
  anillo: Array<[number, number]>;
  sat: {
    fecha: string;
    resultado: string;
    fuente: string;
  };
}

interface CafetoLote {
  id: string;
  fincaId: string;
  tipoCosecha: string;
  inicio: string;
  entrega: string;
  kg: number;
  beneficio: string;
}

interface CafetoDataset {
  fincas: CafetoFinca[];
  lotes: CafetoLote[];
}

let cachedDemoLots: LotDetail[] | null = null;

function mapSatToGfw(resultado: string): GfwStatus {
  if (resultado === 'Sin deforestación') return 'clear';
  if (resultado === 'Deforestación confirmada') return 'blocked';
  if (resultado.toLowerCase().includes('alerta')) return 'alert';
  return 'pending';
}

function buildDemoEvents(lote: CafetoLote, finca: CafetoFinca): EpcisEvent[] {
  return [
    {
      id: `${lote.id}-ev-1`,
      event_type: 'ObjectEvent',
      event_time: `${lote.inicio}T08:00:00-05:00`,
      payload: {
        stage: 'finca',
        bizStep: 'harvesting',
        location: finca.nombre,
        producer: finca.titular,
      },
    },
    {
      id: `${lote.id}-ev-2`,
      event_type: 'AggregationEvent',
      event_time: `${lote.entrega}T11:30:00-05:00`,
      payload: {
        stage: 'acopio',
        bizStep: 'receiving',
        quantityKg: lote.kg,
        process: lote.beneficio,
      },
    },
    {
      id: `${lote.id}-ev-3`,
      event_type: 'TransformationEvent',
      event_time: `${lote.entrega}T16:15:00-05:00`,
      payload: {
        stage: 'trilladora',
        bizStep: 'commissioning',
        gfwStatus: mapSatToGfw(finca.sat.resultado),
      },
    },
  ];
}

async function loadDemoLots(): Promise<LotDetail[]> {
  if (cachedDemoLots) return cachedDemoLots;
  const response = await fetch('/data/cafeto.json');
  if (!response.ok) return [];
  const data = (await response.json()) as CafetoDataset;
  const fincaById = new Map(data.fincas.map((f) => [f.id, f]));

  cachedDemoLots = data.lotes
    .map((lote): LotDetail | null => {
      const finca = fincaById.get(lote.fincaId);
      if (!finca) return null;
      const boundary: GeoJsonPolygon | null =
        finca.anillo.length >= 4
          ? { type: 'Polygon', coordinates: [finca.anillo] }
          : null;

      return {
        id: lote.id,
        lot_code: lote.id,
        lot_name: `${finca.nombre} · ${lote.tipoCosecha}`,
        quantity: lote.kg,
        unit: 'kg',
        process: lote.beneficio,
        gfw_status: mapSatToGfw(finca.sat.resultado),
        evidence_blob_url: null,
        created_at: `${lote.entrega}T12:00:00-05:00`,
        farm_id: finca.id,
        farm_name: finca.nombre,
        captured_at: `${finca.sat.fecha}T10:00:00-05:00`,
        boundary_geojson: boundary,
        producer_name: finca.titular,
        verified_by_coop: finca.consentimiento === 'SI',
        epcis_events: buildDemoEvents(lote, finca),
      };
    })
    .filter((item): item is LotDetail => item !== null);

  return cachedDemoLots;
}

export async function fetchLots(
  gfwStatus: string,
  search: string,
): Promise<LotsResult> {
  const params = new URLSearchParams();
  if (gfwStatus && gfwStatus !== 'all') params.set('gfw_status', gfwStatus);
  if (search.trim()) params.set('search', search.trim());

  try {
    const res = await fetch(apiUrl(`/api/lots?${params.toString()}`), {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json()) as { lots: LotSummary[] };
      return { lots: data.lots, source: 'api' };
    }
  } catch {
    // Backend unreachable: falls through to the demo fixture only when VITE_DEMO_DATA=true.
  }

  let demo = demoData ? await loadDemoLots() : [];
  if (gfwStatus && gfwStatus !== 'all') {
    demo = demo.filter((lot) => lot.gfw_status === gfwStatus);
  }
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    demo = demo.filter(
      (lot) =>
        lot.lot_code.toLowerCase().includes(q) ||
        lot.farm_name.toLowerCase().includes(q) ||
        (lot.producer_name ?? '').toLowerCase().includes(q),
    );
  }
  return { lots: demo, source: 'demo' };
}

export async function fetchLotByCode(lotCode: string): Promise<LotDetailResult> {
  try {
    const res = await fetch(apiUrl(`/api/lots/${encodeURIComponent(lotCode)}`), {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const lot = (await res.json()) as LotDetail;
      return { lot, source: 'api' };
    }
    if (res.status === 404) {
      return { lot: null, source: 'api' };
    }
  } catch {
    // Backend unreachable: falls through to the demo fixture only when VITE_DEMO_DATA=true.
  }

  const demo = demoData ? await loadDemoLots() : [];
  const match = demo.find((lot) => lot.lot_code === lotCode) ?? null;
  return { lot: match, source: 'demo' };
}

export async function fetchSummary(): Promise<DashboardSummary | null> {
  try {
    const res = await fetch(apiUrl('/api/dashboard/summary'), {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return (await res.json()) as DashboardSummary;
  } catch {
    return null;
  }
}
