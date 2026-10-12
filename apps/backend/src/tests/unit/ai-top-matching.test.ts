import { describe, expect, it } from 'vitest';
import { calculateCandidateMatchScore } from '../../modules/ai/utils/matching-calculator';

describe('Candidate Matching Calculator', () => {
  const requirements = [
    { id: 1, name: 'NestJS Backend', required: true },
    { id: 2, name: 'PostgreSQL Database', required: true },
    { id: 3, name: 'Docker & Kubernetes', required: false },
  ];

  it('calculates 100% when all requirements are fully SUPPORTED', () => {
    const analysis = {
      requirements: [
        { requirementId: 1, status: 'SUPPORTED', explanation: '3 years NestJS', quotes: ['NestJS'] },
        { requirementId: 2, status: 'SUPPORTED', explanation: 'PostgreSQL DBA', quotes: ['Postgres'] },
        { requirementId: 3, status: 'SUPPORTED', explanation: 'K8s cluster', quotes: ['Docker'] },
      ],
    };

    const result = calculateCandidateMatchScore(requirements, analysis);

    expect(result.matchScore).toBe(100);
    expect(result.mandatoryScore).toBe(100);
    expect(result.optionalScore).toBe(100);
    expect(result.supportedCount).toBe(3);
    expect(result.strengths).toEqual(['NestJS Backend', 'PostgreSQL Database', 'Docker & Kubernetes']);
    expect(result.gaps).toHaveLength(0);
  });

  it('weights mandatory requirements heavier than optional requirements', () => {
    // Total weights: Req 1 (2), Req 2 (2), Req 3 (1) = Total 5
    // Candidate A has both mandatory (4 pts / 5 pts = 80%)
    const candidateA = calculateCandidateMatchScore(requirements, {
      requirements: [
        { requirementId: 1, status: 'SUPPORTED' },
        { requirementId: 2, status: 'SUPPORTED' },
        { requirementId: 3, status: 'NOT_FOUND' },
      ],
    });

    // Candidate B has 1 mandatory and 1 optional (2 + 1 = 3 pts / 5 pts = 60%)
    const candidateB = calculateCandidateMatchScore(requirements, {
      requirements: [
        { requirementId: 1, status: 'SUPPORTED' },
        { requirementId: 2, status: 'NOT_FOUND' },
        { requirementId: 3, status: 'SUPPORTED' },
      ],
    });

    expect(candidateA.matchScore).toBe(80);
    expect(candidateA.mandatoryScore).toBe(100);
    expect(candidateA.optionalScore).toBe(0);

    expect(candidateB.matchScore).toBe(60);
    expect(candidateB.mandatoryScore).toBe(50);
    expect(candidateB.optionalScore).toBe(100);

    expect(candidateA.matchScore).toBeGreaterThan(candidateB.matchScore);
  });

  it('awards half points for PARTIAL status', () => {
    // Req 1 (2) * 0.5 = 1 pt. Total 5 pts => 1/5 = 20%
    const result = calculateCandidateMatchScore(requirements, {
      requirements: [
        { requirementId: 1, status: 'PARTIAL', explanation: 'Some Express but learning NestJS' },
        { requirementId: 2, status: 'NOT_FOUND' },
        { requirementId: 3, status: 'NOT_FOUND' },
      ],
    });

    expect(result.matchScore).toBe(20);
    expect(result.partialCount).toBe(1);
    expect(result.partialMatches).toContain('NestJS Backend');
  });

  it('handles empty or missing analysis gracefully without crashing', () => {
    const result = calculateCandidateMatchScore(requirements, null);

    expect(result.matchScore).toBe(0);
    expect(result.mandatoryScore).toBe(0);
    expect(result.optionalScore).toBe(0);
    expect(result.totalRequirements).toBe(3);
    expect(result.supportedCount).toBe(0);
    expect(result.gaps).toHaveLength(3);
  });
});
