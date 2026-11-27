import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ComplianceDashboard } from './pages/ComplianceDashboard';
import { BuyerQrPage } from './pages/BuyerQrPage';

const CafetoPage = lazy(() => import('./pages/CafetoPage'));

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ComplianceDashboard />} />
        <Route path="/cafeto" element={<Suspense fallback={<p role="status">Cargando Cafeto…</p>}><CafetoPage /></Suspense>} />
        <Route path="/lot/:lotCode" element={<BuyerQrPage />} />
      </Routes>
    </BrowserRouter>
  );
}
