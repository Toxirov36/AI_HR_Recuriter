import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../features/auth';
import { PageSkeleton } from '../components/ui';

const Dashboard = lazy(() =>
  import('../pages/dashboard').then((module) => ({ default: module.Dashboard })),
);
const Vacancies = lazy(() =>
  import('../pages/vacancies').then((module) => ({ default: module.Vacancies })),
);
const loadCandidates = () => import('../pages/candidates');
const Candidates = lazy(() =>
  loadCandidates().then((module) => ({ default: module.Candidates })),
);
const CandidateDetail = lazy(() =>
  loadCandidates().then((module) => ({ default: module.CandidateDetail })),
);
const loadPipeline = () => import('../pages/candidates/pipeline');
const loadTeam = () => import('../pages/settings/team');
const loadPlatform = () => import('../pages/platform-admin');
const PlatformAdmin = lazy(() =>
  loadPlatform().then((module) => ({ default: module.PlatformAdmin })),
);

const Pipeline = lazy(() => loadPipeline().then((module) => ({ default: module.Pipeline })));
const ApplicationDetail = lazy(() =>
  loadPipeline().then((module) => ({ default: module.ApplicationDetail })),
);
const Team = lazy(() => loadTeam().then((module) => ({ default: module.Team })));
const loadProfile = () => import('../pages/profile');
const Profile = lazy(() => loadProfile().then((module) => ({ default: module.Profile })));

export function preloadRoute(path: string) {
  if (path.startsWith('/dashboard')) return import('../pages/dashboard');
  if (path.startsWith('/vacancies')) return import('../pages/vacancies');
  if (path.startsWith('/candidates')) return loadCandidates();
  if (path.startsWith('/profile')) return loadProfile();
  if (path.startsWith('/platform-admin')) return loadPlatform();
  if (path.startsWith('/pipeline') || path.startsWith('/applications')) return loadPipeline();
  if (path.startsWith('/team') || path.startsWith('/admin')) return loadTeam();
  return Promise.resolve();
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

export function AppRouter() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/dashboard" element={<LazyPage><Dashboard /></LazyPage>} />
      <Route
        path="/platform-admin"
        element={
          user.platformRole === 'SUPER_ADMIN' ? (
            <LazyPage>
              <PlatformAdmin />
            </LazyPage>
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route path="/vacancies" element={<LazyPage><Vacancies /></LazyPage>} />
      <Route path="/candidates" element={<LazyPage><Candidates /></LazyPage>} />
      <Route path="/candidates/:id" element={<LazyPage><CandidateDetail /></LazyPage>} />
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
        path="/admin"
        element={
          user?.role === 'ADMIN' ? (
            <LazyPage>
              <Team />
            </LazyPage>
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/profile"
        element={
          <LazyPage>
            <Profile />
          </LazyPage>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
      <Route path="/team" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
