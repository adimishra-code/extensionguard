import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ScanPage } from './pages/ScanPage';
import { ScanDetail } from './pages/ScanDetail';
import { ExtensionsList } from './pages/ExtensionsList';
import { ExtensionDetail } from './pages/ExtensionDetail';
import { Settings } from './pages/Settings';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="scan" element={<ScanPage />} />
        <Route path="scans" element={<ExtensionsList />} />
        <Route path="scans/:id" element={<ScanDetail />} />
        <Route path="extensions" element={<ExtensionsList />} />
        <Route path="extensions/:id" element={<ExtensionDetail />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;