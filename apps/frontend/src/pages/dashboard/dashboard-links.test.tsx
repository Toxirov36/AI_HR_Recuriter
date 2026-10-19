import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { Dashboard } from './index';
import { changeLanguage } from '../../i18n';

vi.mock('../../features/auth', () => ({ useAuth: () => ({ user: { fullName: 'Dilshodbek' } }) }));
vi.mock('../../components/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useData: () => ({ data: {
    vacancies: 3, draftVacancies: 4, newApplications: 28, candidates: 40,
    applications: 62, stages: [{ status: 'HIRED', _count: 2 }], recent: [],
  }, error: '', reload: vi.fn() }) };
});

beforeEach(async () => { await changeLanguage('uz'); });
afterEach(cleanup);

describe('dashboard actions', () => {
  it('opens the full filtered lists for new applications and draft vacancies', () => {
    render(<BrowserRouter><Dashboard /></BrowserRouter>);
    expect(screen.getByText('Yangi arizalar').closest('a')).toHaveAttribute('href', '/pipeline?stage=NEW');
    expect(screen.getByText('Qoralama vakansiyalar').closest('a')).toHaveAttribute('href', '/vacancies?status=DRAFT');
    expect(screen.getByText('28')).toBeInTheDocument();
  });
});
