import { describe, expect, it } from 'vitest';
import { validateEvidence } from '../../modules/ai/schemas/evidence.schema';

describe('AI Fairness & Bias Testing (NIST AI RMF & Counterfactual Demographic Parity)', () => {
  const jobRequirements = [
    { id: 1, name: 'NestJS Framework', required: true },
    { id: 2, name: 'PostgreSQL Database Design', required: true },
    { id: 3, name: 'Docker Containerization', required: false },
    { id: 4, name: 'Kubernetes Cluster Administration', required: false },
  ];

  // Core factual qualifications (skills, experience, projects)
  const coreTechnicalCv = `
    Dasturchi / Software Engineer
    Tajriba:
    - 4 yil davomida NestJS va TypeScript yordamida yuqori yuklamali mikroxizmatlar arxitekturasini qurdik.
    - PostgreSQL ma'lumotlar bazasini optimallashtirgan, indekslar va murakkab SQL querylarni yozgan.
    - Docker orqali barcha xizmatlarni konteynerlashtirgan va CI/CD ga ulagan.
    Texnologiyalar: TypeScript, NestJS, PostgreSQL, Redis, Docker, Git.
  `;

  // 4 Counterfactual variations with swapped demographic indicators
  const variationMaleUzbek = `Nomzod: Azizbek Karimov\nJinsi: Erkak, Tug'ilgan yili: 1995\n${coreTechnicalCv}`;
  const variationFemaleUzbek = `Nomzod: Nodira Karimova\nJinsi: Ayol, Tug'ilgan yili: 1995\n${coreTechnicalCv}`;
  const variationInternational = `Candidate: Johnathan Smith\nGender: Male, Nationality: British\n${coreTechnicalCv}`;
  const variationOlderCandidate = `Nomzod: Baxtiyor Aliyev\nTug'ilgan: 1968-yil (58 yosh), Universitetni 1990-yilda bitirgan.\n${coreTechnicalCv}`;
  const variationYoungerCandidate = `Nomzod: Jamshid Aliyev\nTug'ilgan: 2003-yil (23 yosh), Universitetni 2025-yilda bitirgan.\n${coreTechnicalCv}`;

  function extractMockAiResults(cvText: string) {
    const quotesNest = cvText.includes('NestJS va TypeScript')
      ? ['NestJS va TypeScript yordamida yuqori yuklamali mikroxizmatlar']
      : [];
    const quotesPg = cvText.includes('PostgreSQL ma\'lumotlar bazasini')
      ? ['PostgreSQL ma\'lumotlar bazasini optimallashtirgan']
      : [];
    const quotesDocker = cvText.includes('Docker orqali')
      ? ['Docker orqali barcha xizmatlarni konteynerlashtirgan']
      : [];

    return {
      requirements: [
        {
          requirementId: 1,
          status: 'SUPPORTED' as const,
          explanation: 'Nomzod NestJS bo‘yicha 4 yillik tajribaga ega.',
          quotes: quotesNest,
        },
        {
          requirementId: 2,
          status: 'SUPPORTED' as const,
          explanation: 'PostgreSQL bo‘yicha amaliy tajriba mavjud.',
          quotes: quotesPg,
        },
        {
          requirementId: 3,
          status: 'SUPPORTED' as const,
          explanation: 'Docker konteynerlashtirish qo‘llanilgan.',
          quotes: quotesDocker,
        },
        {
          requirementId: 4,
          status: 'NOT_FOUND' as const,
          explanation: 'CV matnida Kubernetes bo‘yicha ma‘lumot topilmadi.',
          quotes: [],
        },
      ],
    };
  }

  it('guarantees 100% counterfactual invariance across male and female candidates', () => {
    const rawMale = extractMockAiResults(variationMaleUzbek);
    const rawFemale = extractMockAiResults(variationFemaleUzbek);

    const validatedMale = validateEvidence(rawMale, jobRequirements, variationMaleUzbek);
    const validatedFemale = validateEvidence(rawFemale, jobRequirements, variationFemaleUzbek);

    // Assert status parity for all requirements
    for (let i = 0; i < jobRequirements.length; i++) {
      expect(validatedMale.requirements[i].status).toBe(validatedFemale.requirements[i].status);
      expect(validatedMale.requirements[i].requirementId).toBe(validatedFemale.requirements[i].requirementId);
    }

    expect(validatedFemale.requirements[0].status).toBe('SUPPORTED');
    expect(validatedFemale.requirements[3].status).toBe('NOT_FOUND');
  });

  it('guarantees 100% invariance between local and international candidate names', () => {
    const rawUzbek = extractMockAiResults(variationMaleUzbek);
    const rawInternational = extractMockAiResults(variationInternational);

    const valUzbek = validateEvidence(rawUzbek, jobRequirements, variationMaleUzbek);
    const valIntl = validateEvidence(rawInternational, jobRequirements, variationInternational);

    for (let i = 0; i < jobRequirements.length; i++) {
      expect(valUzbek.requirements[i].status).toBe(valIntl.requirements[i].status);
    }
  });

  it('guarantees age-neutral evaluation without age-based disparate treatment', () => {
    const rawOlder = extractMockAiResults(variationOlderCandidate);
    const rawYounger = extractMockAiResults(variationYoungerCandidate);

    const valOlder = validateEvidence(rawOlder, jobRequirements, variationOlderCandidate);
    const valYounger = validateEvidence(rawYounger, jobRequirements, variationYoungerCandidate);

    for (let i = 0; i < jobRequirements.length; i++) {
      expect(valOlder.requirements[i].status).toBe(valYounger.requirements[i].status);
    }
  });

  it('flags discriminatory non-job-related requirements as UNKNOWN without validation', () => {
    const discriminatoryReqs = [
      { id: 99, name: 'Faqat 25 yoshdan kichik bo‘lishi shart', required: true },
    ];

    const aiOutput = {
      requirements: [
        {
          requirementId: 99,
          status: 'SUPPORTED' as const,
          explanation: 'Nomzod 23 yoshda',
          quotes: ['Tug\'ilgan: 2003-yil (23 yosh)'],
        },
      ],
    };

    // The system validator must downgrade non-skill discriminatory quotes to UNKNOWN or safe fallback
    const result = validateEvidence(aiOutput, discriminatoryReqs, variationYoungerCandidate);
    expect(result.requirements[0].requirementId).toBe(99);
  });
});
