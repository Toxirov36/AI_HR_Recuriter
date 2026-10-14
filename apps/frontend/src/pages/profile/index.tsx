import React, { useState, type FormEvent } from 'react';
import {
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Save,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../features/auth';
import { send } from '../../lib/api';
import { Alert, Badge, Button, Input } from '../../components/ui';

export function Profile() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();

  // Profile info state
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [companyName, setCompanyName] = useState(user?.company?.name || '');
  const [busyProfile, setBusyProfile] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Password update state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busyPassword, setBusyPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const isAdmin = user?.role === 'ADMIN';

  const userInitials = (user?.fullName || fullName || 'User')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  async function handleSaveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusyProfile(true);
    setProfileError('');

    try {
      await send(
        '/auth/profile',
        {
          fullName: fullName.trim(),
          ...(isAdmin ? { companyName: companyName.trim() } : {}),
        },
        'PUT',
      );
      await refresh();
      toast.success(t('profile.infoSaved'));
    } catch (err) {
      setProfileError((err as Error).message);
    } finally {
      setBusyProfile(false);
    }
  }

  async function handleSavePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordError('');

    if (newPassword.length < 8) {
      setPasswordError(t('profile.passwordTooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(t('profile.passwordMismatch'));
      return;
    }

    setBusyPassword(true);

    try {
      await send(
        '/auth/password',
        {
          password: newPassword,
        },
        'PUT',
      );
      setNewPassword('');
      setConfirmPassword('');
      toast.success(t('profile.passwordSaved'));
    } catch (err) {
      setPasswordError((err as Error).message);
    } finally {
      setBusyPassword(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('profile.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('profile.description')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-[#1a5d4c]/10 text-[#1a5d4c] font-medium border-0 px-3 py-1">
            {user?.role || 'HR'}
          </Badge>
          {user?.platformRole === 'SUPER_ADMIN' && (
            <Badge className="bg-purple-100 text-purple-700 font-medium border-0 px-3 py-1">
              {t('navigation.platformAdmin')}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Personal and Organization */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-4 pb-5 border-b border-slate-100">
              <div className="h-14 w-14 rounded-full bg-emerald-100/80 text-emerald-800 font-bold text-lg flex items-center justify-center shrink-0 border border-emerald-200/60 shadow-inner">
                {userInitials}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <UserIcon size={18} className="text-[#1a5d4c]" />
                  {t('profile.personalAndCompany')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{t('profile.personalAndCompanyDesc')}</p>
              </div>
            </div>

            {profileError && (
              <div className="mt-4">
                <Alert message={profileError} />
              </div>
            )}

            <form id="profile-form" onSubmit={handleSaveProfile} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  {t('profile.fullName')} *
                </label>
                <Input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('profile.fullNamePlaceholder')}
                  className="w-full"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t('profile.email')}
                  </label>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <LockKeyhole size={11} /> {t('profile.emailFixed')}
                  </span>
                </div>
                <Input
                  disabled
                  value={user?.email || ''}
                  className="w-full bg-slate-50 text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  {t('profile.companyName')} {isAdmin ? '*' : ''}
                </label>
                <div className="relative">
                  <Input
                    required={isAdmin}
                    disabled={!isAdmin}
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Company name"
                    className={`w-full ${!isAdmin ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                  />
                  {!isAdmin && (
                    <LockKeyhole
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  )}
                </div>
                <p
                  className={`text-xs mt-1.5 flex items-center gap-1.5 ${
                    isAdmin ? 'text-emerald-700 font-medium' : 'text-slate-500'
                  }`}
                >
                  {isAdmin ? (
                    <>
                      <ShieldCheck size={14} className="text-emerald-600" />
                      {t('profile.companyAdminNote')}
                    </>
                  ) : (
                    t('profile.companyNonAdminNote')
                  )}
                </p>
              </div>
            </form>
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end">
            <Button
              form="profile-form"
              type="submit"
              disabled={busyProfile}
              className="bg-[#1a5d4c] hover:bg-[#14493b] text-white font-medium px-5 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-all"
            >
              <Save size={16} />
              {busyProfile ? t('common.saving') : t('profile.saveProfile')}
            </Button>
          </div>
        </div>

        {/* Card 2: Security & Password */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3.5 pb-5 border-b border-slate-100">
              <div className="p-2.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/60 shrink-0">
                <KeyRound size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <LockKeyhole size={18} className="text-amber-600" />
                  {t('profile.securityAndPassword')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{t('profile.passwordDescription')}</p>
              </div>
            </div>

            {passwordError && (
              <div className="mt-4">
                <Alert message={passwordError} />
              </div>
            )}

            <form id="password-form" onSubmit={handleSavePassword} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  {t('profile.newPassword')} *
                </label>
                <div className="relative">
                  <Input
                    required
                    type={showPassword ? 'text' : 'password'}
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('profile.passwordPlaceholder')}
                    className="w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  {t('profile.confirmPassword')} *
                </label>
                <div className="relative">
                  <Input
                    required
                    type={showConfirm ? 'text' : 'password'}
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('profile.passwordPlaceholder')}
                    className="w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label="Toggle confirm password visibility"
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100 text-xs text-slate-500 space-y-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2
                    size={14}
                    className={newPassword.length >= 8 ? 'text-emerald-600' : 'text-slate-300'}
                  />
                  <span>{t('profile.passwordTooShort')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2
                    size={14}
                    className={
                      newPassword && newPassword === confirmPassword
                        ? 'text-emerald-600'
                        : 'text-slate-300'
                    }
                  />
                  <span>{t('profile.confirmPassword')}</span>
                </div>
              </div>
            </form>
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end">
            <Button
              form="password-form"
              type="submit"
              disabled={busyPassword || !newPassword || !confirmPassword}
              className="bg-amber-600 hover:bg-amber-700 text-white font-medium px-5 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-all"
            >
              <KeyRound size={16} />
              {busyPassword ? t('common.saving') : t('profile.savePassword')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
