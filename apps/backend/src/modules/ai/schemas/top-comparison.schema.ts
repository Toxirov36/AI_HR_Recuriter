import { z } from 'zod';

export const topComparisonSchema = z.object({
  executiveSummary: z.string(),
  candidateHighlights: z.array(
    z.object({
      candidateId: z.number().int(),
      rank: z.number().int(),
      keyStrengthsSummary: z.string(),
      areasToVerify: z.string(),
      recommendedInterviewFocus: z.string(),
    }),
  ),
  overallRecommendation: z.string(),
});

export type TopComparisonResult = z.infer<typeof topComparisonSchema>;
