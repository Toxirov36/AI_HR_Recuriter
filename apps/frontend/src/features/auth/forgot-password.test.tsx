import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { AuthPage } from './index';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../../lib/api', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  send: mocks.send,
}));
vi.mock('./google-sign-in', () => ({ GoogleSignInButton: () => null }));
vi.mock('react-i18next', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useTranslation: () => ({
    t: (key: string, options?: { seconds?: number }) =>
      options?.seconds !== undefined ? `${key}:${options.seconds}` : key,
    i18n: { language: 'ru' },
  }),
}));
vi.mock('../../components/ui', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  LanguageSwitcher: () => null,
}));

function fillCodeForm(password = 'new-password-1', repeat = password) {
  fireEvent.change(screen.getByLabelText('auth.code'), { target: { value: '123456' } });
  fireEvent.change(screen.getByLabelText('auth.newPassword'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('auth.confirmPassword'), { target: { value: repeat } });
  fireEvent.submit(document.querySelector('form[name=auth-reset]')!);
}

async function openCodeStep() {
  fireEvent.click(screen.getByRole('button', { name: 'auth.forgotPassword' }));
  fireEvent.change(screen.getByLabelText('auth.workEmail'), { target: { value: 'hr@test.com' } });
  fireEvent.submit(document.querySelector('form[name=auth-forgot]')!);
  expect(await screen.findByLabelText('auth.code')).toHaveValue('');
}

beforeEach(() => {
  mocks.send.mockReset();
  mocks.send.mockResolvedValue({ ok: true });
  window.history.replaceState({}, '', '/login');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('forgot password', () => {
  it('goes from the login link through the code step back to sign in with a notice', async () => {
    const onModeChange = vi.fn();
    render(<AuthPage onSuccess={vi.fn()} onModeChange={onModeChange} />);
    await openCodeStep();
    expect(mocks.send).toHaveBeenCalledWith('/auth/password-reset/request', { email: 'hr@test.com', lang: 'ru' });
    expect(onModeChange).toHaveBeenCalledWith('forgot', false);

    fillCodeForm();
    await screen.findByText('auth.resetDone');
    expect(mocks.send).toHaveBeenLastCalledWith('/auth/password-reset/confirm', {
      email: 'hr@test.com',
      code: '123456',
      password: 'new-password-1',
    });
    expect(onModeChange).toHaveBeenLastCalledWith('login', true);
  });

  it('stops when the two passwords differ', async () => {
    render(<AuthPage onSuccess={vi.fn()} />);
    await openCodeStep();
    fillCodeForm('new-password-1', 'new-password-2');
    expect(await screen.findByText('auth.passwordsMismatch')).toBeInTheDocument();
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('shows a clear message for a wrong code', async () => {
    render(<AuthPage onSuccess={vi.fn()} />);
    await openCodeStep();
    mocks.send.mockRejectedValueOnce(new ApiError(400, 'The code is invalid or expired'));
    fillCodeForm();
    expect(await screen.findByText('auth.invalidCode')).toBeInTheDocument();
  });

  it('lets the code be sent again only after 60 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AuthPage onSuccess={vi.fn()} />);
    await openCodeStep();
    const resend = screen.getByRole('button', { name: 'auth.resendIn:60' });
    expect(resend).toBeDisabled();
    for (let i = 0; i < 60; i++) await act(() => vi.advanceTimersByTimeAsync(1000));    fireEvent.click(screen.getByRole('button', { name: 'auth.resendCode' }));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2));
  });

  it('opens straight on the reset form at /forgot-password and shows the notice after ?reset=done', () => {
    const first = render(<AuthPage onSuccess={vi.fn()} initialMode="forgot" />);
    expect(screen.getByRole('heading', { name: 'auth.resetTitle' })).toBeInTheDocument();
    first.unmount();
    window.history.replaceState({}, '', '/login?reset=done');
    render(<AuthPage onSuccess={vi.fn()} />);
    expect(screen.getByText('auth.resetDone')).toBeInTheDocument();
  });
});
