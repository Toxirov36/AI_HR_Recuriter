import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewReviewEditor } from '../../features/interview-generator';
import type { Application } from '../../types';
import { send } from '../../lib/api';
vi.mock('../../lib/api', () => ({ send: vi.fn(), api: vi.fn(), ApiError: class ApiError extends Error { constructor(public status: number, message: string) { super(message); } } }));
const application = {
  id: 1,
  reviewRevision: 2,
  interviewQuestions: {
    questions: [{ question: 'New question?', rationale: 'New guide', requirementId: null }],
  },
  interviewReview: {
    answers: [
      { question: 'Original question?', answer: 'Original answer', notes: 'Keep this note' },
    ],
    notes: 'Overall notes',
    updatedBy: 'HR',
    updatedAt: '2026-09-17T10:00:00Z',
  },
} as Application;
describe('interview review drafts', () => {
  afterEach(cleanup);
  beforeEach(() => vi.resetAllMocks());
  it('keeps previous answers attached to their original question after regeneration', () => {
    render(
      <InterviewReviewEditor application={application} onDirty={vi.fn()} onSaving={vi.fn()} />,
    );
    expect(screen.getByText('Original question?')).toBeVisible();
    expect(screen.getByDisplayValue('Original answer')).toBeVisible();
    expect(screen.getAllByLabelText('Candidate answer')[0]).toHaveValue('');
    expect(screen.getByText('Saved from an earlier interview guide.')).toBeVisible();
  });
  it('preserves the draft and expected revision when a concurrent save conflicts', async () => {
    vi.mocked(send).mockRejectedValue(
      new Error('Interview notes were changed by another reviewer.'),
    );
    render(
      <InterviewReviewEditor application={application} onDirty={vi.fn()} onSaving={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Overall interview notes'), {
      target: { value: 'My unsaved draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save interview notes' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('another reviewer'));
    expect(screen.getByLabelText('Overall interview notes')).toHaveValue('My unsaved draft');
    expect(send).toHaveBeenCalledWith(
      '/applications/1/interview-review',
      expect.objectContaining({ revision: 2, notes: 'My unsaved draft' }),
      'PUT',
    );
    expect(screen.getByRole('button', { name: 'Save interview notes' })).toBeEnabled();
  });

  it('pre-populates vacancy technical requirements and core competencies', () => {
    const vacancyApp = {
      id: 2,
      reviewRevision: 0,
      vacancy: {
        id: 5,
        title: 'Backend Engineer',
        requirements: [
          { id: 101, name: 'NestJS', required: true },
          { id: 102, name: 'Database design', required: true },
        ],
      },
      interviewQuestions: null,
      interviewReview: null,
    } as unknown as Application;

    render(
      <InterviewReviewEditor application={vacancyApp} onDirty={vi.fn()} onSaving={vi.fn()} />,
    );

    expect(screen.getByText('NestJS')).toBeVisible();
    expect(screen.getByText('Database design')).toBeVisible();
    expect(screen.getByText('Problem solving')).toBeVisible();
    expect(screen.getByText('Communication')).toBeVisible();
    expect(screen.getByText('Team collaboration')).toBeVisible();
  });

  it('displays explicit rubric definitions when a score is selected', () => {
    const vacancyApp = {
      id: 3,
      reviewRevision: 0,
      vacancy: {
        id: 5,
        title: 'NestJS Dev',
        requirements: [{ id: 1, name: 'NestJS', required: true }],
      },
      interviewReview: null,
    } as unknown as Application;

    render(
      <InterviewReviewEditor application={vacancyApp} onDirty={vi.fn()} onSaving={vi.fn()} />,
    );

    // Score 1
    const score1Btn = screen.getAllByRole('button', { name: /1 ball: Tajriba yo‘q/i })[0];
    fireEvent.click(score1Btn);
    expect(screen.getAllByText(/1 — Tajriba ko‘rsatmadi/i).length).toBeGreaterThan(0);

    // Score 3
    const score3Btn = screen.getAllByRole('button', { name: /3 ball: Mustaqil/i })[0];
    fireEvent.click(score3Btn);
    expect(screen.getAllByText(/3 — Mustaqil ishlay oladi/i).length).toBeGreaterThan(0);

    // Score 5
    const score5Btn = screen.getAllByRole('button', { name: /5 ball: Ekspert/i })[0];
    fireEvent.click(score5Btn);
    expect(
      screen.getAllByText(/5 — Murakkab tizimlarni loyihalagan va boshqalarga mentorlik qilgan/i)
        .length,
    ).toBeGreaterThan(0);
  });

  it('blocks saving and shows error when a criterion has a score but missing evidence', async () => {
    const vacancyApp = {
      id: 4,
      reviewRevision: 1,
      vacancy: {
        id: 5,
        title: 'NestJS Dev',
        requirements: [{ id: 1, name: 'NestJS', required: true }],
      },
      interviewReview: null,
    } as unknown as Application;

    render(
      <InterviewReviewEditor application={vacancyApp} onDirty={vi.fn()} onSaving={vi.fn()} />,
    );

    // Select score 4 for NestJS without typing evidence
    const score4Btn = screen.getAllByRole('button', { name: /4 ball: Ilg‘or/i })[0];
    fireEvent.click(score4Btn);

    // Also type overall notes so button becomes dirty & enabled
    fireEvent.change(screen.getByLabelText('Overall interview notes'), {
      target: { value: 'Candidate was interviewed today.' },
    });

    // Try to save
    fireEvent.click(screen.getByRole('button', { name: 'Save interview notes' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Interviewer ball qo‘yganda dalil yoki izoh yozishi majburiy',
      );
    });

    // send should NOT have been called due to client-side validation
    expect(send).not.toHaveBeenCalled();
  });

  it('saves successfully with valid scores, mandatory evidence, and final human decision', async () => {
    vi.mocked(send).mockResolvedValue({
      reviewRevision: 2,
      interviewReview: {
        answers: [],
        notes: 'Great interview',
        updatedBy: 'Lead Recruiter',
        updatedAt: '2026-09-20T12:00:00Z',
        scorecard: {
          criteria: [],
          finalDecision: 'STRONG_HIRE',
        },
      },
    });

    const vacancyApp = {
      id: 5,
      reviewRevision: 1,
      vacancy: {
        id: 5,
        title: 'NestJS Dev',
        requirements: [{ id: 1, name: 'NestJS', required: true }],
      },
      interviewReview: null,
    } as unknown as Application;

    render(
      <InterviewReviewEditor application={vacancyApp} onDirty={vi.fn()} onSaving={vi.fn()} />,
    );

    // 1. Assign score 4 to NestJS
    const score4Btn = screen.getAllByRole('button', { name: /4 ball: Ilg‘or/i })[0];
    fireEvent.click(score4Btn);

    // 2. Write mandatory evidence for NestJS
    const evidenceTextareas = screen.getAllByPlaceholderText(
      /Ushbu ballni asoslovchi aniq dalil/i,
    );
    fireEvent.change(evidenceTextareas[0], {
      target: {
        value: 'Nomzod NestJS CQRS va Microservice loyihalarini mustaqil tushuntirib berdi.',
      },
    });

    // 3. Select final decision "Qat‘iy qabul qilish (Strong Hire)"
    const strongHireBtn = screen.getByRole('button', { name: /Qat‘iy qabul qilish/i });
    fireEvent.click(strongHireBtn);

    // 4. Save
    fireEvent.click(screen.getByRole('button', { name: 'Save interview notes' }));

    await waitFor(() => {
      expect(send).toHaveBeenCalledWith(
        '/applications/5/interview-review',
        expect.objectContaining({
          revision: 1,
          scorecard: expect.objectContaining({
            finalDecision: 'STRONG_HIRE',
            criteria: expect.arrayContaining([
              expect.objectContaining({
                name: 'NestJS',
                score: 4,
                evidence:
                  'Nomzod NestJS CQRS va Microservice loyihalarini mustaqil tushuntirib berdi.',
              }),
            ]),
          }),
        }),
        'PUT',
      );
    });
  });
});

