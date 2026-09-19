import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { AiService } from './ai.service';
import { Security } from './security';
import { RecruitingService } from './recruiting.service';
const providerParse = vi.fn();
const providerEmbed = vi.fn();
const providerFetch = vi.fn(async (url: string, options: RequestInit) => {
  if (url.endsWith(':embedContent'))
    return new Response(JSON.stringify(await providerEmbed(JSON.parse(options.body as string))));
  const result = await providerParse(JSON.parse(options.body as string));
  return new Response(
    JSON.stringify({
      candidates: [
        {
          finishReason: result.status === 'completed' ? 'STOP' : 'MAX_TOKENS',
          content: { parts: [{ text: JSON.stringify(result.output_parsed) }] },
        },
      ],
    }),
  );
});
describe('AI orchestration without paid API calls', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', providerFetch);
    providerEmbed.mockResolvedValue({ embedding: { values: Array(768).fill(0.1) } });
  });
  function setup(stale = false) {
    const application = {
      id: 4,
      candidate: { resumeText: 'Built APIs with NestJS.', resumeRevision: 1 },
      vacancy: {
        revision: 2,
        title: 'Engineer',
        description: 'APIs',
        requirements: [{ id: 9, name: 'NestJS', description: null, required: true }],
      },
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      application: {
        findFirst: vi.fn().mockResolvedValue({
          candidate: { resumeRevision: stale ? 2 : 1 },
          vacancy: { revision: 2 },
        }),
        updateMany,
      },
    };
    const db = { $transaction: vi.fn(async (callback) => callback(tx)), candidate: { updateMany } };
    const recruiting = {
      application: vi.fn().mockResolvedValue(application),
      candidate: vi.fn().mockResolvedValue(application.candidate),
      db,
    };
    const security = {
      config: {
        GEMINI_API_KEY: randomBytes(16).toString('hex'),
        GEMINI_MODEL: 'gemini-3.5-flash',
        GEMINI_EMBEDDING_MODEL: 'gemini-embedding-2',
        AI_TIMEOUT_MS: 1000,
      },
      limit: vi.fn(),
      redis: { set: vi.fn().mockResolvedValue('OK'), eval: vi.fn().mockResolvedValue(1) },
    };
    return {
      service: new AiService(
        security as unknown as Security,
        recruiting as unknown as RecruitingService,
      ),
      updateMany,
      security,
    };
  }
  it('saves verified evidence without changing pipeline status', async () => {
    const { service, updateMany, security } = setup();
    providerParse.mockResolvedValue({
      status: 'completed',
      output_parsed: {
        requirements: [
          {
            requirementId: 9,
            status: 'SUPPORTED',
            explanation: 'Explicit evidence',
            quotes: ['Built APIs with NestJS.'],
          },
        ],
      },
    });
    await service.analyze(1, 4, 2);
    const data = updateMany.mock.calls[0][0].data;
    expect(data.analysis.requirements[0].status).toBe('SUPPORTED');
    expect(data).not.toHaveProperty('status');
    expect(providerFetch.mock.calls[0][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
    );
    expect(providerFetch.mock.calls[0][1].headers).toHaveProperty(
      'x-goog-api-key',
      security.config.GEMINI_API_KEY,
    );
    expect(providerParse.mock.calls[0][0].generationConfig.responseMimeType).toBe(
      'application/json',
    );
  });
  it('generates a vacancy draft in the requested language without writing recruitment data', async () => {
    const { service, security, updateMany } = setup();
    const draft = {
      title: 'Middle NestJS developer',
      description: 'Build and maintain backend APIs.',
      requirements: [{ name: 'NestJS', description: 'Develop REST APIs', required: true }],
    };
    providerParse.mockResolvedValue({ status: 'completed', output_parsed: draft });
    await expect(
      service.generateVacancy(7, 2, { brief: 'Middle NestJS developer kerak', language: 'uz' }),
    ).resolves.toEqual(draft);
    const payload = providerParse.mock.calls[0][0];
    expect(payload.systemInstruction.parts[0].text).toContain('Uzbek (Latin script)');
    expect(payload.systemInstruction.parts[0].text).not.toContain('Use only the supplied CV');
    expect(JSON.parse(payload.contents[0].parts[0].text)).toEqual({
      brief: 'Middle NestJS developer kerak',
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect(security.redis.set.mock.calls[0][0]).toBe('ai-lock:vacancy-draft:7:2');
    expect(security.redis.eval).toHaveBeenCalled();
  });
  it('rejects vacancy drafts that cannot be saved in the vacancy form', async () => {
    const { service } = setup();
    providerParse.mockResolvedValue({
      status: 'completed',
      output_parsed: { title: 'x'.repeat(201), description: 'Description', requirements: [] },
    });
    await expect(
      service.generateVacancy(1, 2, { brief: 'Developer needed', language: 'en' }),
    ).rejects.toThrow('AI processing failed');
  });
  it('rejects a result after the CV revision changes', async () => {
    const { service, updateMany } = setup(true);
    providerParse.mockResolvedValue({
      status: 'completed',
      output_parsed: {
        requirements: [{ requirementId: 9, status: 'UNKNOWN', explanation: 'Unclear', quotes: [] }],
      },
    });
    await expect(service.analyze(1, 4, 2)).rejects.toThrow('changed during processing');
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('handles provider failures and releases the request lock', async () => {
    const { service, security, updateMany } = setup();
    providerParse.mockRejectedValue(new Error('provider failed'));
    await expect(service.analyze(1, 4, 2)).rejects.toThrow('AI processing failed');
    expect(updateMany).not.toHaveBeenCalled();
    expect(security.redis.eval).toHaveBeenCalled();
  });
  it('rejects refusal and incomplete output', async () => {
    for (const response of [
      { status: 'completed', output_parsed: null },
      { status: 'incomplete', output_parsed: {} },
    ]) {
      const { service } = setup();
      providerParse.mockResolvedValue(response);
      await expect(service.analyze(1, 4, 2)).rejects.toThrow('AI processing failed');
    }
  });
  it('rejects interview questions referencing another requirement', async () => {
    const { service, updateMany } = setup();
    providerParse.mockResolvedValue({
      status: 'completed',
      output_parsed: {
        questions: Array.from({ length: 5 }, () => ({
          question: 'Explain your project.',
          rationale: 'Explore experience',
          requirementId: 100,
        })),
      },
    });
    await expect(service.analyze(1, 4, 2, true)).rejects.toThrow('Invalid interview questions');
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('saves valid interview questions and structured resume fields', async () => {
    const { service, updateMany } = setup();
    providerParse.mockResolvedValue({
      status: 'completed',
      output_parsed: {
        questions: Array.from({ length: 5 }, () => ({
          question: 'How did you build the API?',
          rationale: 'Understand relevant experience',
          requirementId: 9,
        })),
      },
    });
    await service.analyze(1, 4, 2, true);
    expect(updateMany.mock.calls[0][0].data.interviewQuestions.questions).toHaveLength(5);
    providerParse.mockResolvedValue({
      status: 'completed',
      output_parsed: {
        summary: 'API engineer',
        skills: ['NestJS'],
        experience: [],
        education: [],
        languages: [],
      },
    });
    await service.parse(1, 3, 2);
    expect(updateMany.mock.calls[1][0].data.skills).toEqual(['NestJS']);
    expect(updateMany.mock.calls[1][0].data.parsedResume.embedding).toEqual({
      model: 'gemini-embedding-2',
      dimensions: 768,
      values: Array(768).fill(0.1),
    });
    expect(providerFetch.mock.calls.at(-1)?.[0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent',
    );
    expect(providerEmbed.mock.calls[0][0].outputDimensionality).toBe(768);
  });
  it('does not save a partial resume when embedding fails or has the wrong dimensions', async () => {
    for (const failure of ['http', 'dimensions']) {
      const { service, security, updateMany } = setup();
      providerParse.mockResolvedValue({
        status: 'completed',
        output_parsed: {
          summary: 'API engineer',
          skills: ['NestJS'],
          experience: [],
          education: [],
          languages: [],
        },
      });
      if (failure === 'http')
        providerEmbed.mockRejectedValueOnce(new Error('upstream unavailable'));
      else providerEmbed.mockResolvedValueOnce({ embedding: { values: [0.1] } });
      await expect(service.parse(1, 3, 2)).rejects.toThrow(
        failure === 'http' ? 'AI processing failed' : 'AI embedding failed',
      );
      expect(updateMany).not.toHaveBeenCalled();
      expect(security.redis.eval).toHaveBeenCalled();
    }
  });
  it('handles HTTP errors without exposing the provider response or key', async () => {
    const { service, updateMany, security } = setup();
    providerFetch.mockImplementation(
      async () => new Response('private provider details', { status: 429 }),
    );
    await expect(service.analyze(1, 4, 2)).rejects.toThrow('quota reached');
    expect(providerFetch).toHaveBeenCalledTimes(2);
    expect(updateMany).not.toHaveBeenCalled();
    expect(security.redis.eval).toHaveBeenCalled();
  });
  it('prevents duplicate simultaneous AI requests', async () => {
    const { service, security } = setup();
    security.redis.set.mockResolvedValue(null as never);
    await expect(service.analyze(1, 4, 2)).rejects.toThrow('already running');
    expect(providerParse).not.toHaveBeenCalled();
  });
  it('recovers interview generation after a temporary Gemini outage', async () => {
    const { service, updateMany } = setup();
    providerFetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    providerParse.mockResolvedValue({
      status: 'completed',
      output_parsed: {
        questions: Array.from({ length: 5 }, () => ({
          question: 'Describe your API project.',
          rationale: 'Verify experience',
          requirementId: 9,
        })),
      },
    });
    await service.analyze(1, 4, 2, true);
    expect(providerFetch).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0][0].data.interviewQuestions.questions).toHaveLength(5);
  });
  it('reports timeouts distinctly and releases the lock', async () => {
    const { service, security, updateMany } = setup();
    security.config.AI_TIMEOUT_MS = 5;
    providerFetch.mockImplementationOnce(async (_url, options) => {
      await new Promise((_, reject) =>
        options.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Timed out', 'TimeoutError')),
          { once: true },
        ),
      );
      return new Response();
    });
    await expect(service.analyze(1, 4, 2, true)).rejects.toThrow('took too long');
    expect(updateMany).not.toHaveBeenCalled();
    expect(security.redis.eval).toHaveBeenCalled();
  });
});
