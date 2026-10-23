import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CandidateDetail } from './index';
import { changeLanguage } from '../../i18n';

vi.mock('../../features/auth', () => ({ useAuth: () => ({ user: { aiConfigured: true, role: 'ADMIN' } }) }));

const candidate = {
  id: 3,
  fullName: 'Ali Valiyev',
  email: 'ali@example.com',
  phone: '+998901234567',
  source: 'TELEGRAM',
  resumeText: 'Full-Stack Developer',
  resumeName: 'cv.pdf',
  resumes: [],
  events: [],
  parsedResume: {
    summary: 'Full-Stack Developer specializing in React.js and PostgreSQL.',
    skills: ['TypeScript', 'PostgreSQL'],
    experience: [{ title: 'Developer', company: 'Acme', period: '2024', description: 'Built platforms.' }],
    education: [{ qualification: 'BSc', institution: 'TUIT', period: '2022' }],
    languages: ['Uzbek'],
  },
};

let current: Record<string, unknown> | null = candidate;
vi.mock('../../components/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useData: vi.fn((url: string) => ({ data: url.endsWith('/duplicates') ? [] : current, error: '', reload: vi.fn() })),
  };
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/candidates/3']}>
      <Routes>
        <Route path="/candidates/:id" element={<CandidateDetail />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(async () => {
  current = candidate;
  await changeLanguage('uz');
});
afterEach(cleanup);

describe('structured resume accordion', () => {
  it('starts collapsed, keeps the re-parse action reachable, and opens to the parsed profile', () => {
    renderPage();
    const toggle = screen.getByRole('button', { name: /Strukturaviy rezyume/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/specializing in React.js/)).toBeNull();
    // The action is a sibling of the toggle, so it works while the section is closed.
    expect(toggle.querySelector('button')).toBeNull();
    expect(screen.getByRole('button', { name: /Qayta tahlil qilish|Rezyumeni tahlil qilish|AI/ })).toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/specializing in React.js/)).toBeVisible();
    expect(screen.getByText('TypeScript')).toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the hint, not an empty profile, when nothing has been parsed yet', () => {
    current = { ...candidate, parsedResume: null };
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Strukturaviy rezyume/ }));
    expect(screen.queryByText('TypeScript')).toBeNull();
    expect(document.querySelector('.quiet-note')).not.toBeNull();
  });
});
