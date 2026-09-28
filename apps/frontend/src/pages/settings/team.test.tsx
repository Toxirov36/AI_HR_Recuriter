import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Team } from './team';

afterEach(cleanup);

const mockTeamUsers = {
  data: [
    { id: 1, fullName: 'Dilshodbek Toxirov', email: 'admin@apex.uz', role: 'ADMIN' },
    { id: 2, fullName: 'Ali Valiyev', email: 'ali@apex.uz', role: 'HR' },
  ],
  error: '',
  reload: vi.fn(),
};

const mockTelegramStatus = {
  data: {
    connected: true,
    connection: {
      id: 'conn-1',
      telegramUserId: '123456789',
      telegramUsername: 'dilshodbek_hr',
      canReply: true,
      canReadMessages: true,
      enabled: true,
      createdAt: '2026-09-20T10:00:00Z',
    },
    botUsername: 'apex_recruiter_bot',
  },
  error: '',
  reload: vi.fn(),
};

const mockAuditLogs = {
  data: {
    items: [
      {
        id: 1,
        createdAt: '2026-09-20T10:00:00.000Z',
        actorName: 'Dilshodbek Toxirov',
        actorRole: 'ADMIN',
        action: 'CANDIDATE_ANONYMIZED',
        resourceType: 'CANDIDATE',
        resourceId: '42',
        details: null,
        ipAddress: '127.0.0.1',
      },
    ],
    total: 1,
  },
  error: '',
  reload: vi.fn(),
};

const mockOverview = {
  data: {
    company: { id: 1, name: 'Apex', retentionDays: 365, createdAt: '2026-09-20' },
    stats: { members: 2, activeMembers: 2, vacancies: 3, candidates: 8, applications: 6, invitations: 1 },
    stages: [{ status: 'HIRED', _count: 2 }],
    integrations: { emailConfigured: true, aiConfigured: false, telegramConnected: true, storageConfigured: false },
  }, error: '', reload: vi.fn(),
};

vi.mock('../../components/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useData: vi.fn((url: string) => {
      if (url.includes('/auth/team')) return mockTeamUsers;
      if (url.includes('/integrations/telegram')) return mockTelegramStatus;
      if (url.includes('/audit-logs')) return mockAuditLogs;
      if (url === '/company-admin') return mockOverview;
      return { data: null, error: '', reload: vi.fn() };
    }),
  };
});

vi.mock('../../features/auth', () => ({
  useAuth: () => ({
    user: { id: 1, fullName: 'Dilshodbek Toxirov', email: 'admin@apex.uz', role: 'ADMIN' },
  }),
}));

describe('Settings Hub (RBAC, MFA, Audit Logs, Retention, Telegram)', () => {
  it('loads company settings and integration configuration without exposing secrets', () => {
    render(<Team />);
    expect(screen.getByLabelText('Kompaniya nomi')).toHaveValue('Apex');
    expect(screen.getByLabelText('Saqlash muddati (kun)')).toHaveValue(365);
    expect(screen.getByText('SMTP sozlangan')).toBeInTheDocument();
  });
  it('filters members and keeps self-access controls unavailable', () => {
    render(<Team />);
    fireEvent.click(screen.getByRole('tab', { name: /Jamoa va Rollar/i }));
    expect(screen.queryByRole('button', { name: 'Dilshodbek Toxirov ruxsatlarini boshqarish' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Xodimlarni qidirish'), { target: { value: 'ali@apex.uz' } });
    expect(screen.getByText('Ali Valiyev')).toBeInTheDocument();
    expect(screen.queryByText('Dilshodbek Toxirov')).not.toBeInTheDocument();
  });
  it('renders all settings navigation tabs', () => {
    render(<Team />);
    expect(screen.getByText(/Jamoa va Rollar \(RBAC\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Xavfsizlik & MFA \(2FA\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Audit loglar & Export/i)).toBeInTheDocument();
    expect(screen.getByText(/Ma'lumotlar saqlanishi \(GDPR\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Telegram Business/i)).toBeInTheDocument();
  });

  it('displays team members and their RBAC role badges', () => {
    render(<Team />);
    fireEvent.click(screen.getByRole('tab', { name: /Jamoa va Rollar/i }));
    expect(screen.getByText('Dilshodbek Toxirov')).toBeInTheDocument();
    expect(screen.getByText('admin@apex.uz')).toBeInTheDocument();
    expect(screen.getByText('Ali Valiyev')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
    expect(screen.getByText('HR')).toBeInTheDocument();
  });

  it('switches to Audit loglar tab and renders export buttons', () => {
    render(<Team />);
    const auditTab = screen.getByRole('tab', { name: /Audit loglar & Export/i });
    fireEvent.pointerDown(auditTab, { button: 0 });
    fireEvent.click(auditTab);

    expect(screen.getByText('Export CSV')).toBeInTheDocument();
    expect(screen.getByText('Export JSON')).toBeInTheDocument();
    expect(screen.getByText('CANDIDATE_ANONYMIZED')).toBeInTheDocument();
  });

  it('switches to Xavfsizlik & MFA tab and renders 2FA setup trigger', () => {
    render(<Team />);
    const securityTab = screen.getByRole('tab', { name: /Xavfsizlik & MFA \(2FA\)/i });
    fireEvent.pointerDown(securityTab, { button: 0 });
    fireEvent.click(securityTab);

    expect(screen.getByText(/Ikki bosqichli autentifikatsiya \(2FA \/ TOTP\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2FA'ni sozlash va yoqish/i })).toBeInTheDocument();
  });

  it('switches to Telegram Business tab and displays connected bot status and permissions', () => {
    render(<Team />);
    const telegramTab = screen.getByRole('tab', { name: /Telegram Business/i });
    fireEvent.pointerDown(telegramTab, { button: 0 });
    fireEvent.click(telegramTab);

    expect(screen.getByText(/Telegram Business Integratsiyasi/i)).toBeInTheDocument();
    expect(screen.getByText(/Faol va Ulangan ✅/i)).toBeInTheDocument();
    expect(screen.getByText('@dilshodbek_hr')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ulanishni uzish/i })).toBeInTheDocument();
  });
});
