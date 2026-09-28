import { describe, expect, it } from 'vitest';
import { getEvidenceSummary, sortApplications } from './match-score';
import type { Application, Evidence } from '../types';

describe('getEvidenceSummary', () => {
  it('returns null if analysis or requirements are missing', () => {
    expect(getEvidenceSummary(null)).toBeNull();
    expect(getEvidenceSummary(undefined)).toBeNull();
    expect(getEvidenceSummary({ requirements: [] })).toBeNull();
  });

  it('counts supported requirements accurately', () => {
    const analysis = {
      requirements: [
        { requirementId: 1, status: 'SUPPORTED' },
        { requirementId: 2, status: 'SUPPORTED' },
      ] as Evidence[],
    };
    const res = getEvidenceSummary(analysis);
    expect(res).toEqual({
      supported: 2,
      partial: 0,
      notFound: 0,
      unknown: 0,
      total: 2,
      hasAnalysis: true,
    });
  });

  it('counts mixed evidence breakdown correctly (supported, partial, not_found, unknown)', () => {
    const analysis = {
      requirements: [
        { requirementId: 1, status: 'SUPPORTED' },
        { requirementId: 2, status: 'SUPPORTED' },
        { requirementId: 3, status: 'SUPPORTED' },
        { requirementId: 4, status: 'SUPPORTED' },
        { requirementId: 5, status: 'PARTIAL' },
        { requirementId: 6, status: 'NOT_FOUND' },
        { requirementId: 7, status: 'UNKNOWN' },
        { requirementId: 8, status: 'UNKNOWN' },
      ] as Evidence[],
    };
    const res = getEvidenceSummary(analysis);
    expect(res).toEqual({
      supported: 4,
      partial: 1,
      notFound: 1,
      unknown: 2,
      total: 8,
      hasAnalysis: true,
    });
  });
});

describe('sortApplications', () => {
  const appA: Application = {
    id: 1,
    candidateId: 10,
    vacancyId: 100,
    candidate: { id: 10, fullName: 'Zafar Aliyev', email: 'z@test.com', createdAt: '' },
    vacancy: { id: 100, title: 'Engineer', description: '', status: 'ACTIVE', requirements: [], createdAt: '' },
    status: 'NEW',
    reviewRevision: 0,
    interviewReview: null,
    stageHistory: [],
    createdAt: '2026-01-01',
    analysis: null,
    interviewQuestions: null,
  };

  const appB: Application = {
    id: 2,
    candidateId: 11,
    vacancyId: 100,
    candidate: { id: 11, fullName: 'Anvar Boboyev', email: 'a@test.com', createdAt: '' },
    vacancy: { id: 100, title: 'Engineer', description: '', status: 'ACTIVE', requirements: [], createdAt: '' },
    status: 'NEW',
    reviewRevision: 0,
    interviewReview: null,
    stageHistory: [],
    createdAt: '2026-01-02',
    analysis: null,
    interviewQuestions: null,
  };

  it('sorts by created_desc (newest first)', () => {
    const sorted = sortApplications([appA, appB], 'created_desc');
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(1);
  });

  it('sorts by created_asc (oldest first)', () => {
    const sorted = sortApplications([appB, appA], 'created_asc');
    expect(sorted[0].id).toBe(1);
    expect(sorted[1].id).toBe(2);
  });

  it('sorts by name_asc alphabetically', () => {
    const sorted = sortApplications([appA, appB], 'name_asc');
    expect(sorted[0].candidate.fullName).toBe('Anvar Boboyev');
    expect(sorted[1].candidate.fullName).toBe('Zafar Aliyev');
  });
});
