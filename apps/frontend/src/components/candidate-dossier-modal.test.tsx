import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CandidateDossierModal } from './candidate-dossier-modal';
import type { Application, Candidate } from '../types';

afterEach(cleanup);

describe('CandidateDossierModal', () => {
  const dummyCandidate: Candidate = {
    id: 101,
    fullName: 'Aziz Rahimov',
    email: 'aziz@example.com',
    phone: '+998901234567',
    source: 'WEBSITE',
    telegramUsername: 'aziz_dev',
    createdAt: '2026-03-01T10:00:00.000Z',
    parsedResume: {
      summary: 'Tajribali Full-Stack dasturchi',
      skills: ['TypeScript', 'Node.js', 'React', 'PostgreSQL'],
      experience: [
        {
          title: 'Senior Developer',
          company: 'Fintech Corp',
          period: '2022 - hozirgacha',
          description: 'Mikroservislar va API ishlab chiqish',
        },
      ],
      education: [
        {
          institution: 'TATU',
          qualification: 'Bakalavr, Dasturiy injiniring',
          period: '2018 - 2022',
        },
      ],
      languages: ["O'zbek", 'Ingliz'],
    },
  };

  it('does not render when open is false', () => {
    const { container } = render(
      <CandidateDossierModal
        open={false}
        onClose={vi.fn()}
        candidate={dummyCandidate}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders safely without crashing when application vacancy has no requirements array (regression test for line 177 crash)', () => {
    // Pipeline list item payload with partial vacancy info (missing requirements)
    const partialApp: Application = {
      id: 55,
      candidateId: 101,
      vacancyId: 2,
      status: 'REVIEWING',
      reviewRevision: 1,
      interviewReview: null,
      stageHistory: [],
      createdAt: '2026-03-02T10:00:00.000Z',
      candidate: dummyCandidate,
      // @ts-expect-error simulating partial vacancy returned by backend pipeline query
      vacancy: {
        id: 2,
        title: 'Senior Backend Engineer',
      },
      analysis: {
        requirements: [
          {
            requirementId: 1,
            status: 'SUPPORTED',
            explanation: 'Node.js bo‘yicha 4 yillik tajribasi bor',
            quotes: ['4 years Node.js backend development'],
          },
        ],
      },
      interviewQuestions: null,
    };

    // Rendering this should NOT throw "Cannot read properties of undefined (reading 'map')"
    render(
      <CandidateDossierModal
        open={true}
        onClose={vi.fn()}
        application={partialApp}
      />,
    );

    expect(screen.getByText('Aziz Rahimov')).toBeInTheDocument();
    expect(screen.getByText('Senior Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Tasdiqlangan')).toBeInTheDocument();
    expect(screen.getByText('Node.js bo‘yicha 4 yillik tajribasi bor')).toBeInTheDocument();
  });

  it('renders candidate-only dossier when opened from candidate details without an application', () => {
    render(
      <CandidateDossierModal
        open={true}
        onClose={vi.fn()}
        candidate={dummyCandidate}
      />,
    );

    expect(screen.getByText('Aziz Rahimov')).toBeInTheDocument();
    expect(screen.getByText('+998901234567')).toBeInTheDocument();
    expect(screen.getByText('aziz@example.com')).toBeInTheDocument();
    expect(screen.getByText('@aziz_dev')).toBeInTheDocument();
    expect(screen.getByText('Tajribali Full-Stack dasturchi')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Senior Developer')).toBeInTheDocument();
  });

  it('triggers window.print when print button is clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    render(
      <CandidateDossierModal
        open={true}
        onClose={vi.fn()}
        candidate={dummyCandidate}
      />,
    );

    const printButton = screen.getByRole('button', {
      name: /PDF yuklab olish \/ Chop etish/i,
    });
    fireEvent.click(printButton);

    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });
});
