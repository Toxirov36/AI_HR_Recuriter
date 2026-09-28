import { useState } from 'react';
import { Badge, Button, Card, Input, Textarea } from '../../components/ui';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Plus,
  Scale,
  ShieldCheck,
  Star,
  UserCheck,
} from 'lucide-react';
import { ScorecardCriterionRow } from './scorecard-criterion-row';
import {
  FINAL_DECISION_CONFIGS,
  SCORECARD_RUBRIC,
} from './scorecard-rubric';
import type {
  ScorecardCriterion,
  ScorecardDecision,
  StructuredScorecard,
} from '../../types';

interface ScorecardSectionProps {
  scorecard: StructuredScorecard;
  invalidCriterionIds: Set<string>;
  disabled?: boolean;
  onChange: (updated: StructuredScorecard) => void;
}

export function ScorecardSection({
  scorecard,
  invalidCriterionIds,
  disabled = false,
  onChange,
}: ScorecardSectionProps) {
  const [newCriterionName, setNewCriterionName] = useState('');
  const [addingCustom, setAddingCustom] = useState(false);

  const criteria = scorecard.criteria;
  const scoredCount = criteria.filter(
    (c) => c.score !== null && c.score !== undefined && c.score >= 1,
  ).length;

  const totalScores = criteria
    .filter((c) => c.score !== null && c.score !== undefined && c.score >= 1)
    .reduce((sum, c) => sum + (c.score ?? 0), 0);

  const averageScore =
    scoredCount > 0 ? Number((totalScores / scoredCount).toFixed(1)) : null;

  const technicalCriteria = criteria.filter((c) => c.category === 'TECHNICAL');
  const coreCriteria = criteria.filter((c) => c.category === 'CORE');
  const customCriteria = criteria.filter((c) => c.category === 'CUSTOM');

  const updateCriterion = (updated: ScorecardCriterion) => {
    const nextCriteria = criteria.map((c) => (c.id === updated.id ? updated : c));
    onChange({
      ...scorecard,
      criteria: nextCriteria,
      averageScore: averageScore ?? undefined,
    });
  };

  const removeCriterion = (id: string) => {
    const nextCriteria = criteria.filter((c) => c.id !== id);
    onChange({
      ...scorecard,
      criteria: nextCriteria,
    });
  };

  const addCustomCriterion = () => {
    const trimmed = newCriterionName.trim();
    if (!trimmed) return;
    const newCrit: ScorecardCriterion = {
      id: `custom-${Date.now()}`,
      name: trimmed,
      category: 'CUSTOM',
      score: null,
      evidence: '',
    };
    onChange({
      ...scorecard,
      criteria: [...criteria, newCrit],
    });
    setNewCriterionName('');
    setAddingCustom(false);
  };

  const setFinalDecision = (decision: ScorecardDecision) => {
    onChange({
      ...scorecard,
      finalDecision: decision,
    });
  };

  const setDecisionNotes = (notes: string) => {
    onChange({
      ...scorecard,
      decisionNotes: notes,
    });
  };

  const decisionConfig = FINAL_DECISION_CONFIGS[scorecard.finalDecision];

  return (
    <div className="space-y-6">
      {/* Overview Statistics Banner */}
      <Card className="p-4 border border-slate-200 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/60 dark:to-slate-900/20 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Scale className="text-[#245e4f] dark:text-emerald-400" size={18} />
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                Strukturaviy baholash mezonlari (Scorecard)
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Har bir mezon 1–5 shkalada baholanadi. Ball qo‘yilganda asoslovchi dalil yozish majburiydir.
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-right">
              <span className="text-[11px] text-slate-400 block font-medium">Baholandi</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {scoredCount} / {criteria.length}
              </span>
            </div>

            <div className="text-right border-l pl-4 dark:border-slate-800">
              <span className="text-[11px] text-slate-400 block font-medium">O‘rtacha ball</span>
              <div className="flex items-center gap-1">
                <Star
                  size={15}
                  className={averageScore ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}
                />
                <span className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                  {averageScore ? `${averageScore} / 5.0` : '—'}
                </span>
              </div>
            </div>

            <div className="text-right border-l pl-4 dark:border-slate-800">
              <span className="text-[11px] text-slate-400 block font-medium">Yakuniy qaror</span>
              <Badge className={`text-xs font-semibold ${decisionConfig.badgeClass}`}>
                {decisionConfig.label}
              </Badge>
            </div>
          </div>
        </div>

        {/* Rubric Scale Quick Legend */}
        <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
          {[1, 2, 3, 4, 5].map((s) => {
            const r = SCORECARD_RUBRIC[s];
            return (
              <div
                key={s}
                className="p-2 rounded bg-white dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 space-y-0.5"
              >
                <div className="font-bold flex items-center gap-1.5">
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white ${r.activeButtonClass.split(' ')[0]}`}
                  >
                    {s}
                  </span>
                  <span className={r.colorClass}>{r.shortLabel}</span>
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-2" title={r.definition}>
                  {r.definition}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Technical Criteria from Vacancy */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              1. Texnik mezonlar (Vakansiya talablari)
            </h4>
            <Badge variant="outline" className="text-xs">
              {technicalCriteria.length} ta mezon
            </Badge>
          </div>
        </div>

        {technicalCriteria.length === 0 ? (
          <p className="text-xs text-slate-400 italic p-3 bg-slate-50 dark:bg-slate-900/30 rounded border">
            Vakansiyada alohida texnik talablar belgilanmagan.
          </p>
        ) : (
          <div className="space-y-3">
            {technicalCriteria.map((criterion) => (
              <ScorecardCriterionRow
                key={criterion.id}
                criterion={criterion}
                disabled={disabled}
                isInvalid={invalidCriterionIds.has(criterion.id)}
                onUpdate={updateCriterion}
              />
            ))}
          </div>
        )}
      </div>

      {/* Core Competencies */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              2. Umumiy kompetensiyalar (Core Competencies)
            </h4>
            <Badge variant="outline" className="text-xs">
              {coreCriteria.length} ta mezon
            </Badge>
          </div>
        </div>

        <div className="space-y-3">
          {coreCriteria.map((criterion) => (
            <ScorecardCriterionRow
              key={criterion.id}
              criterion={criterion}
              disabled={disabled}
              isInvalid={invalidCriterionIds.has(criterion.id)}
              onUpdate={updateCriterion}
            />
          ))}
        </div>
      </div>

      {/* Custom Criteria (if any) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              3. Qo‘shimcha mezonlar
            </h4>
            {customCriteria.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {customCriteria.length} ta mezon
              </Badge>
            )}
          </div>

          {!addingCustom && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => setAddingCustom(true)}
              className="text-xs h-8"
            >
              <Plus size={13} className="mr-1" />
              Yangi mezon qo‘shish
            </Button>
          )}
        </div>

        {addingCustom && (
          <Card className="p-3 border border-emerald-300 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/20">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Yangi mezon nomi (masalan: Microservices, System design, Agile)…"
                value={newCriterionName}
                onChange={(e) => setNewCriterionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomCriterion();
                  }
                }}
                className="text-xs h-9"
                autoFocus
              />
              <Button
                type="button"
                size="sm"
                className="bg-[#245e4f] hover:bg-[#1b4338] text-white h-9"
                onClick={addCustomCriterion}
                disabled={!newCriterionName.trim()}
              >
                Qo‘shish
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 text-slate-500"
                onClick={() => {
                  setAddingCustom(false);
                  setNewCriterionName('');
                }}
              >
                Bekor qilish
              </Button>
            </div>
          </Card>
        )}

        {customCriteria.map((criterion) => (
          <ScorecardCriterionRow
            key={criterion.id}
            criterion={criterion}
            disabled={disabled}
            isInvalid={invalidCriterionIds.has(criterion.id)}
            onUpdate={updateCriterion}
            onRemove={() => removeCriterion(criterion.id)}
          />
        ))}
      </div>

      {/* Final Human Decision Card */}
      <Card className="p-5 border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md space-y-4">
        <div className="flex items-start justify-between gap-2 border-b pb-3 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <UserCheck size={20} className="text-[#245e4f] dark:text-emerald-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Yakuniy insoniy qaror (Human Accountability)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              AI nomzodni qabul qilmaydi yoki rad etmaydi. Qaror faqat interviewer tomonidan mustaqil ravishda qabul qilinadi.
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800 font-medium">
            <ShieldCheck size={14} />
            <span>NIST AI RMF Compliant</span>
          </div>
        </div>

        {/* 5 Decision Option Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {(Object.keys(FINAL_DECISION_CONFIGS) as ScorecardDecision[]).map((key) => {
            const conf = FINAL_DECISION_CONFIGS[key];
            const isSelected = scorecard.finalDecision === key;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => setFinalDecision(key)}
                className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                  isSelected
                    ? `${conf.borderClass} ring-2 ring-offset-1 ring-slate-400 dark:ring-slate-600 shadow-sm`
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded ${conf.badgeClass}`}
                    >
                      {conf.label.split('(')[0].trim()}
                    </span>
                    {isSelected && (
                      <CheckCircle2 size={16} className={conf.iconColor} />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {conf.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Decision Notes Textarea */}
        <div className="space-y-1.5 pt-2">
          <label
            htmlFor="decision-notes"
            className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
          >
            Yakuniy qaror asosnomasi (Inson xulosasi)
          </label>
          <Textarea
            id="decision-notes"
            rows={3}
            maxLength={5000}
            disabled={disabled}
            value={scorecard.decisionNotes ?? ''}
            placeholder="Nima sababdan ushbu qaror qabul qilindi? Nomzodning kuchli tomonlari, xatarlar yoki kelajakdagi rivojlanish nuqtalari…"
            className="text-xs resize-y"
            onChange={(e) => setDecisionNotes(e.target.value)}
          />
        </div>

        {/* Attribution & Timestamp Metadata */}
        {scorecard.decidedBy && (
          <div className="text-xs text-slate-500 flex items-center gap-2 pt-2 border-t dark:border-slate-800">
            <span className="font-medium">Baholovchi:</span>
            <span className="text-slate-700 dark:text-slate-300 font-semibold">
              {scorecard.decidedBy}
            </span>
            {scorecard.decidedAt && (
              <>
                <span>·</span>
                <span>{new Date(scorecard.decidedAt).toLocaleString()}</span>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
