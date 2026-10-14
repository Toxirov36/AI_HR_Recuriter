import { describe, expect, it } from 'vitest';
import {
  calculateAssessmentScore,
  getDefaultAssessmentForVacancy,
} from './assessment-helper';

describe('Assessment Helper', () => {
  const defaultAssessment = getDefaultAssessmentForVacancy('Senior Fullstack Engineer', [
    'Node.js & TypeScript',
    'PostgreSQL',
  ]);

  it('generates 10 default assessment questions (5 HARD_SKILL + 5 SOFT_SKILL)', () => {
    expect(defaultAssessment.questions).toHaveLength(10);

    const hardSkills = defaultAssessment.questions.filter((q) => q.type === 'HARD_SKILL');
    const softSkills = defaultAssessment.questions.filter((q) => q.type === 'SOFT_SKILL');

    expect(hardSkills).toHaveLength(5);
    expect(softSkills).toHaveLength(5);

    defaultAssessment.questions.forEach((q) => {
      expect(q.options).toHaveLength(4);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThanOrEqual(3);
      expect(q.explanation.length).toBeGreaterThan(0);
    });
  });

  it('calculates 100% score when all questions are answered correctly', () => {
    const answers = defaultAssessment.questions.map((q) => ({
      questionId: q.id,
      selectedIndex: q.correctIndex,
    }));

    const result = calculateAssessmentScore(defaultAssessment.questions, answers);

    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.correctCount).toBe(10);
    expect(result.hardSkillScore).toBe(100);
    expect(result.softSkillScore).toBe(100);
  });

  it('calculates passed result when 7/10 questions are correct (70%)', () => {
    // Correct for first 7, wrong for last 3
    const answers = defaultAssessment.questions.map((q, idx) => ({
      questionId: q.id,
      selectedIndex: idx < 7 ? q.correctIndex : (q.correctIndex + 1) % 4,
    }));

    const result = calculateAssessmentScore(defaultAssessment.questions, answers);

    expect(result.score).toBe(70);
    expect(result.passed).toBe(true);
    expect(result.correctCount).toBe(7);
  });

  it('calculates failed result when only 6/10 questions are correct (60% < 70%)', () => {
    // Correct for first 6, wrong for last 4
    const answers = defaultAssessment.questions.map((q, idx) => ({
      questionId: q.id,
      selectedIndex: idx < 6 ? q.correctIndex : (q.correctIndex + 1) % 4,
    }));

    const result = calculateAssessmentScore(defaultAssessment.questions, answers);

    expect(result.score).toBe(60);
    expect(result.passed).toBe(false);
    expect(result.correctCount).toBe(6);
  });
});
