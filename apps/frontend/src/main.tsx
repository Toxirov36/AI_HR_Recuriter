import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, NavLink, useLocation } from 'react-router-dom';
import {
  BriefcaseBusiness,
  ChevronRight,
  CircleHelp,
  GitBranch,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreVertical,
  Bell,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { send } from './lib/api';
import { prefetchData } from './lib/query-client';
import { AppProviders } from './app/providers';
import { AppRouter, preloadRoute } from './app/router';
import { useAuth } from './features/auth';
import { NotificationCenter } from './components/notification-center';
import {
  Alert,
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
      <div className="company-switch">
        <span className="company-icon">{companyInitials}</span>
        <div className="company-switch-info">
          <strong>{companyName}</strong>
          <small>Recruiting workspace</small>
        </div>
        <ChevronRight size={15} className="company-chevron" />
      </div>
      <div className="nav-label">WORKSPACE</div>
      <nav>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            onPointerEnter={() => void preloadRoute(l.to)}
            onFocus={() => void preloadRoute(l.to)}
            onClick={() => onNavigate?.()}
          >
            <l.icon size={19} />
            {l.title}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom mt-auto">
        <div className="sidebar-note">
          <ShieldCheck size={20} className="shield-icon" />
          <strong>Human by design.</strong>
          <p>AI structures the evidence. Your team makes every hiring decision.</p>
        </div>
      </div>
    </div>
  );
}

function AppShell() {
  const { user, refresh } = useAuth();
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const location = useLocation();

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
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const links = [
    { to: '/', title: 'Overview', icon: LayoutDashboard },
    { to: '/vacancies', title: 'Vacancies', icon: BriefcaseBusiness },
    { to: '/candidates', title: 'Candidates', icon: Users },
    { to: '/pipeline', title: 'Hiring pipeline', icon: GitBranch },
    ...(user.role === 'ADMIN' ? [{ to: '/admin', title: 'Admin panel', icon: Settings2 }] : []),
    ...(user.platformRole === 'SUPER_ADMIN' ? [{ to: '/platform-admin', title: 'Platforma admini', icon: Layers3 }] : []),
  ];

  const current =
    links.find((l) => l.to !== '/' && location.pathname.startsWith(l.to))?.title ||
    (location.pathname.startsWith('/applications') ? 'Application review' : 'Overview');

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
    { to: '/vacancies?new=1', title: 'Create vacancy', icon: Plus },
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
                <button className="mobile-only icon-button" aria-label="Open navigation">
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
                <SidebarNav
                  links={links}
                  user={user}
                  logout={logout}
                  onNavigate={() => setMenu(false)}
                />
              </SheetContent>
            </Sheet>
            <div className="topbar-breadcrumbs">
              <span className="breadcrumb-root">Workspace</span>
              <span className="breadcrumb-divider">/</span>
              <strong className="breadcrumb-page">{current}</strong>
            </div>
          </div>
          <button type="button" className="topbar-search-pill" onClick={() => setSearchOpen(true)}>
            <Search size={15} className="search-pill-icon" />
            <span className="search-pill-placeholder">Search candidates, vacancies...</span>
            <kbd className="search-pill-kbd">⌘K</kbd>
          </button>
          <div className="topbar-actions">
            <NotificationCenter />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="topbar-avatar cursor-pointer outline-none hover:ring-2 hover:ring-[#1a5d4c]/20 transition-all"
                  title={user.fullName}
                  aria-label="User profile menu"
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
                      <p className="text-xs text-slate-500 leading-none mt-1">
                        {user.email || user.phone || user.role}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {user.role === 'ADMIN' && (
                    <DropdownMenuItem asChild>
                      <NavLink to="/admin" className="cursor-pointer flex items-center">
                        <Users className="mr-2.5 h-4 w-4 text-slate-500" />
                        <span>Admin panel</span>
                      </NavLink>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noreferrer"
                      className="cursor-pointer flex items-center"
                    >
                      <CircleHelp className="mr-2.5 h-4 w-4 text-slate-500" />
                      <span>Gemini API key</span>
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer flex items-center"
                  onClick={() => logout()}
                >
                  <LogOut className="mr-2.5 h-4 w-4 text-red-500" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="main-content">
          <Alert message={error} />
          <AppRouter />
          <footer className="page-footer">
            <span>Shortlist · A little more human.</span>
            <span>Evidence-led recruiting</span>
          </footer>
        </main>
      </div>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="workspace-search-dialog sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Search workspace</DialogTitle>
          </DialogHeader>
          <div className="workspace-search-input">
            <Search size={17} />
            <Input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search pages and actions…"
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProviders>
        <AppShell />
      </AppProviders>
    </BrowserRouter>
  </React.StrictMode>,
);
