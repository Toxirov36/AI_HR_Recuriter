import React from 'react';
import { Check, Loader2, AlertCircle, Sparkles, RefreshCw } from 'lucide-react';
import { Progress } from './ui/progress';
import { Button } from './ui/button';

export interface ParseStatusResponse {
  status: 'PENDING' | 'EXTRACTING' | 'PARSING' | 'STRUCTURING' | 'COMPLETED' | 'FAILED';
  step: number;
  totalSteps: number;
  message: string;
  percent: number;
  error?: string;
  updatedAt?: number;
}

export interface ParseProgressProps {
  progress: ParseStatusResponse | null;
  onRetry?: () => void;
  className?: string;
}

export const PARSE_STEPS = [
  { step: 1, label: "Matn o'qildi va kontaktlar ajratilmoqda…" },
  { step: 2, label: "Ko'nikmalar va texnologiyalar aniqlanmoqda…" },
  { step: 3, label: "Ish tajribasi va ta'lim tahlil qilinmoqda…" },
  { step: 4, label: "Rezyume to'liq tahlil qilindi!" },
];

export function ParseProgress({ progress, onRetry, className = '' }: ParseProgressProps) {
  if (!progress) return null;

  const { status, message, error } = progress;
  const isFailed = status === 'FAILED';
  const isCompleted = status === 'COMPLETED';

  // Determine current active step (1-indexed)
  const currentStep = progress.step || (isCompleted ? 4 : 1);
  const totalSteps = progress.totalSteps || 4;
  const stepPercent = isCompleted ? 100 : Math.round((currentStep / totalSteps) * 100);

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 ${className}`}
      data-testid="parse-progress-container"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
              isFailed
                ? 'bg-red-50 text-red-600'
                : isCompleted
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-[#245e4f]/10 text-[#245e4f]'
            }`}
          >
            {isFailed ? (
              <AlertCircle size={18} />
            ) : isCompleted ? (
              <Check size={18} className="stroke-[2.5]" />
            ) : (
              <Sparkles size={18} className="animate-pulse" />
            )}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <span>AI Rezyume tahlili</span>
              {!isCompleted && !isFailed && (
                <span className="inline-flex items-center gap-1 text-[11px] font-normal text-[#245e4f] bg-[#245e4f]/10 px-1.5 py-0.5 rounded-md">
                  <Loader2 size={11} className="animate-spin" /> Fonga o'tkazildi
                </span>
              )}
            </h4>
            <p className="text-xs text-slate-500 truncate" title={message}>
              {message || (isCompleted ? "Tahlil muvaffaqiyatli yakunlandi" : "Kutilmoqda…")}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          {isFailed ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-100 text-red-700">
              Xatolik
            </span>
          ) : isCompleted ? (
            <span className="text-sm font-bold text-emerald-600">
              100%
            </span>
          ) : (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#245e4f]/10 text-[#245e4f]">
              Bosqich {currentStep} / {totalSteps}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        {isFailed ? (
          <div className="h-2 w-full bg-red-100 rounded-full" />
        ) : isCompleted ? (
          <Progress
            value={100}
            className="h-2 w-full bg-slate-100 [&>div]:bg-emerald-600 [&>div]:transition-all [&>div]:duration-500"
          />
        ) : (
          <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-[#245e4f] rounded-full transition-all duration-500 animate-pulse"
              style={{ width: `${stepPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Error View */}
      {isFailed ? (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-600" />
            <span>{error || message || "Tahlil jarayonida xatolik yuz berdi."}</span>
          </div>
          {onRetry && (
            <div className="pt-1 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-100 gap-1.5"
                onClick={onRetry}
              >
                <RefreshCw size={12} /> Qayta urinish
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* Steps List */
        <div className="space-y-2 pt-1 border-t border-slate-100">
          {PARSE_STEPS.map((s) => {
            const isStepDone = isCompleted || s.step < currentStep;
            const isStepActive = !isCompleted && s.step === currentStep;

            return (
              <div
                key={s.step}
                className={`flex items-center gap-2.5 text-xs transition-colors ${
                  isStepDone
                    ? 'text-slate-700'
                    : isStepActive
                      ? 'text-[#245e4f] font-medium'
                      : 'text-slate-400'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] ${
                    isStepDone
                      ? 'bg-emerald-100 text-emerald-700 font-bold'
                      : isStepActive
                        ? 'bg-[#245e4f] text-white'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isStepDone ? (
                    <Check size={11} className="stroke-[2.5]" />
                  ) : isStepActive ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    s.step
                  )}
                </div>
                <span className="truncate flex-1">{s.label}</span>
                <span className="text-[11px] font-medium shrink-0">
                  {isStepDone ? (
                    <span className="text-emerald-600">Bajarildi</span>
                  ) : isStepActive ? (
                    <span className="text-[#245e4f] flex items-center gap-1">
                      <Loader2 size={10} className="animate-spin" /> Jarayonda
                    </span>
                  ) : (
                    <span className="text-slate-400">Kutilmoqda</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
