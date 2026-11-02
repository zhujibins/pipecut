import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PlannerPage } from './pages/PlannerPage';
import { MaterialsPage } from './pages/MaterialsPage';
import { PartsPage } from './pages/PartsPage';
import { PlansPage } from './pages/PlansPage';
import { PlanDetailPage } from './pages/PlanDetailPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PlannerPage />} />
        <Route path="materials" element={<MaterialsPage />} />
        <Route path="parts" element={<PartsPage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="plans/:id" element={<PlanDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
