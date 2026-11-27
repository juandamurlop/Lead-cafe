import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchLotByCode } from '../api/client';
import type { DataSource } from '../api/client';
import { FarmPolygonMap } from '../components/FarmPolygonMap';
import type { LotDetail } from '../types/lot';

const GFW_COPY: Record<string, { label: string; tone: string }> = {
  clear: { label: 'Libre de deforestación (GFW / EUDR)', tone: 'clear' },
  alert: { label: 'Alerta satelital en revisión', tone: 'alert' },
  blocked: { label: 'No apto EUDR — deforestación detectada', tone: 'blocked' },
  pending: { label: 'Verificación GFW pendiente', tone: 'pending' },
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BuyerQrPage() {
  const { lotCode = '' } = useParams<{ lotCode: string }>();
  const [lot, setLot] = useState<LotDetail | null>(null);
  const [source, setSource] = useState<DataSource>('api');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchLotByCode(lotCode).then((res) => {
      if (!active) return;
      setLot(res.lot);
      setSource(res.source);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [lotCode]);

  if (loading) {
    return (
      <div className="qr-page">
        <p className="muted">Cargando pasaporte de trazabilidad…</p>
      </div>
    );
  }

  if (!lot) {
    return (
      <div className="qr-page">
        <div className="panel">
          <h1>Lote no encontrado</h1>
          <p className="muted">
            No encontramos registros para el código <span className="mono">{lotCode}</span>.
          </p>
          <Link to="/" className="qr-link">
            ← Volver al tablero de cumplimiento
          </Link>
        </div>
      </div>
    );
  }

  const gfwInfo = GFW_COPY[lot.gfw_status] ?? {
    label: lot.gfw_status,
    tone: 'pending',
  };

  return (
    <div className="qr-page">
      <header className="qr-header">
        <div>
          <Link to="/" className="back-link">
            ← Tablero de cumplimiento
          </Link>
          <p className="eyebrow">Pasaporte Digital de Lote · Lote Claro</p>
          <h1>
            <span className="mono">{lot.lot_code}</span>
            {lot.lot_name ? ` — ${lot.lot_name}` : ''}
          </h1>
        </div>
        <span className={`badge badge--${source === 'api' ? 'ok' : 'warn'}`}>
          {source === 'api' ? 'Registro verificado' : 'Vista de demostración'}
        </span>
      </header>

      <section className="qr-summary-grid">
        <article className="panel">
          <h2>Origen y Verificación EUDR</h2>
          <dl className="meta-list">
            <div>
              <dt>Finca</dt>
              <dd>{lot.farm_name}</dd>
            </div>
            <div>
              <dt>Productor</dt>
              <dd>
                {lot.producer_name ?? 'Sin nombre'}{' '}
                {lot.verified_by_coop ? (
                  <span className="pill pill--clear">Verificado por cooperativa</span>
                ) : (
                  <span className="pill pill--pending">Pendiente de cooperativa</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Cantidad y proceso</dt>
              <dd>
                {lot.quantity !== null
                  ? `${lot.quantity.toLocaleString('es-CO')} ${lot.unit ?? 'kg'}`
                  : '—'}
                {lot.process ? ` · ${lot.process}` : ''}
              </dd>
            </div>
            <div>
              <dt>Estado Global Forest Watch</dt>
              <dd>
                <span className={`pill pill--${gfwInfo.tone}`}>{gfwInfo.label}</span>
              </dd>
            </div>
            <div>
              <dt>Captura de polígono GPS</dt>
              <dd>{formatDateTime(lot.captured_at)}</dd>
            </div>
            <div>
              <dt>Evidencia de debida diligencia</dt>
              <dd>
                {lot.evidence_blob_url ? (
                  <a href={lot.evidence_blob_url} target="_blank" rel="noreferrer">
                    Descargar evidencia en Azure Blob Storage ↗
                  </a>
                ) : (
                  <span className="muted">No adjunta aún</span>
                )}
              </dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <h2>Polígono de Finca (WGS 84)</h2>
          {lot.boundary_geojson ? (
            <FarmPolygonMap lots={[lot]} height={280} />
          ) : (
            <p className="muted">Polígono GPS pendiente de ensamblaje.</p>
          )}
        </article>
      </section>

      <section className="panel">
        <h2>Cadena de Custodia GS1 EPCIS 2.0</h2>
        <p className="muted">
          Eventos registrados desde la finca hasta el punto de exportación.
        </p>
        {lot.epcis_events.length === 0 ? (
          <p className="muted">Aún no hay eventos EPCIS 2.0 registrados para este lote.</p>
        ) : (
          <ol className="timeline">
            {lot.epcis_events.map((ev) => (
              <li key={ev.id} className="timeline-item">
                <div className="timeline-dot" />
                <div className="timeline-body">
                  <div className="timeline-head">
                    <strong>{ev.event_type}</strong>
                    <span className="muted">{formatDateTime(ev.event_time)}</span>
                  </div>
                  <pre className="timeline-payload">
                    {JSON.stringify(ev.payload, null, 2)}
                  </pre>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
