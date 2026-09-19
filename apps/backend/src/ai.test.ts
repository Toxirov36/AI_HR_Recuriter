import { describe, expect, it, vi } from 'vitest';
import { validateEvidence, AiService } from './ai.service';
import { RecruitingService } from './recruiting.service';
import { Database } from './database';
import { Security } from './security';
import { parse, registration, pipeline, vacancy, candidate } from './validation';
describe('evidence verification', () => {
  it('retains verified quotes without making a hiring decision', () => {
    const result = validateEvidence(
      {
        requirements: [
          {
            requirementId: 1,
            status: 'SUPPORTED',
            explanation: 'Explicit evidence',
            quotes: ['Built APIs using NestJS'],
          },
        ],
      },
      [{ id: 1 }],
      'Built APIs using NestJS for three years.',
    );
    expect(result.requirements[0].status).toBe('SUPPORTED');
    expect(result).not.toHaveProperty('score');
    expect(result).not.toHaveProperty('status');
  });
  it('downgrades invented and missing evidence to UNKNOWN', () => {
    for (const quotes of [[], ['Expert in Kubernetes']])
      expect(
        validateEvidence(
          { requirements: [{ requirementId: 1, status: 'SUPPORTED', explanation: '', quotes }] },
          [{ id: 1 }],
          'NestJS developer',
        ).requirements[0].status,
      ).toBe('UNKNOWN');
  });
  it('rejects missing, duplicate, and foreign requirement IDs', () => {
    for (const ids of [[], [1, 1], [2]])
      expect(() =>
        validateEvidence(
          {
            requirements: ids.map((requirementId) => ({
              requirementId,
              status: 'UNKNOWN',
              explanation: '',
              quotes: [],
            })),
          },
          [{ id: 1 }],
          '',
        ),
      ).toThrow();
  });
  it('preserves NOT_FOUND as absence of evidence', () =>
    expect(
      validateEvidence(
        {
          requirements: [
            { requirementId: 1, status: 'NOT_FOUND', explanation: 'No statement', quotes: [] },
          ],
        },
        [{ id: 1 }],
        '',
      ).requirements[0].status,
    ).toBe('NOT_FOUND'));
});
describe('input validation', () => {
  it('rejects tenant and role injection', () =>
    expect(() =>
      parse(registration, {
        companyName: 'A',
        fullName: 'A',
        email: 'a@b.com',
        password: 'long-password',
        companyId: 3,
        role: 'ADMIN',
      }),
    ).toThrow());
  it('rejects unknown pipeline states and oversized requirements', () => {
    expect(() => parse(pipeline, { status: 'AUTO_HIRED' })).toThrow();
    expect(() =>
      parse(vacancy, {
        title: 'Dev',
        description: 'Job',
        requirements: Array.from({ length: 41 }, () => ({ name: 'A' })),
      }),
    ).toThrow();
  });
  it('normalizes empty contact fields', () =>
    expect(parse(candidate, { fullName: 'Ada', email: '', phone: '' })).toEqual({
      fullName: 'Ada',
      email: null,
      phone: null,
    }));
});
describe('tenant boundaries', () => {
  it('includes company ownership in every single-record lookup', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new RecruitingService({
      candidate: { findFirst },
      vacancy: { findFirst },
      application: { findFirst },
    } as unknown as Database);
    for (const kind of ['candidate', 'vacancy', 'application'] as const)
      await expect(service[kind](7, 42)).rejects.toThrow('not found');
    for (const [args] of findFirst.mock.calls) expect(args.where).toEqual({ id: 42, companyId: 7 });
  });
  it('returns a useful configuration error without a Gemini key', async () => {
    const service = new AiService(
      { config: { GEMINI_API_KEY: '' } } as Security,
      {
        candidate: vi.fn().mockResolvedValue({ resumeText: 'Experience text' }),
      } as unknown as RecruitingService,
    );
    await expect(service.parse(1, 1, 1)).rejects.toThrow('AI is not configured');
  });
});
