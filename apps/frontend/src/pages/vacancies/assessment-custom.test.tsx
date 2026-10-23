import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { changeLanguage } from '../../i18n';
import { AssessmentModal } from './assessment-modal';
import { WrittenAnswersPanel } from '../../components/written-answers';
import type { Vacancy } from '../../types';

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const questions = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  type: i < 5 ? 'HARD_SKILL' : 'SOFT_SKILL',
  question: `Question number ${i + 1}?`,
  options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
  correctIndex: 0,
  explanation: `Because reason ${i + 1}`,
}));
const vacancy = { id: 5, title: 'Backend Developer', status: 'ACTIVE' } as Vacancy;
const title = 'Your own questions (written answers)';

describe('HR written questions in the test dialog', () => {
  const calls: Array<{ url: string; method: string; body?: any }> = [];
  let stored: string[];

  beforeEach(async () => {
    await changeLanguage('en');
    calls.length = 0;
    stored = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
      const method = (init.method ?? 'GET').toUpperCase();
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      if (method === 'PUT') stored = body.customQuestions;
      return json({ state: 'PENDING', questions, approvedAt: null, customQuestions: stored });
    }));
  });
  afterEach(async () => {
    cleanup();
    vi.unstubAllGlobals();
    await changeLanguage('uz');
  });

  it('adds own questions and sends them with the save, ignoring blank rows', async () => {
    render(<AssessmentModal vacancy={vacancy} close={() => undefined} />);
    await screen.findByText('Waiting for approval');
    fireEvent.click(screen.getByRole('button', { name: 'Add a question' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a question' }));
    fireEvent.change(screen.getByLabelText(`${title} 1`), { target: { value: '  Why did you choose our company?  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
    expect(calls.find((call) => call.method === 'PUT')?.body.customQuestions).toEqual(['Why did you choose our company?']);
  });

  it('allows at most five questions and blocks saving a too-short one', async () => {
    render(<AssessmentModal vacancy={vacancy} close={() => undefined} />);
    await screen.findByText('Waiting for approval');
    for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Add a question' }));
    expect(screen.queryByRole('button', { name: 'Add a question' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(`${title} 1`), { target: { value: 'abc' } });
    expect(screen.getByText('At least 5 characters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: `Remove question 1` }));
    expect(screen.getByRole('button', { name: 'Add a question' })).toBeInTheDocument();
  });
});

describe('WrittenAnswersPanel', () => {
  afterEach(async () => {
    cleanup();
    await changeLanguage('uz');
  });

  it('shows each question with the candidate answer and the AI note', async () => {
    await changeLanguage('en');
    render(<WrittenAnswersPanel items={[{ question: 'Why us?', answer: 'Strong team.', aiNote: 'Answer is generic.' }, { question: 'Salary?', answer: '8 million.' }]} />);
    expect(screen.getByText('Written answers (2)')).toBeInTheDocument();
    expect(screen.getByText('Strong team.')).toBeInTheDocument();
    expect(screen.getByText(/Answer is generic\./)).toBeInTheDocument();
    expect(screen.getAllByText(/AI note/)).toHaveLength(1);
  });
});
