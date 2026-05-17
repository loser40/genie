import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles/theme.css';
import './styles/animations.css';
import './styles/app.css';
import { LampWidget } from './components/lamp/LampWidget';
import { CapsulePage } from './pages/CapsulePage';
import { GraphPage } from './pages/GraphPage';
import { HomePage } from './pages/HomePage';
import { RepairPage } from './pages/RepairPage';
import { ScanPage } from './pages/ScanPage';

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <div className="genie-app">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/scan/:id" element={<ScanPage />} />
          <Route path="/graph/:id" element={<GraphPage />} />
          <Route path="/repair/:id" element={<RepairPage />} />
          <Route path="/capsule/:id" element={<CapsulePage />} />
        </Routes>
        <LampWidget />
      </div>
    </BrowserRouter>
  );
}
