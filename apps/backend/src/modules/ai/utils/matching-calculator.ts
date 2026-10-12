export interface RequirementItem {
  id: number;
  name: string;
  required: boolean;
}

export interface RequirementEvidenceItem {
  requirementId: number;
  status: 'SUPPORTED' | 'PARTIAL' | 'NOT_FOUND' | 'UNKNOWN' | string;
  explanation?: string;
  quotes?: string[];
}

export interface AnalysisPayload {
  requirements?: RequirementEvidenceItem[];
}

export interface CandidateScoreBreakdown {
  matchScore: number;
  mandatoryScore: number;
  optionalScore: number;
  totalRequirements: number;
  supportedCount: number;
  partialCount: number;
  notFoundCount: number;
  unknownCount: number;
  strengths: string[];
  gaps: string[];
  partialMatches: string[];
  requirementDetails: Array<{
    id: number;
    name: string;
    required: boolean;
    status: 'SUPPORTED' | 'PARTIAL' | 'NOT_FOUND' | 'UNKNOWN' | 'NOT_ANALYZED';
    explanation?: string;
    quotes?: string[];
  }>;
}

export function calculateCandidateMatchScore(
  requirements: RequirementItem[],
  analysis?: AnalysisPayload | null,
): CandidateScoreBreakdown {
  if (!requirements || requirements.length === 0) {
    return {
      matchScore: 0,
      mandatoryScore: 0,
      optionalScore: 0,
      totalRequirements: 0,
      supportedCount: 0,
      partialCount: 0,
      notFoundCount: 0,
      unknownCount: 0,
      strengths: [],
      gaps: [],
      partialMatches: [],
      requirementDetails: [],
    };
  }

  const evidenceMap = new Map<number, RequirementEvidenceItem>();
  if (analysis?.requirements && Array.isArray(analysis.requirements)) {
    for (const item of analysis.requirements) {
      evidenceMap.set(item.requirementId, item);
    }
  }

  let totalWeight = 0;
  let earnedPoints = 0;

  let mandatoryWeight = 0;
  let mandatoryEarned = 0;

  let optionalWeight = 0;
  let optionalEarned = 0;

  let supportedCount = 0;
  let partialCount = 0;
  let notFoundCount = 0;
  let unknownCount = 0;

  const strengths: string[] = [];
  const gaps: string[] = [];
  const partialMatches: string[] = [];

  const requirementDetails = requirements.map((req) => {
    const weight = req.required ? 2 : 1;
    totalWeight += weight;

    if (req.required) {
      mandatoryWeight += weight;
    } else {
      optionalWeight += weight;
    }

    const evidence = evidenceMap.get(req.id);
    const status = (evidence?.status as
      | 'SUPPORTED'
      | 'PARTIAL'
      | 'NOT_FOUND'
      | 'UNKNOWN') || 'NOT_ANALYZED';

    let itemPoints = 0;
    if (status === 'SUPPORTED') {
      itemPoints = weight * 1.0;
      supportedCount++;
      strengths.push(req.name);
    } else if (status === 'PARTIAL') {
      itemPoints = weight * 0.5;
      partialCount++;
      partialMatches.push(req.name);
    } else if (status === 'NOT_FOUND') {
      notFoundCount++;
      gaps.push(req.name);
    } else {
      unknownCount++;
      gaps.push(req.name);
    }

    earnedPoints += itemPoints;
    if (req.required) {
      mandatoryEarned += itemPoints;
    } else {
      optionalEarned += itemPoints;
    }

    return {
      id: req.id,
      name: req.name,
      required: req.required,
      status,
      explanation: evidence?.explanation,
      quotes: evidence?.quotes,
    };
  });

  const matchScore = totalWeight > 0 ? Math.round((earnedPoints / totalWeight) * 100) : 0;
  const mandatoryScore =
    mandatoryWeight > 0 ? Math.round((mandatoryEarned / mandatoryWeight) * 100) : 100;
  const optionalScore =
    optionalWeight > 0 ? Math.round((optionalEarned / optionalWeight) * 100) : 100;

  return {
    matchScore: Math.min(100, Math.max(0, matchScore)),
    mandatoryScore: Math.min(100, Math.max(0, mandatoryScore)),
    optionalScore: Math.min(100, Math.max(0, optionalScore)),
    totalRequirements: requirements.length,
    supportedCount,
    partialCount,
    notFoundCount,
    unknownCount,
    strengths,
    gaps,
    partialMatches,
    requirementDetails,
  };
}
