import { describe, expect, it, vi } from 'vitest';
import { RecruitingService } from './recruiting.service';
import { vacancy } from '../../common/pipes/validation';

describe('vacancy metadata review', () => {
  it('stores empty optional fields as null and clears the review flag only after confirmation', async () => {
    const update = vi.fn().mockResolvedValue({ id: 3, status: 'DRAFT' });
    const tx = { vacancy: { update }, application: { updateMany: vi.fn() } };
    const db = {
      vacancy: { findFirst: vi.fn().mockResolvedValue({ id: 3, metadataReviewRequired: true }) },
      $transaction: (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    };
    const service = new RecruitingService(db as never);
    const fields = vacancy.parse({ title: 'Tish doktori', description: 'Stomatologik yordam', status: 'DRAFT', requirements: [], department: '', location: '' });

    await service.saveVacancy(8, 3, fields);
    expect(update.mock.calls[0][0].data).toMatchObject({ department: null, location: null });
    expect(update.mock.calls[0][0].data.metadataReviewRequired).toBeUndefined();

    await service.saveVacancy(8, 3, { ...fields, confirmMetadataReview: true });
    expect(update.mock.calls[1][0].data.metadataReviewRequired).toBe(false);
    expect(update.mock.calls[1][0].where).toEqual({ id_companyId: { id: 3, companyId: 8 } });
  });
});
