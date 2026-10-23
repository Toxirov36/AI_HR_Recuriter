import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { changeLanguage } from '../i18n';
import type { AiInterview } from '../types';
import { AiInterviewPanel, combinedScore, recommendationLight } from './ai-interview-panel';

const evaluation = {
  score: 85,
  verdict: 'recommend' as const,
  reason: 'Aniq misollar keltirdi',
  summary: 'Tajribali nomzod.',
  strengths: ['Reels tajribasi'],
  weaknesses: ['Analitika kam'],
  risks: ['Maosh kutilmasi yuqori'],
  checkQuestions: ['Oxirgi kampaniya natijasi qanday?'],
};
const interview = (extra: Partial<AiInterview> = {}): AiInterview => ({
  turns: [{ role: 'ai', text: 'Salom! Qaysi loyihada ishlagansiz?' }, { role: 'candidate', text: 'Instagram uchun reklama qildim' }],
  evaluation,
  finishedAt: '2026-10-23T10:00:00Z',
  ...extra,
});

beforeEach(async () => {
  await changeLanguage('en');
});
afterEach(async () => {
  cleanup();
  await changeLanguage('uz');
});

describe('AI interview scoring (matches the server)', () => {
  it('weights the test 40% and the interview 60%', () => {
    expect(combinedScore(80, 85)).toBe(83);
    expect(combinedScore(null, 70)).toBe(70);
    expect(combinedScore(90, undefined)).toBe(90);
    expect(combinedScore(null, null)).toBeNull();
  });

  it('is green only for a recommended interview with a good total', () => {
    expect(recommendationLight(evaluation, 83)).toBe('HIRE');
    expect(recommendationLight(evaluation, 65)).toBe('MAYBE');
    expect(recommendationLight(evaluation, 50)).toBe('NO');
    expect(recommendationLight({ ...evaluation, verdict: 'reject' }, 90)).toBe('NO');
    expect(recommendationLight(null, 90)).toBe('MAYBE');
  });
});

describe('AiInterviewPanel', () => {
  it('starts collapsed with the verdict and total in the header, then shows everything HR needs', () => {
    render(<AiInterviewPanel interview={interview()} testScore={80} candidateName="Ali" />);
    const trigger = screen.getByRole('button', { name: /AI interview/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('Recommended · 83%');
    expect(screen.queryByText('Tajribali nomzod.')).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByText('Tajribali nomzod.')).toBeVisible();
    expect(screen.getByText('Reels tajribasi')).toBeVisible();
    expect(screen.getByText('Maosh kutilmasi yuqori')).toBeVisible();
    expect(screen.getByText('Oxirgi kampaniya natijasi qanday?')).toBeVisible();
    expect(screen.getByText('85%')).toBeVisible();
    expect(screen.getByText('The AI evaluation is only a helper summary: people make the decision.')).toBeVisible();
  });

  it('lists the transcript with the candidate’s name', () => {
    render(<AiInterviewPanel interview={interview()} testScore={80} candidateName="Ali" />);
    fireEvent.click(screen.getByRole('button', { name: /AI interview/ }));
    fireEvent.click(screen.getByText(/Interview transcript \(2\)/));
    expect(screen.getByText('Instagram uchun reklama qildim')).toBeInTheDocument();
    expect(screen.getByText('Ali')).toBeInTheDocument();
  });

  it('says so when there is no evaluation, without a verdict badge', () => {
    render(<AiInterviewPanel interview={interview({ evaluation: null, skipped: true })} testScore={80} candidateName="Ali" />);
    const trigger = screen.getByRole('button', { name: /AI interview/ });
    expect(trigger).not.toHaveTextContent('Recommended');
    fireEvent.click(trigger);
    expect(screen.getByText(/was not evaluated/)).toBeVisible();
  });
});
