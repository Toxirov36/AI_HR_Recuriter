import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthPage } from './index';
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../../lib/api', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  send: mocks.send,
}));
vi.mock('./google-sign-in', () => ({
  GoogleSignInButton: ({ onCredential }: { onCredential: (value: string) => void }) => (
    <button type="button" onClick={() => onCredential('google-id-token')}>
      Google orqali davom etish
    </button>
  ),
}));
vi.mock('react-i18next', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'auth.companyName': 'Company name',
        'auth.fullName': 'Full name',
        'auth.createWorkspace': 'Create a workspace',
        'auth.createAWorkspace': 'Create a workspace',
      })[key] || key,
  }),
}));
vi.mock('../../components/ui', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  LanguageSwitcher: () => null,
}));

beforeEach(() => {
  mocks.send.mockReset();
  window.history.replaceState({}, '', '/');
});
afterEach(cleanup);
describe('Google login and registration', () => {
  it('shows Google on both login and register and refreshes the session after existing-account login', async () => {
    const success = vi.fn();
    mocks.send.mockResolvedValue({ id: 1 });
    render(<AuthPage onSuccess={success} />);
    expect(screen.getByRole('button', { name: 'Google orqali davom etish' })).toBeInTheDocument();
    expect(document.querySelector('input[type=tel]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create a workspace' }));
    expect(document.querySelector('input[type=tel]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Google orqali davom etish' }));
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
    expect(mocks.send).toHaveBeenCalledWith('/auth/google/verify', {
      credential: 'google-id-token',
    });
  });
  it('submits only email and password for the ordinary login flow', async () => {
    mocks.send.mockResolvedValue({ id: 1 });
    const success = vi.fn();
    const view = render(<AuthPage onSuccess={success} />);
    fireEvent.change(screen.getByLabelText('auth.workEmail'), {
      target: { value: 'member@example.com' },
    });
    fireEvent.change(screen.getByLabelText('auth.password'), {
      target: { value: 'safe-password-123' },
    });
    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
    expect(mocks.send).toHaveBeenCalledWith('/auth/login', {
      email: 'member@example.com',
      password: 'safe-password-123',
    });
  });
  it('collects a company after Google confirmation without asking for a password', async () => {
    mocks.send
      .mockResolvedValueOnce({
        googleRegistrationRequired: true,
        signupToken: 'a'.repeat(64),
        email: 'new@gmail.com',
        fullName: 'Google Member',
      })
      .mockResolvedValueOnce({ id: 1 });
    const success = vi.fn();
    render(<AuthPage onSuccess={success} />);
    fireEvent.click(screen.getByRole('button', { name: 'Google orqali davom etish' }));
    await screen.findByRole('heading', { name: 'Kompaniyangizni yarating' });
    expect(screen.getByLabelText('Full name')).toHaveValue('Google Member');
    expect(document.querySelector('input[name=password]')).toBeNull();
    fireEvent.change(screen.getByLabelText('Company name'), {
      target: { value: 'Google Workspace' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Workspace yaratish' }));
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
    expect(mocks.send).toHaveBeenLastCalledWith('/auth/google/register', {
      signupToken: 'a'.repeat(64),
      companyName: 'Google Workspace',
      fullName: 'Google Member',
    });
  });
  it('retains the password invitation flow', () => {
    window.history.replaceState({}, '', '/?invite=' + 'a'.repeat(64));
    render(<AuthPage onSuccess={vi.fn()} />);
    expect(
      screen.queryByRole('button', { name: 'Google orqali davom etish' }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('input[name=password]')).not.toBeNull();
  });
});
