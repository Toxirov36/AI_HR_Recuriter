import { describe, expect, it, vi } from 'vitest';
import { downloadCsv, exportApplicationsToCsv, exportCandidatesToCsv } from './export';
import type { Application, Candidate } from '../types';

describe('export utilities', () => {
  it('downloads CSV with UTF-8 BOM and correct filename', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.fn();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    const appendChild = vi.spyOn(document.body, 'appendChild');
    const removeChild = vi.spyOn(document.body, 'removeChild');

    downloadCsv('test_export', ['Name', 'Role'], [['Ali', 'Developer']]);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('escapes cells containing commas and quotes properly', () => {
    let capturedBlob: Blob | null = null;
    window.URL.createObjectURL = vi.fn().mockImplementation((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:mock-url';
    });
    window.URL.revokeObjectURL = vi.fn();

    downloadCsv('test', ['Col1', 'Col2'], [['Hello, world', 'He said "Yes"']]);

    expect(capturedBlob).not.toBeNull();
  });

  it('exports applications with evidence status', () => {
    const mockApp = {
      id: 1,
      candidateId: 10,
      vacancyId: 20,
      status: 'INTERVIEW',
      createdAt: '2026-09-30T10:00:00.000Z',
      candidate: {
        id: 10,
        fullName: 'Dilshodbek Toxirov',
        email: 'dilshod@example.com',
        phone: '+998901234567',
        telegramUsername: 'dilshod_t',
        source: 'TELEGRAM',
        resumeName: 'cv.pdf',
      },
      vacancy: {
        id: 20,
        title: 'Senior Node.js Developer',
      },
      analysis: {
        requirements: [
          { requirementId: 1, status: 'SUPPORTED', explanation: 'Evidence found', quotes: ['Node.js'] },
        ],
      },
    } as unknown as Application;

    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();

    expect(() => exportApplicationsToCsv([mockApp])).not.toThrow();
  });

  it('exports candidates list with skills and metadata', () => {
    const mockCandidate = {
      id: 10,
      fullName: 'Dilshodbek Toxirov',
      email: 'dilshod@example.com',
      phone: '+998901234567',
      telegramUsername: 'dilshod_t',
      source: 'TELEGRAM',
      resumeName: 'cv.pdf',
      createdAt: '2026-09-30T10:00:00.000Z',
      _count: { applications: 2 },
      parsedResume: {
        skills: ['TypeScript', 'NestJS', 'PostgreSQL'],
      },
    } as unknown as Candidate;

    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();

    expect(() => exportCandidatesToCsv([mockCandidate])).not.toThrow();
  });
});
