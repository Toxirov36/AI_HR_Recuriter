import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleSignInButton } from './google-sign-in';
const mocks = vi.hoisted(() => ({ api: vi.fn(), send: vi.fn() }));
vi.mock('../../lib/api', () => mocks);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete (window as unknown as { google?: unknown }).google;
});
describe('Google SDK button', () => {
  it('remains unavailable without a configured OAuth client', async () => {
    mocks.api.mockResolvedValue({ configured: false, clientId: null });
    render(<GoogleSignInButton disabled={false} onCredential={vi.fn()} onError={vi.fn()} />);
    expect(
      await screen.findByText('Google orqali kirish hozircha mavjud emas.'),
    ).toBeInTheDocument();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('passes the server nonce to Google and returns the credential through the callback', async () => {
    mocks.api.mockResolvedValue({ configured: true, clientId: 'google-client' });
    mocks.send.mockResolvedValue({ nonce: 'server-nonce' });
    const initialize = vi.fn(),
      renderButton = vi.fn(),
      cancel = vi.fn(),
      credential = vi.fn();
    (window as unknown as { google: unknown }).google = {
      accounts: { id: { initialize, renderButton, cancel } },
    };
    const view = render(
      <GoogleSignInButton disabled={false} onCredential={credential} onError={vi.fn()} />,
    );
    await waitFor(() => expect(initialize).toHaveBeenCalledOnce());
    const configuration = initialize.mock.calls[0][0];
    expect(configuration).toMatchObject({
      client_id: 'google-client',
      nonce: 'server-nonce',
      auto_select: false,
    });
    configuration.callback({ credential: 'signed-google-token' });
    expect(credential).toHaveBeenCalledWith('signed-google-token');
    view.unmount();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
