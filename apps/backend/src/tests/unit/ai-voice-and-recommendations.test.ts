import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AiService } from '../../modules/ai/ai.service';

describe('AI Voice Transcription & Recommendations', () => {
  let mockSecurity: any;
  let mockRecruiting: any;
  let mockGeminiProvider: any;
  let aiService: AiService;

  beforeEach(() => {
    mockSecurity = {
      config: {
        GEMINI_API_KEY: 'test-key',
        GEMINI_MODEL: 'gemini-2.5-flash',
        AI_TIMEOUT_MS: 5000,
      },
      limit: vi.fn().mockResolvedValue(undefined),
      redis: {
        set: vi.fn().mockResolvedValue('OK'),
        eval: vi.fn().mockResolvedValue(1),
      },
    };

    mockRecruiting = {
      db: {
        candidate: {
          findMany: vi.fn(),
        },
        vacancyRecommendation: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
          upsert: vi.fn(),
        },
        application: {
          findMany: vi.fn(),
          findUnique: vi.fn(),
          create: vi.fn(),
        },
      },
      vacancy: vi.fn(),
      candidate: vi.fn(),
    };

    mockGeminiProvider = {
      transcribeAudio: vi.fn(),
      generate: vi.fn(),
    };

    aiService = new AiService(
      mockSecurity,
      mockRecruiting,
      mockGeminiProvider,
    );
  });

  describe('transcribeBriefAudio', () => {
    it('throws BadRequestException if audio buffer is empty', async () => {
      await expect(
        aiService.transcribeBriefAudio(1, 1, Buffer.alloc(0), 'audio/webm'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if audio buffer exceeds 5MB', async () => {
      const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);
      await expect(
        aiService.transcribeBriefAudio(1, 1, largeBuffer, 'audio/webm'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for unsupported MIME types', async () => {
      const buffer = Buffer.from('fake-audio');
      await expect(
        aiService.transcribeBriefAudio(1, 1, buffer, 'application/pdf'),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully calls Gemini provider and returns transcript', async () => {
      mockGeminiProvider.transcribeAudio.mockResolvedValue('Senior Node.js developer kerak');
      const buffer = Buffer.from('valid-audio-data');

      const result = await aiService.transcribeBriefAudio(1, 1, buffer, 'audio/webm', 'uz');
      expect(result).toEqual({ transcript: 'Senior Node.js developer kerak' });
      expect(mockGeminiProvider.transcribeAudio).toHaveBeenCalledWith(
        buffer,
        'audio/webm',
        'uz',
      );
    });
  });

  describe('evaluateCompanyCandidatesForVacancy', () => {
    it('skips candidates without AI consent or without resume', async () => {
      mockRecruiting.vacancy.mockResolvedValue({
        id: 10,
        title: 'Backend Dev',
        description: 'Role',
        revision: 1,
        requirements: [{ id: 101, name: 'Node.js', required: true }],
      });

      mockRecruiting.db.candidate.findMany.mockResolvedValue([
        {
          id: 1,
          resumeText: '', // Empty resume
          resumeRevision: 1,
          publicSubmittedAt: new Date(),
          aiConsentAt: new Date(),
        },
        {
          id: 2,
          resumeText: 'Node.js developer with 3 years experience',
          resumeRevision: 1,
          publicSubmittedAt: new Date(),
          aiConsentAt: null, // No AI consent
        },
      ]);

      await aiService.evaluateCompanyCandidatesForVacancy(1, 10);
      expect(mockGeminiProvider.generate).not.toHaveBeenCalled();
      expect(mockRecruiting.db.vacancyRecommendation.upsert).not.toHaveBeenCalled();
    });
  });

  describe('getVacancyRecommendations', () => {
    it('returns formatted recommendations with match scores and application status', async () => {
      mockRecruiting.vacancy.mockResolvedValue({
        id: 10,
        title: 'Backend Dev',
        revision: 1,
        requirements: [{ id: 101, name: 'Node.js', required: true }],
      });

      mockRecruiting.db.vacancyRecommendation.findMany.mockResolvedValue([
        {
          id: 501,
          companyId: 1,
          vacancyId: 10,
          candidateId: 201,
          matchScore: 90,
          mandatoryScore: 100,
          optionalScore: 80,
          analysis: {
            requirements: [
              {
                requirementId: 101,
                status: 'SUPPORTED',
                explanation: 'Has 3 years experience',
                quotes: ['Node.js 3 years'],
              },
            ],
          },
          candidate: {
            id: 201,
            fullName: 'Ali Valiyev',
            email: 'ali@example.com',
            phone: '+998901234567',
            source: 'WEBSITE',
            resumeName: 'ali_cv.pdf',
            skills: ['Node.js'],
            resumeRevision: 1,
            publicSubmittedAt: null,
            aiConsentAt: null,
          },
        },
      ]);

      mockRecruiting.db.application.findMany.mockResolvedValue([]);

      const result = await aiService.getVacancyRecommendations(1, 10);
      expect(result.vacancyId).toBe(10);
      expect(result.total).toBe(1);
      expect(result.recommendations[0].candidateName).toBe('Ali Valiyev');
      expect(result.recommendations[0].matchScore).toBe(90);
      expect(result.recommendations[0].hasApplication).toBe(false);
    });
  });

  describe('addRecommendationToApplication', () => {
    it('creates an application when candidate is recommended', async () => {
      mockRecruiting.vacancy.mockResolvedValue({ id: 10, companyId: 1 });
      mockRecruiting.candidate.mockResolvedValue({ id: 201, companyId: 1 });
      mockRecruiting.db.application.findUnique.mockResolvedValue(null);
      mockRecruiting.db.vacancyRecommendation.findUnique.mockResolvedValue({
        vacancyRevision: 1,
        resumeRevision: 1,
        analysis: { requirements: [] },
      });
      mockRecruiting.db.application.create.mockResolvedValue({
        id: 777,
        vacancyId: 10,
        candidateId: 201,
        status: 'NEW',
      });

      const app = await aiService.addRecommendationToApplication(1, 99, 10, 201);
      expect(app.id).toBe(777);
      expect(mockRecruiting.db.application.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: 1,
          vacancyId: 10,
          candidateId: 201,
          status: 'NEW',
          aiConsentGranted: true,
        }),
      });
    });
  });
});
