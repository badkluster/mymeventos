'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChartNoAxesCombined, ChevronDown, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Settings, ShieldX, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { NotificationBell } from '@/components/admin/notification-bell';
import { brandAssets } from '@/lib/brand-assets';
import { api } from '@/lib/api';
import { moduleForPath, userCanAccess, visibleAdminModules } from '@/lib/admin-permissions';
import { Tooltip } from '@/components/ui/tooltip';
import { useSession } from './session-provider';
import { Permission } from '@mym/shared';

const sidebarPreferenceKey = 'mym.admin.sidebar-collapsed';
const sidebarPreferenceEvent = 'mym:sidebar-preference';
const compactSidebarMediaQuery = '(max-width: 1023px)';

function subscribeToSidebarPreference(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(compactSidebarMediaQuery);
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(sidebarPreferenceEvent, onStoreChange);
  mediaQuery.addEventListener('change', onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(sidebarPreferenceEvent, onStoreChange);
    mediaQuery.removeEventListener('change', onStoreChange);
  };
}

function getSidebarPreference() {
  const saved = window.localStorage.getItem(sidebarPreferenceKey);
  return saved === null ? window.matchMedia(compactSidebarMediaQuery).matches : saved === 'true';
}

function getServerSidebarPreference() {
  return false;
}

