export type GfwStatus = 'clear' | 'alert' | 'blocked' | 'pending' | string;

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface EpcisEvent {
  id: string;
  event_type: string;
  event_time: string;
  payload: Record<string, unknown>;
}

export interface LotSummary {
  id: string;
  lot_code: string;
  lot_name: string | null;
  quantity: number | null;
  unit: string | null;
  process: string | null;
  gfw_status: GfwStatus;
  evidence_blob_url: string | null;
  created_at: string;
  farm_id: string;
  farm_name: string;
  captured_at: string | null;
  boundary_geojson: GeoJsonPolygon | null;
  producer_name: string | null;
  verified_by_coop: boolean;
}

export interface LotDetail extends LotSummary {
  epcis_events: EpcisEvent[];
}

export interface DashboardSummary {
  farms: number;
  lots: number;
  events: number;
}
