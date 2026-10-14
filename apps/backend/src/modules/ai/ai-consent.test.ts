import { describe, expect, it, vi } from 'vitest';
import { AiService } from './ai.service';

describe('vacancy-specific AI consent', () => {
  it('blocks analysis of an application that declined AI even when the candidate consented on another application', async () => {
    const recruiting = {
      application: vi.fn().mockResolvedValue({
        id: 8,
        aiConsentGranted: false,
        candidate: { publicSubmittedAt: new Date(), aiConsentAt: new Date(), resumeText: 'CV text' },
        vacancy: { requirements: [{ id: 1, name: 'TypeScript', required: true }] },
      }),
    };
    const service = new AiService({} as never, recruiting as never, {} as never);
    await expect(service.analyze(3, 8, 2)).rejects.toThrow('Candidate did not opt in to AI analysis');
    expect(recruiting.application).toHaveBeenCalledWith(3, 8);
  });
});
