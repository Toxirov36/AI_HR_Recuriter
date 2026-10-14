import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Profile } from './index';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  refresh: vi.fn(),
  user: {
    id: 1,
    fullName: 'Dilshodbek Toxirov',
    email: 'dilshodbektohirov40@gmail.com',
    phone: null,
    role: 'ADMIN',
    companyId: 10,
    company: { name: 'Acme Corp' },
    aiConfigured: true,
  },
}));

vi.mock('../../lib/api', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  send: mocks.send,
}));

vi.mock('../../features/auth', () => ({
  useAuth: () => ({
    user: mocks.user,
    refresh: mocks.refresh,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

beforeEach(() => {
  mocks.send.mockReset();
  mocks.refresh.mockReset();
});
afterEach(cleanup);

describe('Profile Page', () => {
  it('renders profile information correctly for admin', () => {
    render(<Profile />);
    expect(screen.getByDisplayValue('Dilshodbek Toxirov')).toBeInTheDocument();
    expect(screen.getByDisplayValue('dilshodbektohirov40@gmail.com')).toBeDisabled();
    expect(screen.getByDisplayValue('Acme Corp')).toBeEnabled();
  });

  it('submits updated full name and company name', async () => {
    mocks.send.mockResolvedValue({ ok: true });
    render(<Profile />);

    const nameInput = screen.getByDisplayValue('Dilshodbek Toxirov');
    fireEvent.change(nameInput, { target: { value: 'Dilshodbek Updated' } });

    const companyInput = screen.getByDisplayValue('Acme Corp');
    fireEvent.change(companyInput, { target: { value: 'New Company Name' } });

    const saveButtons = screen.getAllByRole('button');
    const profileSaveBtn = saveButtons.find((btn) => btn.getAttribute('form') === 'profile-form');
    expect(profileSaveBtn).toBeDefined();
    fireEvent.click(profileSaveBtn!);

    await waitFor(() => {
      expect(mocks.send).toHaveBeenCalledWith(
        '/auth/profile',
        {
          fullName: 'Dilshodbek Updated',
          companyName: 'New Company Name',
        },
        'PUT',
      );
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('updates password when valid new passwords are provided', async () => {
    mocks.send.mockResolvedValue({ ok: true });
    render(<Profile />);

    const passwordInputs = screen.getAllByPlaceholderText(/belgi/i);
    expect(passwordInputs.length).toBe(2);

    fireEvent.change(passwordInputs[0], { target: { value: 'newSecretPass123' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'newSecretPass123' } });

    const saveButtons = screen.getAllByRole('button');
    const passwordSaveBtn = saveButtons.find((btn) => btn.getAttribute('form') === 'password-form');
    expect(passwordSaveBtn).toBeDefined();
    fireEvent.click(passwordSaveBtn!);

    await waitFor(() => {
      expect(mocks.send).toHaveBeenCalledWith(
        '/auth/password',
        {
          password: 'newSecretPass123',
        },
        'PUT',
      );
    });
  });

  it('disables company editing for non-admin user', () => {
    mocks.user = {
      ...mocks.user,
      role: 'HR',
    };
    render(<Profile />);

    expect(screen.getByDisplayValue('Acme Corp')).toBeDisabled();
  });
});
