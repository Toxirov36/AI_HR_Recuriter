import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Props = {
  children: ReactNode;
  /** When this value changes (for example the route), a shown error is cleared. */
  resetKey?: string;
  /** `page` fills the viewport (top-level); `section` fits inside the app shell. */
  variant?: 'page' | 'section';
};

type State = { error: Error | null };

function ErrorFallback({ variant, onRetry }: { variant: 'page' | 'section'; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-3 px-6 text-center ${
        variant === 'page' ? 'min-h-screen' : 'min-h-[320px] py-16'
      }`}
    >
      <AlertTriangle className="h-10 w-10 text-amber-600" aria-hidden />
      <h2 className="text-lg font-semibold text-slate-900">{t('errorBoundary.title')}</h2>
      <p className="max-w-md text-sm text-slate-500">{t('errorBoundary.description')}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          {t('errorBoundary.retry')}
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t('errorBoundary.reload')}
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the details in the console for debugging; the user sees a friendly message.
    console.error('UI error caught by ErrorBoundary:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback variant={this.props.variant ?? 'section'} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}
