import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { GfwStatus, LotSummary } from '../types/lot';

interface FarmPolygonMapProps {
  lots: LotSummary[];
  height?: number;
}

const STATUS_COLORS: Record<string, string> = {
  clear: '#16a34a',
  alert: '#d97706',
  blocked: '#dc2626',
  pending: '#64748b',
};

function colorForStatus(status: GfwStatus): string {
  return STATUS_COLORS[status] ?? '#0284c7';
}

export function FarmPolygonMap({ lots, height = 360 }: FarmPolygonMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [4.57, -75.65],
      zoom: 6,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (layerRef.current) {
      layerRef.current.remove();
      layerRef.current = null;
    }

    const features = lots
      .filter((lot) => lot.boundary_geojson !== null)
      .map((lot) => ({
        type: 'Feature' as const,
        geometry: lot.boundary_geojson!,
        properties: {
          lot_code: lot.lot_code,
          farm_name: lot.farm_name,
          producer_name: lot.producer_name ?? 'Sin nombre',
          gfw_status: lot.gfw_status,
        },
      }));

    if (features.length === 0) return;

    const geoLayer = L.geoJSON(
      { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection,
      {
        style: (feature) => {
          const status = (feature?.properties?.gfw_status as string) ?? 'pending';
          const color = colorForStatus(status);
          return {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.28,
          };
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties as {
            lot_code: string;
            farm_name: string;
            producer_name: string;
            gfw_status: string;
          };
          layer.bindPopup(
            `<strong>${props.lot_code}</strong><br/>${props.farm_name}<br/>Productor: ${props.producer_name}<br/>GFW: ${props.gfw_status}`,
          );
        },
      },
    ).addTo(map);

    layerRef.current = geoLayer;

    const bounds = geoLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    }
  }, [lots]);

  return (
    <div
      ref={containerRef}
      className="polygon-map"
      style={{ height: `${height}px` }}
      aria-label="Mapa de polígonos EUDR de fincas cafeteras"
    />
  );
}
