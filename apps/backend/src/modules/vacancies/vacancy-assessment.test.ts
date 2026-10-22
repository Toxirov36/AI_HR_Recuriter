import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { VacancyAssessmentService } from './vacancy-assessment.service';
import { approvedAssessment, assessmentState } from '../ai/utils/assessment-approval';
import { getDefaultAssessmentForVacancy } from '../ai/utils/assessment-helper';

const assessment = getDefaultAssessmentForVacancy('Backend Developer');
const actor = { id: 1, companyId: 3, fullName: 'Hr Admin', role: 'ADMIN', email: null } as never;
const base = { id: 5, companyId: 3, title: 'Backend Developer', description: 'NestJS', status: 'ACTIVE', revision: 2, requirements: [], assessmentEditVersion: 4 };

function setup(vacancy: Record<string, unknown>) {
  const db = { vacancy: { findFirst: vi.fn().mockResolvedValue({ ...base, ...vacancy }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
  const gemini = { generate: vi.fn().mockResolvedValue(assessment) };
  const security = { limit: vi.fn(), config: { GEMINI_API_KEY: 'k' } };
  const audit = { log: vi.fn() };
  return { db, gemini, security, audit, service: new VacancyAssessmentService(db as never, security as never, gemini as never, audit as never) };
}

describe('assessment approval state', () => {
  it('only an approved test for the current revision reaches candidates', () => {
    const draft = { revision: 2, assessmentQuestions: assessment, assessmentRevision: 2, assessmentApprovedAt: null };
    expect(assessmentState({ revision: 2 })).toBe('NONE');
    expect(assessmentState({ ...draft, assessmentRevision: 1 })).toBe('STALE');
    expect(assessmentState(draft)).toBe('PENDING');
    expect(approvedAssessment(draft)).toBeNull();
    const approved = { ...draft, assessmentApprovedAt: new Date() };
    expect(assessmentState(approved)).toBe('APPROVED');
    expect(approvedAssessment(approved)?.questions).toHaveLength(10);
    expect(approvedAssessment({ ...approved, revision: 3 })).toBeNull();
  });
});

describe('VacancyAssessmentService', () => {
  it('generates a draft for the current revision and withdraws any approval', async () => {
    const { db, gemini, service, audit } = setup({});
    await service.generate(actor, 5);
    expect(gemini.generate).toHaveBeenCalled();
    expect(db.vacancy.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 5, companyId: 3, revision: 2 },
      data: expect.objectContaining({ assessmentRevision: 2, assessmentApprovedAt: null }),
    }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'VACANCY_ASSESSMENT_GENERATED' }));
  });

  it('fails when the vacancy changed during generation', async () => {
    const { db, service } = setup({});
    db.vacancy.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.generate(actor, 5)).rejects.toBeInstanceOf(ConflictException);
  });

  it('approves only a pending test of the current revision', async () => {
    const pending = setup({ assessmentQuestions: assessment, assessmentRevision: 2, assessmentApprovedAt: null });
    await pending.service.approve(actor, 5);
    expect(pending.db.vacancy.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { assessmentApprovedAt: expect.any(Date) } }));
    expect(pending.audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'VACANCY_ASSESSMENT_APPROVED' }));

    const stale = setup({ assessmentQuestions: assessment, assessmentRevision: 1 });
    await expect(stale.service.approve(actor, 5)).rejects.toBeInstanceOf(ConflictException);
    expect(stale.db.vacancy.updateMany).not.toHaveBeenCalled();
  });

  it('an edit saves the questions and withdraws the approval', async () => {
    const { db, service } = setup({ assessmentQuestions: assessment, assessmentRevision: 2, assessmentApprovedAt: new Date() });
    await service.save(actor, 5, assessment);
    expect(db.vacancy.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ assessmentEditVersion: 4 }),
      data: expect.objectContaining({ assessmentApprovedAt: null }),
    }));
  });

  it('auto-drafts for active vacancies without a current draft, and skips otherwise', async () => {
    const needs = setup({});
    await needs.service.autoGenerate(3, 5);
    expect(needs.gemini.generate).toHaveBeenCalled();

    const has = setup({ assessmentQuestions: assessment, assessmentRevision: 2 });
    await has.service.autoGenerate(3, 5);
    expect(has.gemini.generate).not.toHaveBeenCalled();

    const draftStatus = setup({ status: 'DRAFT' });
    await draftStatus.service.autoGenerate(3, 5);
    expect(draftStatus.gemini.generate).not.toHaveBeenCalled();

    const failing = setup({});
    failing.gemini.generate.mockRejectedValue(new Error('down'));
    await expect(failing.service.autoGenerate(3, 5)).resolves.toBeUndefined();
  });
});
