import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { useData } from '../../components/ui';
import { Pipeline } from './pipeline';
import { changeLanguage } from '../../i18n';

beforeEach(async () => {
  await changeLanguage('en');
});

afterEach(async () => {
  cleanup();
  await changeLanguage('uz');
});

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
    stageCounts: { NEW: 22, REVIEWING: 2, INTERVIEW: 6, OFFER: 1, HIRED: 0, REJECTED: 0 },
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
    expect(screen.getByText('Review interview outcome')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
  });

  it('requests the second filtered page from the server', () => {
    window.history.pushState({}, '', '/pipeline?stage=NEW&page=2');
    render(<BrowserRouter><Pipeline /></BrowserRouter>);
    expect(vi.mocked(useData)).toHaveBeenCalledWith(expect.stringContaining('/applications?page=2&search=&stage=NEW'));
    window.history.pushState({}, '', '/');
  });

  it('renders filters and switches between board and list views', () => {
    render(
      <BrowserRouter>
        <Pipeline />
      </BrowserRouter>,
    );

    expect(screen.getByRole('button', { name: /filter by vacancy/i })).toHaveTextContent('All vacancies');
    expect(screen.getByRole('button', { name: /filter by stage/i })).toHaveTextContent('All stages');
    // Both filters open like an accordion and choose an option.
    const stageFilter = screen.getByRole('button', { name: /filter by stage/i });
    fireEvent.click(stageFilter);
    expect(stageFilter).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('option', { name: 'Interview' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Interview' }));
    expect(stageFilter).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: /filter by vacancy/i }));
    expect(screen.getByRole('option', { name: 'Senior Go Developer' })).toBeInTheDocument();
    // The stage choice lives in the URL; leave it clean for the next test.
    window.history.pushState({}, '', '/');
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

  it('translates pipeline kanban stage headers when changing language to Russian and Uzbek', async () => {
    const { unmount } = render(
      <BrowserRouter>
        <Pipeline />
      </BrowserRouter>,
    );

    // In English
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Reviewing')).toBeInTheDocument();
    expect(screen.getByText('Interview')).toBeInTheDocument();
    expect(screen.getByText('Offer')).toBeInTheDocument();
    unmount();

    // Switch to Russian
    await changeLanguage('ru');
    const { unmount: unmountRu } = render(
      <BrowserRouter>
        <Pipeline />
      </BrowserRouter>,
    );
    expect(screen.getByText('Новый')).toBeInTheDocument();
    expect(screen.getByText('Рассмотрение')).toBeInTheDocument();
    expect(screen.getByText('Интервью')).toBeInTheDocument();
    expect(screen.getByText('Оффер')).toBeInTheDocument();
    unmountRu();

    // Switch to Uzbek
    await changeLanguage('uz');
    render(
      <BrowserRouter>
        <Pipeline />
      </BrowserRouter>,
    );
    expect(screen.getByText('Yangi')).toBeInTheDocument();
    expect(screen.getByText('Ko‘rib chiqilmoqda')).toBeInTheDocument();
    expect(screen.getByText('Suhbat')).toBeInTheDocument();
  });
});
