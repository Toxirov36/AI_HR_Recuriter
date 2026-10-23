import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApplicationDetail } from './pipeline';
import { changeLanguage } from '../../i18n';

vi.mock('../../features/auth', () => ({ useAuth: () => ({ user: { aiConfigured: true, role: 'ADMIN' } }) }));
vi.mock('../../features/interviews/interview-panel', () => ({ InterviewPanel: () => null }));

const application = {
  id: 7,
  candidateId: 3,
  vacancyId: 2,
  status: 'REVIEWING',
  reviewRevision: 0,
  interviewReview: null,
  interviewQuestions: null,
  analysis: { requirements: [{ requirementId: 1, status: 'NOT_FOUND', explanation: 'The CV does not mention Java.', quotes: [] }] },
  stageHistory: [],
  createdAt: '2026-10-20T10:00:00Z',
  assessmentScore: 30,
  assessmentResult: {
    score: 30,
    passed: false,
    correctCount: 3,
    hardSkillScore: 40,
    softSkillScore: 20,
    completedAt: '2026-10-20T10:05:00Z',
    answers: [
      { type: 'HARD_SKILL', isCorrect: false, selectedIndex: 1, correctIndex: 0 },
      { type: 'SOFT_SKILL', isCorrect: true, selectedIndex: 0, correctIndex: 0 },
    ],
  },
  candidate: { id: 3, fullName: 'Ali Valiyev', email: 'ali@example.com', source: 'TELEGRAM' },
  vacancy: { id: 2, title: 'SMM Lead', status: 'ACTIVE', requirements: [{ id: 1, name: 'Java asoslari', description: 'OOP va kutubxonalar', required: true }] },
};

vi.mock('../../components/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useData: vi.fn(() => ({ data: application, error: '', reload: vi.fn() })) };
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/applications/7']}>
      <Routes>
        <Route path="/applications/:id" element={<ApplicationDetail />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(async () => {
  await changeLanguage('uz');
});
afterEach(cleanup);

describe('assessment result accordion', () => {
  it('shows the title and score while the details are collapsed', () => {
    renderPage();
    const trigger = screen.getByRole('button', { name: /AI Saralash Testi Natijalari/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('Ball: 30%');
    expect(screen.queryByText('Umumiy natija')).toBeNull();
  });

  it('opens to the summary tiles and the answer table, and closes again', () => {
    renderPage();
    const trigger = screen.getByRole('button', { name: /AI Saralash Testi Natijalari/ });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Umumiy natija')).toBeVisible();
    expect(screen.getByText(/Variant B/)).toBeVisible();
    expect(screen.getByText(/3\/10 to‘g‘ri/)).toBeVisible();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('CV evidence accordion', () => {
  it('starts open with its requirements and the re-analyze action outside the toggle', () => {
    renderPage();
    const toggle = screen.getByRole('button', { name: /AI topgan dalillar/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Java asoslari')).toBeVisible();
    expect(screen.getByText('The CV does not mention Java.')).toBeVisible();
    // The action button is a sibling of the toggle, not nested inside another button.
    expect(toggle.querySelector('button')).toBeNull();
    expect(screen.getByRole('button', { name: /Qayta tahlil qilish/ })).toBeVisible();
  });

  it('collapses and expands without losing the header action', () => {
    renderPage();
    const toggle = screen.getByRole('button', { name: /AI topgan dalillar/ });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('The CV does not mention Java.')).toBeNull();
    expect(screen.getByRole('button', { name: /Qayta tahlil qilish/ })).toBeVisible();
    fireEvent.click(toggle);
    expect(screen.getByText('The CV does not mention Java.')).toBeVisible();
  });
});
