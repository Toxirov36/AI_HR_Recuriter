import { describe, expect, it, vi } from 'vitest';
import { ApplicationsService } from './applications.service';

describe('application list', () => {
  it('keeps tenant, vacancy, stage and search filters on every page while counting all matching stages', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 62, status: 'NEW' }]);
    const count = vi.fn().mockResolvedValue(23);
    const groupBy = vi.fn().mockResolvedValue([{ status: 'NEW', _count: 23 }]);
    const service = new ApplicationsService(
      { application: { findMany, count, groupBy } } as never,
      {} as never,
    );

    const result = await service.list(4, { page: 2, search: 'ali', stage: 'NEW', vacancyId: 9, sort: 'newest' });

    expect(result).toMatchObject({ total: 23, page: 2, stageCounts: { NEW: 23 } });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20,
      take: 20,
      where: expect.objectContaining({ companyId: 4, vacancyId: 9, status: 'NEW' }),
    }));
    expect(count).toHaveBeenCalledWith({ where: findMany.mock.calls[0][0].where });
    expect(groupBy.mock.calls[0][0].where).toMatchObject({ companyId: 4, vacancyId: 9, status: 'NEW' });
  });
});
