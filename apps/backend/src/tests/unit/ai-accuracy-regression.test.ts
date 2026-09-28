import { describe, expect, it } from 'vitest';
import { validateEvidence } from './ai.service';
import { resumeSchema } from './modules/ai/schemas/resume.schema';

describe('AI Accuracy, Hallucination Prevention & Regression Benchmark Suite', () => {
  const cvText = `
    Dildora Azimova
    Frontend Developer
    Email: dildora@example.com | Tel: +998 90 123 45 67
    Toshkent, O'zbekiston

    Tajriba:
    TexnoSoft MCHJ (2022 - hozirgacha) — Senior Frontend Engineer
    - React 19 va Next.js App Router yordamida korporativ portalni qayta qurdik.
    - TailwindCSS va Shadcn UI orqali dizayn tizimini ishlab chiqdik.
    - Zustand orqali global state menejmentni optimallashtirdik.

    Ko'nikmalar:
    JavaScript (ES6+), TypeScript, React, Next.js, Redux Toolkit, HTML5/CSS3.
  `;

  const requirements = [
    { id: 10, name: 'React', required: true },
    { id: 11, name: 'Next.js', required: true },
    { id: 12, name: 'Angular', required: false },
    { id: 13, name: 'GraphQL', required: false },
  ];

  describe('Verbatim Quote Accuracy & Hallucination Prevention', () => {
    it('approves genuine verbatim quotes matching CV source text', () => {
      const output = {
        requirements: [
          {
            requirementId: 10,
            status: 'SUPPORTED' as const,
            explanation: 'React tajribasi mavjud.',
            quotes: ['React 19 va Next.js App Router'],
          },
          {
            requirementId: 11,
            status: 'SUPPORTED' as const,
            explanation: 'Next.js tajribasi mavjud.',
            quotes: ['Next.js App Router yordamida korporativ portalni qayta qurdik'],
          },
          {
            requirementId: 12,
            status: 'NOT_FOUND' as const,
            explanation: 'CV da Angular topilmadi.',
            quotes: [],
          },
          {
            requirementId: 13,
            status: 'NOT_FOUND' as const,
            explanation: 'CV da GraphQL topilmadi.',
            quotes: [],
          },
        ],
      };

      const result = validateEvidence(output, requirements, cvText);

      expect(result.requirements[0].status).toBe('SUPPORTED');
      expect(result.requirements[0].quotes[0]).toBe('React 19 va Next.js App Router');
      expect(result.requirements[1].status).toBe('SUPPORTED');
      expect(result.requirements[2].status).toBe('NOT_FOUND');
    });

    it('downgrades hallucinated / fabricated quotes to UNKNOWN automatically', () => {
      const hallucinatedOutput = {
        requirements: [
          {
            requirementId: 12, // Angular is not in the CV
            status: 'SUPPORTED' as const,
            explanation: 'Nomzod Angular bo‘yicha 5 yillik mutaxassis (HALLUCINATED)',
            quotes: ['5 years of deep Angular and RxJS expertise across enterprise projects'],
          },
          {
            requirementId: 10,
            status: 'SUPPORTED' as const,
            explanation: 'React tajribasi',
            quotes: ['React 19 va Next.js App Router'],
          },
          {
            requirementId: 11,
            status: 'NOT_FOUND' as const,
            explanation: '',
            quotes: [],
          },
          {
            requirementId: 13,
            status: 'NOT_FOUND' as const,
            explanation: '',
            quotes: [],
          },
        ],
      };

      const result = validateEvidence(hallucinatedOutput, requirements, cvText);

      // The hallucinated requirement must be downgraded to UNKNOWN!
      expect(result.requirements.find((r) => r.requirementId === 12)?.status).toBe('UNKNOWN');

      // Genuine requirement remains SUPPORTED
      expect(result.requirements.find((r) => r.requirementId === 10)?.status).toBe('SUPPORTED');
    });
  });

  describe('Regression Benchmark: Structured Schema Stability', () => {
    it('validates canonical multi-lingual structured resume without schema drift', () => {
      const parsedSample = {
        summary: 'Tizimli tahlilchi va Frontend dasturchi. 3+ yillik tajriba.',
        skills: ['TypeScript', 'React', 'TailwindCSS', 'Next.js'],
        experience: [
          {
            title: 'Senior Frontend Engineer',
            company: 'TexnoSoft',
            period: '2022 - Present',
            description: 'Portal arxitekturasini loyihalash va ishlab chiqish.',
          },
        ],
        education: [
          {
            institution: 'Toshkent Axborot Texnologiyalari Universiteti (TATU)',
            qualification: 'Bakalavr, Dasturiy injiniring',
            period: '2018 - 2022',
          },
        ],
        languages: ["O'zbekcha (Ona tili)", 'Ingliz tili (B2)', 'Rus tili (Erkin)'],
      };

      const parsed = resumeSchema.safeParse(parsedSample);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.skills.length).toBe(4);
        expect(parsed.data.education[0].institution).toContain('TATU');
        expect(parsed.data.languages.length).toBe(3);
      }
    });

    it('rejects CV schemas with injected forbidden fields (PII or discriminatory attributes)', () => {
      const injectedSample = {
        summary: 'Valid summary text.',
        skills: ['Python'],
        experience: [],
        education: [],
        languages: ['English'],
        // Attempting to inject prohibited demographic metadata
        race: 'Asian',
        religion: 'None',
        maritalStatus: 'Single',
      };

      // Zod schema should strip or reject extraneous attributes
      const parsed = resumeSchema.safeParse(injectedSample);
      if (parsed.success) {
        expect(parsed.data).not.toHaveProperty('race');
        expect(parsed.data).not.toHaveProperty('religion');
        expect(parsed.data).not.toHaveProperty('maritalStatus');
      }
    });
  });
});
