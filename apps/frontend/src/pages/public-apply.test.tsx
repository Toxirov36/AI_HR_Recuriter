import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicApplyPage } from './public-apply';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('public application page', () => {
  it('explains CV and AI use and submits a CV with separate optional AI consent', async () => {
    window.history.replaceState({}, '', '/apply/test-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        title: 'Backend Developer', description: 'Build APIs', company: { name: 'Acme', retentionDays: 180 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<PublicApplyPage />);
    expect(await screen.findByText('Backend Developer')).toBeInTheDocument();
    expect(screen.getByText(/Google Gemini orqali tartiblanishi/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: /To‘liq ism/i }), { target: { value: 'Ali Valiyev' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Email/i }), { target: { value: 'ali@example.com' } });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['%PDF-test'], 'cv.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Ma’lumotlarim arizamni ko‘rib chiqish/ }));
    fireEvent.submit(container.querySelector('form')!);

    expect(await screen.findByText('Arizangiz qabul qilindi')).toBeInTheDocument();
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/public/vacancies/test-token/apply');
    expect((options.body as FormData).get('aiConsent')).toBe('false');
    expect((options.body as FormData).get('privacyAccepted')).toBe('true');
  });
});
