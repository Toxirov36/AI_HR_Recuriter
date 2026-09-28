import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { AuthContext, AuthPage } from '../features/auth';
import { Alert, Loading, Toaster } from '../components/ui';
import type { User } from '../types';
import { PublicApplyPage } from '../pages/public-apply';

export function AppProviders({ children }: { children: ReactNode }) {
  const isPublicApply = window.location.pathname.startsWith('/apply/');
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

  useEffect(() => {
    if (isPublicApply) return;
    void refresh();
    const expired = () => setUser(undefined);
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, [refresh, isPublicApply]);

  if (isPublicApply) return <PublicApplyPage />;

  if (!ready) return <Loading />;
  if (!user)
    return (
      <>
        <Alert message={error} />
        <AuthPage onSuccess={refresh} />
      </>
    );

  return (
    <AuthContext.Provider value={{ user, refresh }}>
      {children}
      <Toaster />
    </AuthContext.Provider>
  );
}
