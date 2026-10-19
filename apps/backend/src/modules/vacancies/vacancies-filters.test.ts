import { describe, expect, it, vi } from 'vitest';
import { VacanciesService } from './vacancies.service';

describe('vacancy list', () => {
  it('filters and counts in the database within one company, including later pages', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 81, title: 'Tish doktori' }]);
    const count = vi.fn().mockResolvedValue(21);
    const service = new VacanciesService(
      { vacancy: { findMany, count } } as never,
      {} as never,
      {} as never,
    );

    const result = await service.list(7, { page: 2, search: 'tish', status: 'ACTIVE', sort: 'newest' });

    expect(result).toMatchObject({ total: 21, page: 2, pageSize: 20 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20,
      take: 20,
      where: expect.objectContaining({ companyId: 7, status: 'ACTIVE' }),
    }));
    expect(count).toHaveBeenCalledWith({ where: findMany.mock.calls[0][0].where });
    expect(findMany.mock.calls[0][0].where.OR).toEqual(expect.arrayContaining([
      { title: { contains: 'tish', mode: 'insensitive' } },
    ]));
  });
});
