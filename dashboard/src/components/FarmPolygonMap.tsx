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

const STATUS_SEVERITY: Record<string, number> = {
  blocked: 3,
  alert: 2,
  pending: 1,
  clear: 0,
};

function colorForStatus(status: GfwStatus): string {
  return STATUS_COLORS[status] ?? '#0284c7';
}

function worstStatus(statuses: GfwStatus[]): GfwStatus {
  return statuses.reduce<GfwStatus>((worst, current) => {
    const currentScore = STATUS_SEVERITY[current] ?? 1;
    const worstScore = STATUS_SEVERITY[worst] ?? 1;
    return currentScore > worstScore ? current : worst;
  }, statuses[0] ?? 'pending');
}

export function FarmPolygonMap({ lots, height = 360 }: FarmPolygonMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.FeatureGroup | null>(null);

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

    // Global Forest Watch tree-cover loss (Hansen/UMD), on by default for EUDR review.
    const gfwLoss = L.tileLayer(
      'https://tiles.globalforestwatch.org/umd_tree_cover_loss/v1.13/dynamic/{z}/{x}/{y}.png',
      { attribution: 'Tree cover loss: Hansen/UMD/Google/USGS/NASA via Global Forest Watch', maxNativeZoom: 12, maxZoom: 18, opacity: 0.8 },
    ).addTo(map);
    L.control.layers(undefined, { 'Pérdida de cobertura arbórea (GFW)': gfwLoss }, { collapsed: false }).addTo(map);

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

    // Group lots by farm so a clear lot never paints over a blocked/alert lot on the same plot.
    const lotsByFarm = new Map<string, LotSummary[]>();
    for (const lot of lots) {
      if (!lot.boundary_geojson) continue;
      const existing = lotsByFarm.get(lot.farm_id);
      if (existing) {
        existing.push(lot);
      } else {
        lotsByFarm.set(lot.farm_id, [lot]);
      }
    }

    if (lotsByFarm.size === 0) return;

    const farmGroups = Array.from(lotsByFarm.values()).map((farmLots) => {
      const primary = farmLots[0];
      const status = worstStatus(farmLots.map((l) => l.gfw_status));
      return { primary, farmLots, status };
    });

    const features = farmGroups.map(({ primary, farmLots, status }) => ({
      type: 'Feature' as const,
      geometry: primary.boundary_geojson!,
      properties: {
        lot_codes: farmLots.map((l) => `${l.lot_code} (${l.gfw_status})`).join(', '),
        farm_name: primary.farm_name,
        producer_name: primary.producer_name ?? 'Sin nombre',
        gfw_status: status,
      },
    }));

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
            lot_codes: string;
            farm_name: string;
            producer_name: string;
            gfw_status: string;
          };
          layer.bindPopup(
            `<strong>${props.farm_name}</strong><br/>Lotes: ${props.lot_codes}<br/>Productor: ${props.producer_name}<br/>GFW: ${props.gfw_status}`,
          );
        },
      },
    );

    const markers = L.featureGroup();
    for (const { primary, farmLots, status } of farmGroups) {
      const plotBounds = L.geoJSON(primary.boundary_geojson!).getBounds();
      const center = plotBounds.getCenter();
      const color = colorForStatus(status);
      const lotList = farmLots.map((l) => l.lot_code).join(', ');
      L.circleMarker(center, {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.95,
      })
        .bindPopup(
          `<strong>${primary.farm_name}</strong><br/>Lotes: ${lotList}<br/>Productor: ${primary.producer_name ?? 'Sin nombre'}<br/>GFW: ${status}<br/><em>Haz clic para ver el polígono</em>`,
        )
        .on('click', () => map.fitBounds(plotBounds.pad(2), { maxZoom: 18 }))
        .addTo(markers);
    }

    const group = L.featureGroup([geoLayer, markers]).addTo(map);
    layerRef.current = group;

    map.invalidateSize();
    const bounds = group.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
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
