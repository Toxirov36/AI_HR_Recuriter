import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * AI requests report no progress, so the percentage is an estimate over time: it climbs quickly at first, slows
 * towards 95% and only reaches 100% when the result actually arrives.
 */
export function useEstimatedProgress(active: boolean) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (active) {
      setProgress(0);
      setVisible(true);
      const timer = window.setInterval(() => setProgress((p) => p + (95 - p) * 0.04), 200);
      return () => window.clearInterval(timer);
    }
    if (!visible) return;
    setProgress(100);
    const hide = window.setTimeout(() => setVisible(false), 900);
    return () => window.clearTimeout(hide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return { progress: Math.min(100, Math.round(progress)), visible };
}

/** A labelled progress bar with the estimated percentage; renders nothing while idle. */
export function GenerationProgress({ active, label, doneLabel, className }: { active: boolean; label: string; doneLabel?: string; className?: string }) {
  const { t } = useTranslation();
  const { progress, visible } = useEstimatedProgress(active);
  if (!visible) return null;
  return (
    <div role="status" className={`grid gap-1.5 ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-3 muted small">
        <span>{progress >= 100 ? (doneLabel ?? t('vacancyGenerator.ready', 'Draft ready')) : label}</span>
        <strong className="tabular-nums">{progress}%</strong>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800"
      >
        <div
          className="h-full rounded-full bg-[#1a5d4c] transition-[width] duration-200 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
