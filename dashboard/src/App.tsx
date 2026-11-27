import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ComplianceDashboard } from './pages/ComplianceDashboard';
import { BuyerQrPage } from './pages/BuyerQrPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ComplianceDashboard />} />
        <Route path="/lot/:lotCode" element={<BuyerQrPage />} />
      </Routes>
    </BrowserRouter>
  );
}
