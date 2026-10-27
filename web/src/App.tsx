import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';

const HomePage = lazy(() => import('./pages/HomePage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const InheritorsPage = lazy(() => import('./pages/InheritorsPage'));
const InheritorDetailPage = lazy(() => import('./pages/InheritorDetailPage'));
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const OrganizationsPage = lazy(() => import('./pages/OrganizationsPage'));
const OrganizationDetailPage = lazy(() => import('./pages/OrganizationDetailPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="inheritors" element={<InheritorsPage />} />
        <Route path="inheritors/:id" element={<InheritorDetailPage />} />
        <Route path="explore" element={<ExplorePage />} />
        <Route path="organizations" element={<OrganizationsPage />} />
        <Route path="organizations/:id" element={<OrganizationDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
