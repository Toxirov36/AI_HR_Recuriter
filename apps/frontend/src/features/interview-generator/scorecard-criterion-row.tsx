import { useState } from 'react';
import { Badge, Button, Card, Textarea } from '../../components/ui';
import { AlertCircle, Check, Info, Trash2, X } from 'lucide-react';
import { SCORECARD_RUBRIC } from './scorecard-rubric';
import type { ScorecardCriterion } from '../../types';

interface ScorecardCriterionRowProps {
  criterion: ScorecardCriterion;
  isInvalid: boolean;
  disabled?: boolean;
  onUpdate: (updated: ScorecardCriterion) => void;
  onRemove?: () => void;
}

export function ScorecardCriterionRow({
  criterion,
  isInvalid,
  disabled = false,
  onUpdate,
  onRemove,
}: ScorecardCriterionRowProps) {
  const [hoveredScore, setHoveredScore] = useState<number | null>(null);

  const activeLevel = criterion.score ? SCORECARD_RUBRIC[criterion.score] : null;
  const previewLevel = hoveredScore ? SCORECARD_RUBRIC[hoveredScore] : activeLevel;

  const hasScore = criterion.score !== null && criterion.score !== undefined && criterion.score >= 1;
  const missingEvidence = isInvalid || (hasScore && criterion.evidence.trim().length < 3);

  const categoryLabel =
    criterion.category === 'TECHNICAL'
      ? 'Texnik talab'
      : criterion.category === 'CORE'
        ? 'Umumiy kompetensiya'
        : 'Qo‘shimcha mezon';

  const categoryBadgeVariant =
    criterion.category === 'TECHNICAL'
      ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
      : criterion.category === 'CORE'
        ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
        : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';

  return (
    <Card
      className={`p-4 border transition-all ${
        missingEvidence
          ? 'border-rose-400 bg-rose-50/20 dark:border-rose-800/60 dark:bg-rose-950/10 shadow-sm'
          : hasScore
            ? 'border-slate-200 dark:border-slate-800 shadow-sm'
            : 'border-slate-200/80 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/20'
      }`}
    >
      {/* Header: Title & Category & Actions */}
      <div className="flex items-start justify-between gap-2 pb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              {criterion.name}
            </h4>
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${categoryBadgeVariant}`}
            >
              {categoryLabel}
            </span>
            {hasScore && activeLevel && (
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${activeLevel.badgeClass}`}
              >
                {activeLevel.label}
              </span>
            )}
          </div>
        </div>

        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onRemove}
            className="text-slate-400 hover:text-rose-600 h-7 w-7 p-0"
            title="Mezonni o‘chirish"
          >
            <Trash2 size={14} />
          </Button>
        )}
      </div>

      {/* 1-5 Score Button Selector */}
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 font-medium">Ball (1–5):</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((s) => {
              const rubric = SCORECARD_RUBRIC[s];
              const isSelected = criterion.score === s;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={disabled}
                  aria-label={`${s} ball: ${rubric.shortLabel}`}
                  onClick={() => {
                    const newScore = isSelected ? null : s;
                    onUpdate({
                      ...criterion,
                      score: newScore,
                    });
                  }}
                  onMouseEnter={() => setHoveredScore(s)}
                  onMouseLeave={() => setHoveredScore(null)}
                  className={`w-9 h-8 rounded text-xs font-bold transition-all flex items-center justify-center border ${
                    isSelected
                      ? rubric.activeButtonClass
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300'
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>

          {hasScore && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onUpdate({ ...criterion, score: null })}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 ml-1 flex items-center gap-0.5 underline"
            >
              <X size={12} />
              Tozalash
            </button>
          )}
        </div>

        {/* Dynamic Definition Preview (Interactive Anchor) */}
        {previewLevel && (
          <div
            className={`text-xs px-2.5 py-1.5 rounded border transition-colors flex items-start gap-1.5 ${
              previewLevel.badgeClass
            }`}
          >
            <Info size={14} className="shrink-0 mt-0.5 opacity-80" />
            <div>
              <span className="font-semibold">{previewLevel.label}: </span>
              <span className="opacity-90">{previewLevel.definition}</span>
            </div>
          </div>
        )}
      </div>

      {/* Mandatory Evidence or Notes */}
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <label
            htmlFor={`evidence-${criterion.id}`}
            className={`font-medium flex items-center gap-1 ${
              missingEvidence
                ? 'text-rose-600 dark:text-rose-400 font-semibold'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            Dalil yoki izoh {hasScore ? <span className="text-rose-500 font-bold">* (Ball qo‘yilganda majburiy)</span> : <span className="text-slate-400">(Ixtiyoriy)</span>}
          </label>
          <span className="text-[11px] text-slate-400">
            {criterion.evidence.length}/5000
          </span>
        </div>

        <Textarea
          id={`evidence-${criterion.id}`}
          rows={2}
          maxLength={5000}
          disabled={disabled}
          value={criterion.evidence}
          placeholder={
            hasScore
              ? 'Ushbu ballni asoslovchi aniq dalil yoki nomzod javobini yozing (majburiy)…'
              : 'Nomzodning ushbu mezon bo‘yicha tajribasi yoki kuzatuvlar…'
          }
          className={`text-xs resize-y ${
            missingEvidence
              ? 'border-rose-400 focus-visible:ring-rose-400 dark:border-rose-700'
              : ''
          }`}
          onChange={(e) =>
            onUpdate({
              ...criterion,
              evidence: e.target.value,
            })
          }
        />

        {missingEvidence && (
          <div className="flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
            <AlertCircle size={13} className="shrink-0" />
            <span>Interviewer ball qo‘yganda dalil yoki izoh yozishi majburiy!</span>
          </div>
        )}
      </div>
    </Card>
  );
}
