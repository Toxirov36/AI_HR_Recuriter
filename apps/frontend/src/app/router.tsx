import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../features/auth';
import { Dashboard } from '../pages/dashboard';
import { Vacancies } from '../pages/vacancies';
import { CandidateDetail, Candidates } from '../pages/candidates';
import { PageSkeleton } from '../components/ui';

const loadPipeline = () => import('../pages/candidates/pipeline');
const loadTeam = () => import('../pages/settings/team');

const Pipeline = lazy(() => loadPipeline().then((module) => ({ default: module.Pipeline })));
const ApplicationDetail = lazy(() =>
  loadPipeline().then((module) => ({ default: module.ApplicationDetail })),
);
const Team = lazy(() => loadTeam().then((module) => ({ default: module.Team })));

export function preloadRoute(path: string) {
  if (path.startsWith('/pipeline') || path.startsWith('/applications')) return loadPipeline();
  if (path.startsWith('/team')) return loadTeam();
  return Promise.resolve();
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

export function AppRouter() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/vacancies" element={<Vacancies />} />
      <Route path="/candidates" element={<Candidates />} />
      <Route path="/candidates/:id" element={<CandidateDetail />} />
      <Route
        path="/pipeline"
        element={
          <LazyPage>
            <Pipeline />
          </LazyPage>
        }
      />
      <Route
        path="/applications/:id"
        element={
          <LazyPage>
            <ApplicationDetail />
          </LazyPage>
        }
      />
      <Route
        path="/team"
        element={
          user.role === 'ADMIN' ? (
            <LazyPage>
              <Team />
            </LazyPage>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
