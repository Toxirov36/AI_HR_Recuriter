import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewReviewEditor } from './interview-review';
import type { Application } from './types';
import { send } from './api';
vi.mock('./api', () => ({ send: vi.fn() }));
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
});
