import { describe, expect, it } from 'vitest';
import { interviewReviewSchema } from './dto/interview-review.dto';
import { interviewReview } from '../../common/pipes/validation';

describe('Structured Interview Scorecard Schema Validation', () => {
  const baseDraft = {
    revision: 1,
    notes: 'General conversation notes',
    answers: [
      {
        question: 'How do you handle NestJS dependency injection?',
        answer: 'Candidate explained module providers and scoped injection.',
        notes: 'Good technical understanding.',
      },
    ],
  };

  it('allows review without scorecard for backward compatibility', () => {
    const res = interviewReviewSchema.safeParse(baseDraft);
    expect(res.success).toBe(true);
  });

  it('rejects scorecard criterion when score is given without evidence', () => {
    const invalidDraft = {
      ...baseDraft,
      scorecard: {
        criteria: [
          {
            id: 'crit-1',
            name: 'NestJS',
            category: 'TECHNICAL',
            score: 4,
            evidence: '   ', // Missing evidence!
          },
        ],
        finalDecision: 'UNDECIDED',
      },
    };

    const res = interviewReviewSchema.safeParse(invalidDraft);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toContain('dalil yoki izoh yozilishi majburiy');
    }
  });

  it('accepts unscored criterion with empty evidence', () => {
    const validDraft = {
      ...baseDraft,
      scorecard: {
        criteria: [
          {
            id: 'crit-1',
            name: 'Database design',
            category: 'TECHNICAL',
            score: null,
            evidence: '',
          },
        ],
        finalDecision: 'UNDECIDED',
      },
    };

    const res = interviewReviewSchema.safeParse(validDraft);
    expect(res.success).toBe(true);
  });

  it('accepts scorecard with valid scores and evidence', () => {
    const validDraft = {
      ...baseDraft,
      scorecard: {
        criteria: [
          {
            id: 'crit-1',
            name: 'NestJS',
            category: 'TECHNICAL',
            score: 4,
            evidence: 'Explained CQRS, interceptors and microservice architecture in depth.',
          },
          {
            id: 'crit-2',
            name: 'Database design',
            category: 'TECHNICAL',
            score: 3,
            evidence: 'Familiar with PostgreSQL indexes, normalization and Prisma relations.',
          },
          {
            id: 'crit-3',
            name: 'Problem solving',
            category: 'CORE',
            score: 5,
            evidence: 'Architected distributed caching system handling high concurrency.',
          },
        ],
        finalDecision: 'STRONG_HIRE',
        decisionNotes: 'Exceptional candidate with strong technical and architectural maturity.',
      },
    };

    const res = interviewReviewSchema.safeParse(validDraft);
    expect(res.success).toBe(true);

    const pipeRes = interviewReview.safeParse(validDraft);
    expect(pipeRes.success).toBe(true);
  });
});
