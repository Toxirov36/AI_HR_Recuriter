import { describe, expect, it } from 'vitest';
import { groupAmount, parseAmount, salaryLabel } from './salary';

const words = { negotiable: 'Kelishiladi', from: 'dan', to: 'gacha', uzs: 'so‘m', usd: 'USD' };

describe('salary helpers', () => {
  it('groups digits and reads them back', () => {
    expect(groupAmount(5000000)).toBe('5 000 000');
    expect(groupAmount('8,000,000 so‘m')).toBe('8 000 000');
    expect(groupAmount(null)).toBe('');
    expect(parseAmount('5 000 000')).toBe(5_000_000);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });

  it('writes the pay line for a range, one bound, equal bounds, dollars and negotiable', () => {
    expect(salaryLabel({ salaryFrom: 5_000_000, salaryTo: 8_000_000, salaryCurrency: 'UZS' }, words)).toBe('5 000 000 – 8 000 000 so‘m');
    expect(salaryLabel({ salaryFrom: 800, salaryCurrency: 'USD' }, words)).toBe('dan 800 USD');
    expect(salaryLabel({ salaryTo: 3_000_000 }, words)).toBe('gacha 3 000 000 so‘m');
    expect(salaryLabel({ salaryFrom: 1000, salaryTo: 1000, salaryCurrency: 'USD' }, words)).toBe('1 000 USD');
    expect(salaryLabel({ salaryNegotiable: true, salaryFrom: 5 }, words)).toBe('Kelishiladi');
    expect(salaryLabel({}, words)).toBeNull();
  });
});
