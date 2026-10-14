import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenter } from './notification-center';
import '../i18n';

const mocks = vi.hoisted(() => {
  const sampleNotifications = [
    {
      id: 'app-1',
      type: 'NEW_APPLICATION' as const,
      title: 'Yangi ariza: Ali',
      subtitle: 'Junior backend Nodejs developer lavozimiga',
      link: '/applications/1',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'interview-2',
      type: 'STAGE_INTERVIEW' as const,
      title: 'Suhbat bosqichi: Dilshodbek',
      subtitle: 'Junior backend Nodejs developer',
      link: '/applications/2',
      createdAt: new Date().toISOString(),
    },
  ];
  return {
    sampleNotifications,
    data: { items: sampleNotifications },
    reload: vi.fn(),
    navigate: vi.fn(),
  };
});

vi.mock('../lib/query-client', () => ({
  useData: () => ({
    data: mocks.data,
    reload: mocks.reload,
  }),
}));

vi.mock('react-router-dom', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useNavigate: () => mocks.navigate,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

beforeEach(() => {
  localStorage.clear();
  mocks.reload.mockReset();
  mocks.navigate.mockReset();
});
afterEach(cleanup);

describe('NotificationCenter', () => {
  it('renders notification button with unread count badge', () => {
    render(<NotificationCenter />);
    const trigger = screen.getByRole('button', { name: /bildirishnomalar/i });
    expect(trigger).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('opens popover and displays notification items', () => {
    render(<NotificationCenter />);
    const trigger = screen.getByRole('button', { name: /bildirishnomalar/i });
    fireEvent.click(trigger);

    expect(screen.getByText('Yangi ariza: Ali')).toBeInTheDocument();
    expect(screen.getByText('Suhbat bosqichi: Dilshodbek')).toBeInTheDocument();
  });

  it('clears all notifications when Tozalash button is clicked', () => {
    render(<NotificationCenter />);
    const trigger = screen.getByRole('button', { name: /bildirishnomalar/i });
    fireEvent.click(trigger);

    const clearAllBtn = screen.getByRole('button', { name: /tozalash/i });
    fireEvent.click(clearAllBtn);

    expect(screen.getByText(/hozircha yangi bildirishnoma yo‘q/i)).toBeInTheDocument();
    expect(screen.queryByText('Yangi ariza: Ali')).not.toBeInTheDocument();
  });

  it('deletes an individual notification when delete button is clicked', () => {
    render(<NotificationCenter />);
    const trigger = screen.getByRole('button', { name: /bildirishnomalar/i });
    fireEvent.click(trigger);

    const deleteButtons = screen.getAllByRole('button', { name: /o‘chirish/i });
    expect(deleteButtons.length).toBe(2);

    fireEvent.click(deleteButtons[0]);

    expect(screen.queryByText('Yangi ariza: Ali')).not.toBeInTheDocument();
    expect(screen.getByText('Suhbat bosqichi: Dilshodbek')).toBeInTheDocument();
  });
});
