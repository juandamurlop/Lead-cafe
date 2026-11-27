import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchLots, fetchSummary } from '../api/client';
import type { DataSource } from '../api/client';
import { FarmPolygonMap } from '../components/FarmPolygonMap';
import type { DashboardSummary, LotSummary } from '../types/lot';

const GFW_LABELS: Record<string, string> = {
  clear: 'Sin deforestación',
  alert: 'Alerta GFW',
  blocked: 'Bloqueado EUDR',
  pending: 'Pendiente',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ComplianceDashboard() {
  const [lots, setLots] = useState<LotSummary[]>([]);
  const [source, setSource] = useState<DataSource>('api');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [gfwFilter, setGfwFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchLots(gfwFilter, search), fetchSummary()]).then(
      ([lotsRes, summaryRes]) => {
        if (!active) return;
        setLots(lotsRes.lots);
        setSource(lotsRes.source);
        setSummary(summaryRes);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [gfwFilter, search]);

  const metrics = useMemo(() => {
    const clear = lots.filter((l) => l.gfw_status === 'clear').length;
    const flagged = lots.filter(
      (l) => l.gfw_status === 'alert' || l.gfw_status === 'blocked',
    ).length;
    const verified = lots.filter((l) => l.verified_by_coop).length;
    const totalKg = lots.reduce((acc, l) => acc + (l.quantity ?? 0), 0);
    return { clear, flagged, verified, totalKg };
  }, [lots]);

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Lote Claro · Cumplimiento EUDR (Laura)</p>
          <h1>Tablero de Trazabilidad y Debida Diligencia</h1>
        </div>
        <div className="topbar-badges">
          <span className={`badge badge--${source === 'api' ? 'ok' : 'warn'}`}>
            {source === 'api' ? 'PostgreSQL en vivo' : 'Modo demostración (cafeto.json)'}
          </span>
          {summary && (
            <span className="badge badge--neutral">
              BD: {summary.farms} fincas · {summary.lots} lotes · {summary.events} eventos EPCIS
            </span>
          )}
        </div>
      </header>

      <section className="kpi-grid" aria-label="Indicadores de cumplimiento">
        <article className="kpi-card">
          <span className="kpi-label">Lotes visibles</span>
          <strong className="kpi-value">{lots.length}</strong>
        </article>
        <article className="kpi-card">
          <span className="kpi-label">Sin deforestación (GFW)</span>
          <strong className="kpi-value kpi-value--ok">{metrics.clear}</strong>
        </article>
        <article className="kpi-card">
          <span className="kpi-label">Alertas / Bloqueados</span>
          <strong className="kpi-value kpi-value--bad">{metrics.flagged}</strong>
        </article>
        <article className="kpi-card">
          <span className="kpi-label">Verificados por cooperativa</span>
          <strong className="kpi-value">{metrics.verified}</strong>
        </article>
        <article className="kpi-card">
          <span className="kpi-label">Volumen total</span>
          <strong className="kpi-value">
            {Math.round(metrics.totalKg).toLocaleString('es-CO')} kg
          </strong>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Polígonos EUDR de Fincas</h2>
          <div className="filters">
            <select
              aria-label="Filtrar por estado GFW"
              value={gfwFilter}
              onChange={(e) => setGfwFilter(e.target.value)}
            >
              <option value="all">Todos los estados GFW</option>
              <option value="clear">Sin deforestación</option>
              <option value="alert">Alerta GFW</option>
              <option value="blocked">Bloqueado EUDR</option>
              <option value="pending">Pendiente</option>
            </select>
            <input
              type="search"
              placeholder="Buscar lote, finca o caficultor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <FarmPolygonMap lots={lots} height={360} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Registro de Lotes y Evidencias</h2>
          <span className="muted">
            {loading ? 'Cargando…' : `${lots.length} resultados`}
          </span>
        </div>
        <div className="table-wrap">
          <table className="lots-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Finca / Productor</th>
                <th>Volumen</th>
                <th>Captura GPS</th>
                <th>Estado GFW</th>
                <th>Cooperativa</th>
                <th>Evidencia</th>
                <th>Pasaporte QR</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.id}>
                  <td className="mono">{lot.lot_code}</td>
                  <td>
                    <strong>{lot.farm_name}</strong>
                    <div className="muted">{lot.producer_name ?? 'Sin nombre'}</div>
                  </td>
                  <td>
                    {lot.quantity !== null
                      ? `${lot.quantity.toLocaleString('es-CO')} ${lot.unit ?? 'kg'}`
                      : '—'}
                  </td>
                  <td>{formatDate(lot.captured_at)}</td>
                  <td>
                    <span className={`pill pill--${lot.gfw_status}`}>
                      {GFW_LABELS[lot.gfw_status] ?? lot.gfw_status}
                    </span>
                  </td>
                  <td>
                    {lot.verified_by_coop ? (
                      <span className="pill pill--clear">Verificado</span>
                    ) : (
                      <span className="pill pill--pending">Sin verificar</span>
                    )}
                  </td>
                  <td>
                    {lot.evidence_blob_url ? (
                      <a
                        href={lot.evidence_blob_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver soporte
                      </a>
                    ) : (
                      <span className="muted">Pendiente</span>
                    )}
                  </td>
                  <td>
                    <Link className="qr-link" to={`/lot/${encodeURIComponent(lot.lot_code)}`}>
                      Abrir QR →
                    </Link>
                  </td>
                </tr>
              ))}
              {!loading && lots.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    No hay lotes que coincidan con el filtro actual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
