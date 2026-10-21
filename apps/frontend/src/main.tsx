import React, { lazy, Suspense, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from './components/error-boundary';
import { localeReady } from './i18n';
import { initTheme } from './lib/theme';
import { applyRobotsMeta, isLandingPath } from './lib/seo';
// Self-hosted fonts (no third-party requests, so the CSP needs no Google font hosts).
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import './landing-base.css';

initTheme();

// The landing page is the first screen of most visitors, so it is a small entry of its own.
// Everything else (shell, auth, dashboards, the full stylesheet) loads on demand from app-root.
const LandingPage = lazy(() => import('./pages/landing').then((m) => ({ default: m.LandingPage })));
const AppRoot = lazy(() => import('./app-root'));

/** Shows the landing page at once and sends an already signed-in visitor to the dashboard. */
function LandingEntry() {
  const navigate = useNavigate();
  useEffect(() => {
    applyRobotsMeta('/');
  }, []);  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { user?: unknown } | null) => {
        if (active && body?.user) navigate('/dashboard', { replace: true });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [navigate]);
  return <LandingPage />;
}

function Root() {
  const { pathname, search } = useLocation();
  const landing = isLandingPath(pathname) && !new URLSearchParams(search).has('invite');
  return (
    <Suspense fallback={<div role="status" aria-busy="true" style={{ minHeight: '100vh' }} />}>
      {landing ? <LandingEntry /> : <AppRoot />}
    </Suspense>
  );
}

void localeReady.then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <ErrorBoundary variant="page">
          <Root />
        </ErrorBoundary>
      </BrowserRouter>
    </React.StrictMode>,
  );
});
