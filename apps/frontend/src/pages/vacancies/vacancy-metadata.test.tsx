import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VacancyForm, parseDescriptionMeta } from './index';
import { changeLanguage } from '../../i18n';
import type { Vacancy } from '../../types';

const send = vi.fn().mockResolvedValue({ id: 1 });
vi.mock('../../lib/api', () => ({
  api: vi.fn().mockResolvedValue({ connected: false }),
  send: (...args: unknown[]) => send(...args),
}));
vi.mock('../../features/auth', () => ({ useAuth: () => ({ user: { id: 1, aiConfigured: false } }) }));

beforeEach(async () => { send.mockClear(); await changeLanguage('uz'); });
afterEach(cleanup);

describe('vacancy metadata', () => {
  it('never guesses metadata for a dental vacancy', async () => {
    render(<VacancyForm value={null} close={vi.fn()} saved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Vakansiya nomi'), { target: { value: 'Tish doktori' } });
    fireEvent.change(screen.getByLabelText('Batafsil tavsif'), { target: { value: 'Bemorlarga stomatologik yordam ko‘rsatish' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vakansiya yaratish' }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    const payload = send.mock.calls[0][1];
    expect(payload).toMatchObject({ description: 'Bemorlarga stomatologik yordam ko‘rsatish', salaryFrom: null, salaryTo: null, salaryNegotiable: false, location: null, workModel: null, employmentType: null, seniority: null });
    expect(payload.description).not.toContain('Department:');
  });

  it('sends the pay HR types, grouped digits and all, and "negotiable" clears it', async () => {
    render(<VacancyForm value={null} close={vi.fn()} saved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Vakansiya nomi'), { target: { value: 'Backend dasturchi' } });
    fireEvent.change(screen.getByLabelText('Batafsil tavsif'), { target: { value: 'NestJS bilan servislar yozish' } });
    const from = screen.getByLabelText('Dan') as HTMLInputElement;
    fireEvent.change(from, { target: { value: '5000000' } });
    expect(from.value).toBe('5 000 000');
    fireEvent.change(screen.getByLabelText('Gacha'), { target: { value: '8 000 000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vakansiya yaratish' }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls[0][1]).toMatchObject({ salaryFrom: 5_000_000, salaryTo: 8_000_000, salaryCurrency: 'UZS', salaryNegotiable: false });
    expect(send.mock.calls[0][1]).not.toHaveProperty('department');

    send.mockClear();
    fireEvent.click(screen.getByLabelText('Kelishiladi'));
    expect(from).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Vakansiya yaratish' }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls[0][1]).toMatchObject({ salaryFrom: null, salaryTo: null, salaryCurrency: null, salaryNegotiable: true });
  });

  it('extracts only the exact legacy prefix and leaves other prose alone', () => {
    const legacy = 'Department: Engineering\nLocation: Tashkent · Hybrid\nEmployment type: Full-time\nSeniority: Middle\n\nActual work';
    expect(parseDescriptionMeta(legacy)).toMatchObject({ description: 'Actual work', department: 'Engineering', location: 'Tashkent', workModel: 'Hybrid' });
    expect(parseDescriptionMeta('Please send Department: Engineering in an email').department).toBe('');
  });

  it('keeps a legacy review flag until HR explicitly confirms', async () => {
    const vacancy: Vacancy = { id: 3, title: 'Tish doktori', description: 'Actual work', status: 'DRAFT', requirements: [], department: 'Engineering', location: 'Tashkent', workModel: 'Hybrid', metadataReviewRequired: true, createdAt: new Date().toISOString() };
    render(<VacancyForm value={vacancy} close={vi.fn()} saved={vi.fn()} />);
    expect(screen.getByText('Tekshirish kerak')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vakansiyani saqlash' }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls[0][1].confirmMetadataReview).toBe(false);
  });
});
