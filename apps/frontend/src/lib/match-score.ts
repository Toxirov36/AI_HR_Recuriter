import type { Application, Evidence } from '../types';

export interface EvidenceSummary {
  supported: number;
  partial: number;
  notFound: number;
  unknown: number;
  total: number;
  hasAnalysis: boolean;
}

/**
 * Deprecated compatibility export:
 * Percentage match calculation was removed in favor of NIST AI RMF evidence breakdown.
 * Kept to resolve cached browser module imports.
 */
export function calculateMatchScore(_analysis?: unknown): number | null {
  return null;
}


/**
 * Summarizes requirement evidence breakdown without computing an opaque percentage score.
 * Conforms to NIST AI RMF & EU AI Act requirements:
 * - AI extracts evidence, but never computes an automated ranking score.
 * - 'NOT_FOUND' indicates no statement was found in CV (does NOT mean candidate lacks the skill).
 * - Human-in-the-Loop review is required.
 */
export function getEvidenceSummary(
  analysis: { requirements: Evidence[] } | null | undefined,
): EvidenceSummary | null {
  if (!analysis?.requirements || analysis.requirements.length === 0) {
    return null;
  }

  const requirements = analysis.requirements;
  let supported = 0;
  let partial = 0;
  let notFound = 0;
  let unknown = 0;

  for (const req of requirements) {
    switch (req.status) {
      case 'SUPPORTED':
        supported++;
        break;
      case 'PARTIAL':
        partial++;
        break;
      case 'NOT_FOUND':
        notFound++;
        break;
      case 'UNKNOWN':
      default:
        unknown++;
        break;
    }
  }

  return {
    supported,
    partial,
    notFound,
    unknown,
    total: requirements.length,
    hasAnalysis: true,
  };
}

export type PipelineSortOption = 'created_desc' | 'created_asc' | 'name_asc';

/**
 * Sorts applications based on objective attributes (date or name).
 * Automated AI match score ranking is intentionally excluded to prevent automation bias.
 */
export function sortApplications(
  applications: Application[],
  sortOption: PipelineSortOption,
): Application[] {
  const list = [...applications];

  switch (sortOption) {
    case 'created_asc':
      return list.sort((a, b) => a.id - b.id);

    case 'name_asc':
      return list.sort((a, b) =>
        a.candidate.fullName.localeCompare(b.candidate.fullName),
      );

    case 'created_desc':
    default:
      return list.sort((a, b) => b.id - a.id);
  }
}
