import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { AuthContext, AuthPage } from '../features/auth';
import { Alert, Loading, Toaster } from '../components/ui';
import type { User } from '../types';
import { PublicApplyPage } from '../pages/public-apply';
import { LandingPage } from '../pages/landing';

export function AppProviders({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isPublicApply = location.pathname.startsWith('/apply/');
  const isInvitation =
    location.pathname === '/' && new URLSearchParams(location.search).has('invite');
  const isLanding = location.pathname === '/' && !isInvitation;
  const isAuthPage =
    location.pathname === '/login' || location.pathname === '/register' || isInvitation;
  const next = new URLSearchParams(location.search).get('next');
  const safeNext =
    next?.startsWith('/') &&
    !next.startsWith('//') &&
    !next.startsWith('/login') &&
    !next.startsWith('/register') &&
    !next.startsWith('/apply/')
      ? next
      : '/dashboard';
  const [user, setUser] = useState<User>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const session = await api<{ user: User | null }>('/auth/session');
      setUser(session.user ?? undefined);
      setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUser(undefined);
      else setError((e as Error).message);
    } finally {
      setReady(true);
    }
  }, []);

  const handleAuthSuccess = useCallback(async () => {
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (isPublicApply) return;
    void refresh();
    const expired = () => setUser(undefined);
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, [refresh, isPublicApply]);

  if (isPublicApply) return <PublicApplyPage />;

  if (isLanding) {
    if (ready && user) return <Navigate to="/dashboard" replace />;
    return <LandingPage />;
  }

  if (!ready) return <Loading />;
  if (!user && isAuthPage)
    return (
      <>
        <Alert message={error} />
        <AuthPage
          key={location.pathname}
          initialMode={location.pathname === '/register' || isInvitation ? 'register' : 'login'}
          onModeChange={(mode) => navigate(mode === 'register' ? '/register' : '/login')}
          onSuccess={handleAuthSuccess}
        />
      </>
    );

  if (!user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  if (isAuthPage) return <Navigate to={safeNext} replace />;

  return (
    <AuthContext.Provider value={{ user, refresh }}>
      {children}
      <Toaster />
    </AuthContext.Provider>
  );
}
