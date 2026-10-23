export type SalaryCurrency = 'UZS' | 'USD';

export type SalaryFields = {
  salaryFrom?: number | null;
  salaryTo?: number | null;
  salaryCurrency?: string | null;
  salaryNegotiable?: boolean | null;
};

/** 5000000 -> "5 000 000" (thin groups of three, the way sums are written in Uzbekistan). */
export function groupAmount(value: number | string | null | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** What HR typed ("5 000 000", "5,000,000", "5 mln" is not understood) -> a whole number, or null when empty. */
export function parseAmount(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  if (!digits) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

type Words = { negotiable: string; from: string; to: string; uzs: string; usd: string };

/** The pay line shown to people: "5 000 000 – 8 000 000 so'm", "dan 800 USD", "Kelishiladi"; null when nothing is set. */
export function salaryLabel(fields: SalaryFields, words: Words): string | null {
  if (fields.salaryNegotiable) return words.negotiable;
  const { salaryFrom: from, salaryTo: to } = fields;
  if (from == null && to == null) return null;
  const currency = fields.salaryCurrency === 'USD' ? words.usd : words.uzs;
  if (from != null && to != null) return from === to ? `${groupAmount(from)} ${currency}` : `${groupAmount(from)} – ${groupAmount(to)} ${currency}`;
  return from != null ? `${words.from} ${groupAmount(from)} ${currency}` : `${words.to} ${groupAmount(to)} ${currency}`;
}
