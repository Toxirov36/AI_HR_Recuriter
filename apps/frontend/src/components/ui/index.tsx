import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, LoaderCircle, Inbox, AlertCircle } from 'lucide-react';
import { label } from '../../lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog';
import { Checkbox } from './checkbox';
import { Badge as ShadcnBadge } from './badge';
import { Alert as ShadcnAlert } from './alert';
import { Skeleton } from './skeleton';

export { label } from '../../lib/utils';
export { useData } from '../../lib/query-client';

export const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// Re-export shadcn components
export * from './button';
export * from './card';
export * from './dialog';
export * from './input';
export * from './textarea';
export * from './table';
export * from './tabs';
export * from './avatar';
export * from './separator';
export * from './skeleton';
export * from './select';
export * from './checkbox';
export * from './tooltip';
export * from './sonner';
export * from './alert-dialog';
export * from './dropdown-menu';
export * from './sheet';
export * from './scroll-area';
export * from './accordion';
export * from './progress';
export { Badge as ShadcnBadge, badgeVariants } from './badge';
export { Alert as ShadcnAlert, AlertTitle, AlertDescription } from './alert';

export function Alert({
  message,
  children,
  className,
  ...props
}: {
  message?: string;
  children?: ReactNode;
  className?: string;
  [key: string]: any;
}) {
  if (message) {
    return (
      <div className={`alert ${className || ''}`} role="alert" {...props}>
        <AlertCircle size={17} />
        {message}
      </div>
    );
  }
  if (children) {
    return (
      <ShadcnAlert className={className} {...props}>
        {children}
      </ShadcnAlert>
    );
  }
  return null;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} /> Loading your workspace…
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading page">
      <span className="sr-only">Loading page…</span>
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-36 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
export function Badge({
  value,
  children,
  className,
  variant,
  ...props
}: {
  value?: string;
  children?: ReactNode;
  className?: string;
  variant?: any;
  [key: string]: any;
}) {
  if (value) {
    return (
      <span className={`badge ${value.toLowerCase()} ${className || ''}`} {...props}>
        <i />
        {label(value)}
      </span>
    );
  }
  return (
    <ShadcnBadge variant={variant} className={className} {...props}>
      {children}
    </ShadcnBadge>
  );
}
export function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={26} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow?: string;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  close,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        className={`z-[100] max-h-[92vh] max-w-[620px] overflow-y-auto p-7 rounded-[18px] bg-white border border-[#e2e8f0] text-[#0f172a] shadow-2xl ${className}`}
      >
        <DialogHeader className="text-left mb-4">
          <DialogTitle className="text-xl font-bold tracking-tight text-[#0f172a]">{title}</DialogTitle>
          {subtitle && <p className="modal-subtitle text-sm text-[#64748b] mt-1">{subtitle}</p>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Pagination({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {total ? `${(page - 1) * 20 + 1}–${Math.min(page * 20, total)} of ${total}` : '0 results'}
      </span>
      <div>
        <button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
          <ArrowLeft size={15} /> Previous
        </button>
        <button
          className="secondary"
          disabled={page * 20 >= total}
          onClick={() => setPage(page + 1)}
        >
          Next <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
export function AiConsent({
  checked,
  onChange,
  configured,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  configured: boolean;
}) {
  return (
    <div className="ai-consent">
      {!configured && (
        <Alert message="AI is not configured. Add GEMINI_API_KEY to the backend environment to enable it." />
      )}
      <label className="check">
        <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} /> I am
        authorized to send this CV and vacancy information to Google Gemini for processing.
      </label>
      <small>
        AI output can be incomplete or incorrect. Verify evidence yourself. Hiring decisions stay
        with your team.
      </small>
    </div>
  );
}
