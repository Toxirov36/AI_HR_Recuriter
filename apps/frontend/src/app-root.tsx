import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BriefcaseBusiness,
  ChevronRight,
  GitBranch,
  Layers3,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MoreVertical,
  Bell,
  Plus,
  Search,
  Settings2,
  Users,
  User as UserIcon,
} from 'lucide-react';
import { send } from './lib/api';
import { prefetchData } from './lib/query-client';
import { AppProviders } from './app/providers';
import { AppRouter, preloadRoute } from './app/router';
import { useAuth } from './features/auth';
import { NotificationCenter } from './components/notification-center';
import { LanguageSwitcher } from './components/language-switcher';
import { ThemeToggle } from './components/ui/theme-toggle';
import { ErrorBoundary } from './components/error-boundary';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from './components/ui';
import './styles.css';
import './styles.dark.css';
import './theme.css';

// Support contact shown in the profile menu; VITE_SUPPORT_TELEGRAM_URL overrides the default at build time.
const SUPPORT_URL =
  (import.meta.env.VITE_SUPPORT_TELEGRAM_URL as string | undefined)?.trim() || 'https://t.me/Toxirov1505';

function SidebarNav({
  links,
  onNavigate,
  user,
  logout,
}: {
  links: { to: string; title: string; icon: React.ComponentType<{ size: number }> }[];
  onNavigate?: () => void;
  user: any;
  logout: () => void;
}) {
  const { t } = useTranslation();
  const companyName = user?.company?.name || 'Northstar Studio';
  const companyInitials =
    companyName
      .split(' ')
      .map((w: string) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'NS';

  return (
    <div className="flex flex-col h-full">
      <Link
        to="/profile"
        className="company-switch"
        aria-label={`${t('navigation.myProfile')}: ${companyName}`}
        onPointerEnter={() => void preloadRoute('/profile')}
        onFocus={() => void preloadRoute('/profile')}
        onClick={() => onNavigate?.()}
      >
        <span className="company-icon">{companyInitials}</span>
        <div className="company-switch-info">
          <strong>{companyName}</strong>
        </div>
        <ChevronRight size={15} className="company-chevron" aria-hidden="true" />
      </Link>
      <div className="nav-label">{t('navigation.workspace').toUpperCase()}</div>
      <nav>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/dashboard'}
            title={l.title}
            onPointerEnter={() => void preloadRoute(l.to)}
            onFocus={() => void preloadRoute(l.to)}
            onClick={() => onNavigate?.()}
          >
            <l.icon size={19} />
            {l.title}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function AppShell() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const location = useLocation();

  useEffect(() => {
    document.title = `${t('navigation.recruitingWorkspace')} · Shortlist`;
  }, [t]);

  useEffect(() => setMenu(false), [location.pathname]);

  useEffect(() => {
    const paths = [
      '/dashboard',
      '/vacancies?page=1&search=',
      '/candidates?page=1&search=',
      '/applications?page=1&search=',
      ...(user.role === 'ADMIN' ? ['/auth/team'] : []),
    ];
    const preload = () => {
      for (const path of paths) void prefetchData(path).catch(() => undefined);
    };
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(preload, { timeout: 800 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(preload, 50);
    return () => window.clearTimeout(id);
  }, [user.role]);

  async function logout() {
    try {
      await send('/auth/logout', {});
      await refresh();
      navigate('/', { replace: true });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const links = [
    { to: '/dashboard', title: t('navigation.overview'), icon: LayoutDashboard },
    { to: '/vacancies', title: t('navigation.vacancies'), icon: BriefcaseBusiness },
    { to: '/candidates', title: t('navigation.candidates'), icon: Users },
    { to: '/pipeline', title: t('navigation.hiringPipeline'), icon: GitBranch },
    ...(user.role === 'ADMIN'
      ? [{ to: '/admin', title: t('navigation.adminPanel'), icon: Settings2 }]
      : []),
    ...(user.platformRole === 'SUPER_ADMIN'
      ? [{ to: '/platform-admin', title: t('navigation.platformAdmin'), icon: Layers3 }]
      : []),
  ];

  const current =
    links.find((l) => l.to !== '/dashboard' && location.pathname.startsWith(l.to))?.title ||
    (location.pathname.startsWith('/applications')
      ? t('navigation.applicationReview')
      : location.pathname.startsWith('/profile')
        ? t('navigation.myProfile')
        : t('navigation.overview'));

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const userInitials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'AK';

  const searchLinks = [
    ...links,
    { to: '/vacancies?new=1', title: t('navigation.createVacancy'), icon: Plus },
  ].filter((item) => item.title.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          shortlist<span className="brand-dot">.</span>
        </div>
        <SidebarNav links={links} user={user} logout={logout} />
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-breadcrumb-wrap">
            <Sheet open={menu} onOpenChange={setMenu}>
              <SheetTrigger asChild>
                <button
                  className="mobile-only icon-button"
                  aria-label={t('navigation.openNavigation')}
                >
                  <Menu size={20} />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="mobile-sidebar w-[280px] p-6 flex flex-col overflow-y-auto"
              >
                <SheetHeader className="text-left mb-2">
                  <SheetTitle className="brand text-left">
                    <span className="brand-mark">
                      <Layers3 size={23} />
                    </span>
                    shortlist<span className="brand-dot">.</span>
                  </SheetTitle>
                </SheetHeader>
                <div className="mb-4">
                  <LanguageSwitcher variant="full" />
                </div>
                <SidebarNav
                  links={links}
                  user={user}
                  logout={logout}
                  onNavigate={() => setMenu(false)}
                />
              </SheetContent>
            </Sheet>
            <div className="topbar-breadcrumbs">
              <span className="breadcrumb-root">{t('navigation.workspace')}</span>
              <span className="breadcrumb-divider">/</span>
              <strong className="breadcrumb-page">{current}</strong>
            </div>
          </div>
          <button type="button" className="topbar-search-pill" onClick={() => setSearchOpen(true)}>
            <Search size={15} className="search-pill-icon" />
            <span className="search-pill-placeholder">{t('navigation.searchPlaceholder')}</span>
            <kbd className="search-pill-kbd">⌘K</kbd>
          </button>
          <div className="topbar-actions">
            <ThemeToggle />
            <LanguageSwitcher />
            <NotificationCenter />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="topbar-avatar cursor-pointer outline-none hover:ring-2 hover:ring-[color:var(--focus-brand-ring-soft)] focus-visible:ring-2 focus-visible:ring-[color:var(--focus-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ground)] transition-all"
                  title={user.fullName}
                  aria-label={t('navigation.userProfileMenu')}
                >
                  <span>{userInitials || 'DT'}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56" sideOffset={8}>
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal px-2.5 py-2">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-semibold text-slate-900 leading-none">
                        {user.fullName}
                      </p>
                      <p className="text-xs text-slate-600 leading-none mt-1 truncate">
                        {user.email || user.phone}
                      </p>
                      <span className="mt-1.5 inline-flex w-fit rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        {t(`settings.role${user.role.charAt(0)}${user.role.slice(1).toLowerCase()}`, user.role)}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <NavLink to="/profile" className="cursor-pointer flex items-center">
                      <UserIcon className="mr-2.5 h-4 w-4 text-slate-500" />
                      <span>{t('navigation.myProfile')}</span>
                    </NavLink>
                  </DropdownMenuItem>
                  {user.role === 'ADMIN' && (
                    <DropdownMenuItem asChild>
                      <NavLink to="/admin" className="cursor-pointer flex items-center">
                        <Users className="mr-2.5 h-4 w-4 text-slate-500" />
                        <span>{t('navigation.adminPanel')}</span>
                      </NavLink>
                    </DropdownMenuItem>
                  )}
                  {SUPPORT_URL && (
                    <DropdownMenuItem asChild>
                      <a
                        href={SUPPORT_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-pointer flex items-center"
                      >
                        <LifeBuoy className="mr-2.5 h-4 w-4 text-slate-500" />
                        <span>{t('navigation.support')}</span>
                      </a>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="bg-transparent text-red-600 hover:bg-red-50 focus:text-red-600 focus:bg-red-50 cursor-pointer flex items-center"
                  onSelect={() => setConfirmLogout(true)}
                >
                  <LogOut className="mr-2.5 h-4 w-4 text-red-500" />
                  <span>{t('navigation.signOut')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="main-content">
          <Alert message={error} />
          <div key={location.pathname} className="page-transition">
            <ErrorBoundary resetKey={location.pathname}>
              <AppRouter />
            </ErrorBoundary>
          </div>
          <footer className="page-footer">
            <span>{t('navigation.brandTagline')}</span>
            <span>{t('navigation.evidenceLedRecruiting')}</span>
          </footer>
        </main>
        <nav className="bottom-nav" aria-label={t('navigation.workspace')}>
          {(links.length > 5 ? links.slice(0, 4) : links).map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/dashboard'}
              onPointerEnter={() => void preloadRoute(l.to)}
              onFocus={() => void preloadRoute(l.to)}
            >
              <l.icon size={21} />
              <span>{l.title}</span>
            </NavLink>
          ))}
          {links.length > 5 && (
            <button type="button" onClick={() => setMenu(true)} aria-label={t('navigation.openNavigation')}>
              <Menu size={21} />
              <span>{t('navigation.more')}</span>
            </button>
          )}
        </nav>
      </div>
      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('navigation.signOutTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('navigation.signOutConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('navigation.signOutCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void logout()}>
              {t('navigation.signOutAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="workspace-search-dialog sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t('navigation.searchWorkspace')}</DialogTitle>
          </DialogHeader>
          <div className="workspace-search-input">
            <Search size={17} />
            <Input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('navigation.searchPagesAndActions')}
            />
          </div>
          <div className="workspace-search-results">
            {searchLinks.map((item) => (
              <Link
                key={`${item.to}-${item.title}`}
                to={item.to}
                onPointerEnter={() => void preloadRoute(item.to)}
                onFocus={() => void preloadRoute(item.to)}
                onClick={() => {
                  setSearchOpen(false);
                  setSearch('');
                }}
              >
                <span>
                  <item.icon size={17} />
                </span>
                <strong>{item.title}</strong>
                <ChevronRight size={15} />
              </Link>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The signed-in application and the public app pages. Loaded lazily, so the landing page does not pay for it. */
export default function AppRoot() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}
