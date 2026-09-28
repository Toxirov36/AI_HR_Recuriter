import type { ScorecardDecision } from '../../types';

export interface RubricLevel {
  score: number;
  label: string;
  definition: string;
  shortLabel: string;
  colorClass: string;
  activeButtonClass: string;
  badgeClass: string;
}

export const SCORECARD_RUBRIC: Record<number, RubricLevel> = {
  1: {
    score: 1,
    label: '1 — Tajriba ko‘rsatmadi',
    definition: 'Nomzod ushbu sohada amaliy tajriba yoki bazaviy tushunchalarni ko‘rsata olmadi.',
    shortLabel: 'Tajriba yo‘q',
    colorClass: 'text-rose-600 dark:text-rose-400',
    activeButtonClass: 'bg-rose-600 text-white hover:bg-rose-700 border-rose-600 shadow-sm',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
  },
  2: {
    score: 2,
    label: '2 — Boshlang‘ich tushuncha / Yo‘naltirish kerak',
    definition: 'Nazariy tushunchaga ega, ammo mustaqil ishlay olmaydi, doimiy mentorlik va yo‘naltirish talab etiladi.',
    shortLabel: 'Boshlang‘ich',
    colorClass: 'text-amber-600 dark:text-amber-400',
    activeButtonClass: 'bg-amber-500 text-white hover:bg-amber-600 border-amber-500 shadow-sm',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  },
  3: {
    score: 3,
    label: '3 — Mustaqil ishlay oladi',
    definition: 'Standart vazifalarni mustaqil, sifatli va ishonchli bajara oladi.',
    shortLabel: 'Mustaqil',
    colorClass: 'text-blue-600 dark:text-blue-400',
    activeButtonClass: 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600 shadow-sm',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  },
  4: {
    score: 4,
    label: '4 — Ilg‘or tajriba / Ilg‘or amaliyotlar',
    definition: 'Murakkab vazifalarni yecha oladi, chekka holatlarni (edge-cases) hisobga oladi, best practices qo‘llaydi.',
    shortLabel: 'Ilg‘or',
    colorClass: 'text-indigo-600 dark:text-indigo-400',
    activeButtonClass: 'bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-600 shadow-sm',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
  },
  5: {
    score: 5,
    label: '5 — Murakkab tizimlarni loyihalagan va boshqalarga mentorlik qilgan',
    definition: 'Murakkab tizimlarni arxitektura qilgan, texnik standartlarni belgilagan va jamoaga mentorlik qilgan.',
    shortLabel: 'Ekspert / Mentor',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    activeButtonClass: 'bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600 shadow-sm',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  },
};

export const DEFAULT_CORE_CRITERIA = [
  {
    id: 'core-problem-solving',
    name: 'Problem solving',
    description: 'Muammolarni tahlil qilish, yechim topish va algoritmik fikrlash qobiliyati',
    category: 'CORE' as const,
  },
  {
    id: 'core-communication',
    name: 'Communication',
    description: 'G‘oyalarni aniq, lo‘nda va tushunarli ifodalash, faol tinglash',
    category: 'CORE' as const,
  },
  {
    id: 'core-team-collaboration',
    name: 'Team collaboration',
    description: 'Jamoaviy muhitda ishlash, fikr-mulohazalarni qabul qilish va hamkorlik',
    category: 'CORE' as const,
  },
];

export interface DecisionConfig {
  value: ScorecardDecision;
  label: string;
  description: string;
  badgeClass: string;
  borderClass: string;
  iconColor: string;
}

export const FINAL_DECISION_CONFIGS: Record<ScorecardDecision, DecisionConfig> = {
  STRONG_HIRE: {
    value: 'STRONG_HIRE',
    label: 'Qat‘iy qabul qilish (Strong Hire)',
    description: 'Nomzod barcha mezonlar bo‘yicha talablardan ancha yuqori va jamoani kuchaytiradi.',
    badgeClass: 'bg-emerald-600 text-white',
    borderClass: 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20',
    iconColor: 'text-emerald-600',
  },
  HIRE: {
    value: 'HIRE',
    label: 'Qabul qilish (Hire)',
    description: 'Nomzod asosiy talablarga to‘liq javob beradi va mustaqil ishlay oladi.',
    badgeClass: 'bg-teal-600 text-white',
    borderClass: 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20',
    iconColor: 'text-teal-600',
  },
  NO_HIRE: {
    value: 'NO_HIRE',
    label: 'Rad etish (No Hire)',
    description: 'Nomzodning tajribasi hozirgi talablarga mos kelmaydi.',
    badgeClass: 'bg-amber-600 text-white',
    borderClass: 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20',
    iconColor: 'text-amber-600',
  },
  STRONG_NO_HIRE: {
    value: 'STRONG_NO_HIRE',
    label: 'Qat‘iy rad etish (Strong No Hire)',
    description: 'Nomzod muhim mezonlar bo‘yicha mutlaqo tajriba ko‘rsatmadi yoki madaniy mos emas.',
    badgeClass: 'bg-rose-600 text-white',
    borderClass: 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20',
    iconColor: 'text-rose-600',
  },
  UNDECIDED: {
    value: 'UNDECIDED',
    label: 'Hali qaror qilinmagan (Pending)',
    description: 'Suhbat yakunlanmagan yoki qo‘shimcha texnik/HR suhbat talab etiladi.',
    badgeClass: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    borderClass: 'border-slate-300 bg-slate-50/50 dark:bg-slate-900/20',
    iconColor: 'text-slate-500',
  },
};
