import { BadGatewayException } from '@nestjs/common';
import { z } from 'zod';

export const evidenceSchema = z.object({
  requirements: z.array(
    z.object({
      requirementId: z.number().int(),
      status: z.enum(['SUPPORTED', 'PARTIAL', 'NOT_FOUND', 'UNKNOWN']),
      explanation: z.string(),
      quotes: z.array(z.string()),
    }),
  ),
});

export function validateEvidence(
  result: z.infer<typeof evidenceSchema>,
  requirements: { id: number }[],
  source: string,
) {
  const ids = result.requirements.map((r) => r.requirementId);
  if (
    ids.length !== requirements.length ||
    new Set(ids).size !== ids.length ||
    requirements.some((r) => !ids.includes(r.id))
  )
    throw new BadGatewayException('AI returned incomplete requirement evidence. Retry analysis.');
  return {
    requirements: result.requirements.map((r) => {
      const quotes = r.quotes.filter((q) => q.trim().length > 0 && source.includes(q));
      if (
        quotes.length !== r.quotes.length ||
        (['SUPPORTED', 'PARTIAL'].includes(r.status) && !quotes.length)
      ) {
        return {
          ...r,
          status: 'UNKNOWN' as const,
          quotes: [],
          explanation:
            'AI evidence could not be verified against the CV. A human review is required.',
        };
      }
      return { ...r, quotes };
    }),
  };
}
