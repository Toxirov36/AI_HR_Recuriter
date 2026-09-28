import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { Pipeline } from './pipeline';

afterEach(cleanup);

const mockVacancies = {
  data: {
    total: 2,
    page: 1,
    pageSize: 20,
    items: [
      { id: 10, title: 'Senior Go Developer', status: 'ACTIVE' },
      { id: 99, title: 'Archived Python Dev', status: 'CLOSED' },
    ],
  },
  error: '',
  reload: vi.fn(),
};

const mockCandidates = {
  data: {
    total: 2,
    page: 1,
    pageSize: 20,
    items: [
      { id: 1, fullName: 'Ali Valiyev', email: 'ali@example.com' },
      { id: 2, fullName: 'Dilshodbek Toxirov', email: 'dilshod@example.com' },
    ],
  },
  error: '',
  reload: vi.fn(),
};

const mockApplications = {
  data: {
    total: 2,
    page: 1,
    pageSize: 20,
    items: [
      {
        id: 101,
        candidateId: 1,
        vacancyId: 10,
        status: 'NEW',
        candidate: { id: 1, fullName: 'Ali Valiyev', email: 'ali@example.com' },
        vacancy: { id: 10, title: 'Senior Go Developer', status: 'ACTIVE' },
        analysis: {
          requirements: [
            { requirementId: 1, status: 'SUPPORTED' },
            { requirementId: 2, status: 'SUPPORTED' },
          ],
        },
      },
      {
        id: 102,
        candidateId: 2,
        vacancyId: 10,
        status: 'INTERVIEW',
        candidate: { id: 2, fullName: 'Dilshodbek Toxirov', email: 'dilshod@example.com' },
        vacancy: { id: 10, title: 'Senior Go Developer', status: 'ACTIVE' },
        analysis: null,
      },
    ],
  },
  error: '',
  reload: vi.fn(),
};

vi.mock('../../components/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useData: vi.fn((url: string) => {
      if (url.includes('/vacancies')) return mockVacancies;
      if (url.includes('/candidates')) return mockCandidates;
      return mockApplications;
    }),
  };
});

describe('Pipeline hiring workflow', () => {
  it('renders kanban board columns and candidate cards', () => {
    render(
      <BrowserRouter>
        <Pipeline />
      </BrowserRouter>,
    );

    expect(screen.getByText('Hiring pipeline')).toBeInTheDocument();
    expect(screen.getByText('Ali Valiyev')).toBeInTheDocument();
    expect(screen.getByText('Dilshodbek Toxirov')).toBeInTheDocument();
  });

  it('shows neutral evidence review states without ranking candidates', () => {
    render(
      <BrowserRouter>
        <Pipeline />
      </BrowserRouter>,
    );

    expect(screen.getByText('Evidence reviewed')).toBeInTheDocument();
    expect(screen.getByText('Needs review')).toBeInTheDocument();
    expect(screen.queryByText(/best match/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/% match/i)).not.toBeInTheDocument();
  });

  it('renders summary metrics and the next HR action', () => {
    render(
      <BrowserRouter>
        <Pipeline />
      </BrowserRouter>,
    );

    expect(screen.getByText('Active candidates')).toBeInTheDocument();
    expect(screen.getByText('Complete scorecard')).toBeInTheDocument();
  });

  it('renders filters and switches between board and list views', () => {
    render(
      <BrowserRouter>
        <Pipeline />
      </BrowserRouter>,
    );

    expect(screen.getByRole('combobox', { name: /filter by vacancy/i })).toHaveValue('all');
    expect(screen.getByRole('combobox', { name: /filter by stage/i })).toHaveValue('all');
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Next action')).toBeInTheDocument();
  });

  it('does not display closed vacancies in the vacancy selector options', () => {
    render(
      <BrowserRouter>
        <Pipeline />
      </BrowserRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /add candidate/i }));
    expect(screen.getByText('Create an application')).toBeInTheDocument();

    // Open the vacancy combobox
    const vacancyInput = screen.getByRole('textbox', { name: /search vacancy/i });
    fireEvent.click(vacancyInput);

    // Active vacancy should be present in the dropdown list
    expect(screen.getAllByText('Senior Go Developer').length).toBeGreaterThan(0);
    // Closed vacancy should NOT be present
    expect(screen.queryByText('Archived Python Dev')).not.toBeInTheDocument();
  });
});
