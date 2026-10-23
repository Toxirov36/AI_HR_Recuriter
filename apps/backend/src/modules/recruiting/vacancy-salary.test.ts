import { describe, expect, it } from 'vitest';
import { normalizeSalary } from './recruiting.service';
import { vacancySchema } from '../vacancies/dto/vacancy.dto';
import { vacancy } from '../../common/pipes/validation';

const base = { title: 'Backend Developer', description: 'Build services', status: 'ACTIVE', requirements: [] };

describe('vacancy salary', () => {
  it('accepts a range, one bound or "negotiable", in so‘m or dollars', () => {
    for (const schema of [vacancySchema, vacancy] as const) {
      expect(schema.safeParse({ ...base, salaryFrom: 5_000_000, salaryTo: 8_000_000, salaryCurrency: 'UZS' }).success).toBe(true);
      expect(schema.safeParse({ ...base, salaryFrom: 800, salaryCurrency: 'USD' }).success).toBe(true);
      expect(schema.safeParse({ ...base, salaryNegotiable: true }).success).toBe(true);
      expect(schema.safeParse(base).success).toBe(true);
    }
  });

  it('rejects an upper pay below the lower, negative or fractional amounts and unknown currencies', () => {
    for (const schema of [vacancySchema, vacancy] as const) {
      expect(schema.safeParse({ ...base, salaryFrom: 8_000_000, salaryTo: 5_000_000 }).success).toBe(false);
      expect(schema.safeParse({ ...base, salaryFrom: -1 }).success).toBe(false);
      expect(schema.safeParse({ ...base, salaryFrom: 1.5 }).success).toBe(false);
      expect(schema.safeParse({ ...base, salaryFrom: 100, salaryCurrency: 'EUR' }).success).toBe(false);
    }
  });

  it('negotiable clears the amounts, amounts default to so‘m, and an untouched save leaves pay alone', () => {
    expect(normalizeSalary({ salaryNegotiable: true, salaryFrom: 5, salaryTo: 9, salaryCurrency: 'USD' })).toMatchObject({ salaryFrom: null, salaryTo: null, salaryCurrency: null });
    expect(normalizeSalary({ salaryFrom: 5_000_000, salaryTo: null, salaryNegotiable: false })).toMatchObject({ salaryCurrency: 'UZS' });
    expect(normalizeSalary({ salaryFrom: null, salaryTo: null, salaryCurrency: 'USD', salaryNegotiable: false })).toMatchObject({ salaryCurrency: null });
    const untouched = { title: 'x' };
    expect(normalizeSalary(untouched)).toBe(untouched);
  });
});