function userInitials(user: ReturnType<typeof useSession>['user']) {
  const source = [user?.firstName, user?.lastName].filter(Boolean);
  if (source.length) return source.map((part) => part?.[0]).join('').slice(0, 2).toUpperCase();
  return (user?.username?.slice(0, 2) || 'MM').toUpperCase();
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { resolvedTheme, setTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlOpen, setControlOpen] = useState(false);
  const [newQuoteRequests, setNewQuoteRequests] = useState(0);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const items = visibleAdminModules(user);
  const currentModule = moduleForPath(pathname);
  const blocked = Boolean(currentModule && !userCanAccess(user, currentModule.permissions));
  const isActive = (href: string) => href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  // Staff is a filtered view of Usuarios without restoring the redundant navigation entry.
  const configSubmenuPaths = new Set(['/admin/salons', '/admin/users', '/admin/attendance', '/admin/landing']);
  const configSubmenuOrder = new Map([['/admin/salons', 0], ['/admin/users', 1], ['/admin/attendance', 2], ['/admin/landing', 3]]);
  const hiddenNavigationPaths = new Set(['/admin/settings']);
  const configSubitems = items
    .filter((item) => configSubmenuPaths.has(item.href))
    .sort((a, b) => (configSubmenuOrder.get(a.href) ?? 99) - (configSubmenuOrder.get(b.href) ?? 99));
  const controlSubmenuPaths = new Set(['/admin/reports', '/admin/production', '/admin/analytics']);
  const controlSubmenuOrder = new Map([['/admin/reports', 0], ['/admin/production', 1], ['/admin/analytics', 2]]);
  const controlSubitems = items
    .filter((item) => controlSubmenuPaths.has(item.href))
    .sort((a, b) => (controlSubmenuOrder.get(a.href) ?? 99) - (controlSubmenuOrder.get(b.href) ?? 99));
  const mainItems = items.filter((item) => !hiddenNavigationPaths.has(item.href) && !configSubmenuPaths.has(item.href) && !controlSubmenuPaths.has(item.href));
  const configActive = [...configSubmenuPaths].some((href) => isActive(href));
  const controlActive = [...controlSubmenuPaths].some((href) => isActive(href));
  const showConfigSubmenu = settingsOpen || configActive;
  const showControlSubmenu = controlOpen || controlActive;
  const displayName = user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || 'Usuario';
  const canSeeQuotes = userCanAccess(user, [Permission.QUOTES_READ]);
  const sidebarCollapsed = useSyncExternalStore(subscribeToSidebarPreference, getSidebarPreference, getServerSidebarPreference);
  const controlMenu = controlSubitems.length ? <div className="pt-2">
    <Tooltip label="Reportes y análisis">
      <button type="button" aria-label="Reportes y análisis" aria-expanded={showControlSubmenu} onClick={() => setControlOpen((open) => !open)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium ${sidebarCollapsed ? 'justify-center' : ''} ${controlActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
      <ChartNoAxesCombined className="h-4 w-4" />
      {!sidebarCollapsed ? <span className="flex-1">Reportes y análisis</span> : null}
      {!sidebarCollapsed ? <ChevronDown className={`h-4 w-4 transition-transform ${showControlSubmenu ? 'rotate-180' : ''}`} /> : null}
      </button>
    </Tooltip>
    {showControlSubmenu ? <div className={`mt-1 space-y-1 ${sidebarCollapsed ? '' : 'border-l border-border/70 pl-3'}`}>
      {controlSubitems.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        const link = <Link key={href} href={href} aria-label={label} aria-current={active ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${sidebarCollapsed ? 'justify-center' : ''} ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
          <Icon className="h-4 w-4" />
          {!sidebarCollapsed ? label : null}
        </Link>;
        return sidebarCollapsed ? <Tooltip key={href} label={label}>{link}</Tooltip> : link;
      })}
    </div> : null}
  </div> : null;

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function toggleSidebar() {
    window.localStorage.setItem(sidebarPreferenceKey, String(!sidebarCollapsed));
    window.dispatchEvent(new Event(sidebarPreferenceEvent));
  }

  useEffect(() => {
    if (!canSeeQuotes) return;
    let mounted = true;
    const loadCount = () => api.get<{ meta?: { totalItems?: number } }>('/quote-requests?status=new&page=1&limit=1')
      .then((response) => { if (mounted) setNewQuoteRequests(Number(response.meta?.totalItems ?? 0)); })
      .catch(() => { if (mounted) setNewQuoteRequests(0); });
    void loadCount();
    const interval = window.setInterval(() => void loadCount(), 30000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [canSeeQuotes, pathname]);

  async function logoutAll() {
    await api.post('/auth/logout-all');
    await logout();
    router.push('/admin/login');
  }

  return (
    <div data-admin-shell className="min-h-screen bg-background text-foreground">
      <aside className={`fixed inset-y-0 flex flex-col overflow-hidden border-r bg-card transition-[width,padding] duration-200 ${sidebarCollapsed ? 'w-20 p-3' : 'w-64 p-5'}`}>
        <div className={`flex shrink-0 items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          <Link href="/admin" className="block" aria-label="Ir al panel de M&M Eventos">
            {sidebarCollapsed ? <Image src={brandAssets.icon64} alt="M&M Eventos" width={40} height={40} className="h-10 w-10 rounded-lg" priority /> : <Image src={brandAssets.logoDarkOnLight} alt="M&M Eventos" width={150} height={150} className="h-auto w-32 object-contain" priority />}
          </Link>
          {!sidebarCollapsed ? <button type="button" aria-label="Contraer menú lateral" onClick={toggleSidebar} className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"><PanelLeftClose className="h-4 w-4" /></button> : null}
        </div>
        <nav className={`min-h-0 flex-1 space-y-1 overflow-y-auto ${sidebarCollapsed ? 'mt-8' : 'mt-10 pr-1'}`} aria-label="Módulos del backoffice">
          {mainItems.map(({ href, label, icon: Icon }) => <div key={href}>
            {sidebarCollapsed ? <Tooltip label={label}><Link href={href} aria-label={label} aria-current={isActive(href) ? 'page' : undefined} className={`flex items-center justify-center rounded-lg px-3 py-2 text-sm ${isActive(href) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><Icon className="h-4 w-4" /></Link></Tooltip> : <Link href={href} aria-current={isActive(href) ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive(href) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              <Icon className="h-4 w-4" />
              <span className="flex-1">{label}</span>
              {href === '/admin/quotes' && canSeeQuotes && newQuoteRequests > 0 ? <span title={`${newQuoteRequests} solicitudes nuevas`} aria-label={`${newQuoteRequests} solicitudes nuevas`} className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold ${isActive(href) ? 'bg-white text-zinc-950' : 'bg-red-500 text-white'}`}>{newQuoteRequests > 99 ? '99+' : newQuoteRequests}</span> : null}
            </Link>}
            {href === '/admin/expenses' ? controlMenu : null}
          </div>)}
          {!mainItems.some((item) => item.href === '/admin/expenses') ? controlMenu : null}
          {configSubitems.length ? <div className="pt-2">
            <Tooltip label="Configuración y herramientas">
              <button type="button" aria-label="Configuración y herramientas" aria-expanded={showConfigSubmenu} onClick={() => setSettingsOpen((open) => !open)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium ${sidebarCollapsed ? 'justify-center' : ''} ${configActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <Settings className="h-4 w-4" />
              {!sidebarCollapsed ? <span className="flex-1">Configuración y herramientas</span> : null}
              {!sidebarCollapsed ? <ChevronDown className={`h-4 w-4 transition-transform ${showConfigSubmenu ? 'rotate-180' : ''}`} /> : null}
              </button>
            </Tooltip>
            {showConfigSubmenu ? <div className={`mt-1 space-y-1 ${sidebarCollapsed ? '' : 'border-l border-border/70 pl-3'}`}>
              {configSubitems.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                const link = <Link key={href} href={href} aria-label={label} aria-current={active ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${sidebarCollapsed ? 'justify-center' : ''} ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                  <Icon className="h-4 w-4" />
                  {!sidebarCollapsed ? label : null}
                </Link>;
                return sidebarCollapsed ? <Tooltip key={href} label={label}>{link}</Tooltip> : link;
              })}
            </div> : null}
          </div> : null}
        </nav>
        {sidebarCollapsed ? <Tooltip label="Expandir menú lateral"><button type="button" aria-label="Expandir menú lateral" onClick={toggleSidebar} className="mt-3 flex w-full justify-center rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"><PanelLeftOpen className="h-4 w-4" /></button></Tooltip> : null}
      </aside>
      <main className={`transition-[margin] duration-200 ${sidebarCollapsed ? 'ml-20' : 'ml-64'}`}>
        <header className="flex h-16 items-center justify-between border-b px-8">
          <p className="text-sm text-muted-foreground">Administración</p>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <button aria-label="Cambiar tema" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')} className="rounded p-2 hover:bg-muted">
              {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div ref={userMenuRef} className="relative">
              <button type="button" aria-haspopup="menu" aria-expanded={userMenuOpen} onClick={() => setUserMenuOpen((open) => !open)} className="flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-1.5 text-left text-sm transition hover:bg-muted">
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-zinc-950 text-xs font-semibold text-white">
                  {user?.avatarUrl ? <span aria-label={displayName} role="img" className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${user.avatarUrl})` }} /> : userInitials(user)}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block max-w-40 truncate font-medium text-foreground">{displayName}</span>
                  <span className="block max-w-40 truncate text-xs text-muted-foreground">{user?.email || user?.username}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              {userMenuOpen ? <div role="menu" className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                <div className="border-b border-border px-4 py-3">
                  <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email || user?.username}</p>
                </div>
                <Link href="/admin/profile" role="menuitem" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm transition hover:bg-muted"><Settings className="h-4 w-4" />Editar perfil</Link>
                <button type="button" role="menuitem" onClick={() => void logoutAll()} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-muted"><ShieldX className="h-4 w-4" />Cerrar todas las sesiones</button>
                <button type="button" role="menuitem" onClick={() => void logout().then(() => router.push('/admin/login'))} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-red-600 transition hover:bg-red-50"><LogOut className="h-4 w-4" />Cerrar sesión</button>
              </div> : null}
            </div>
          </div>
        </header>
        <div className="p-8">
          {blocked ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
              <h1 className="text-xl font-semibold text-zinc-950">Sin acceso</h1>
              <p className="mt-2 text-sm text-zinc-500">No tenés permisos para ver esta sección. Pedile a un administrador que revise tus permisos.</p>
            </section>
          ) : children}
        </div>
      </main>
    </div>
  );
}
