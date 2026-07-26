'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChartNoAxesCombined, ChevronDown, LogOut, Moon, Settings, ShieldX, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { NotificationBell } from '@/components/admin/notification-bell';
import { brandAssets } from '@/lib/brand-assets';
import { api } from '@/lib/api';
import { moduleForPath, userCanAccess, visibleAdminModules } from '@/lib/admin-permissions';
import { useSession } from './session-provider';
import { Permission } from '@mym/shared';

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
  const configSubmenuPaths = new Set(['/admin/salons', '/admin/users', '/admin/staff', '/admin/attendance', '/admin/landing']);
  const configSubmenuOrder = new Map([['/admin/salons', 0], ['/admin/users', 1], ['/admin/staff', 2], ['/admin/attendance', 3], ['/admin/landing', 4]]);
  const hiddenNavigationPaths = new Set(['/admin/settings']);
  const configSubitems = items
    .filter((item) => configSubmenuPaths.has(item.href))
    .sort((a, b) => (configSubmenuOrder.get(a.href) ?? 99) - (configSubmenuOrder.get(b.href) ?? 99));
  const controlSubmenuPaths = new Set(['/admin/reports', '/admin/production', '/admin/expenses', '/admin/analytics', '/admin/imports', '/admin/suppliers']);
  const controlSubmenuOrder = new Map([['/admin/reports', 0], ['/admin/production', 1], ['/admin/expenses', 2], ['/admin/analytics', 3], ['/admin/imports', 4], ['/admin/suppliers', 5]]);
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
  const controlMenu = controlSubitems.length ? <div className="pt-2">
    <button type="button" aria-expanded={showControlSubmenu} onClick={() => setControlOpen((open) => !open)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium ${controlActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
      <ChartNoAxesCombined className="h-4 w-4" />
      <span className="flex-1">Administración y control</span>
      <ChevronDown className={`h-4 w-4 transition-transform ${showControlSubmenu ? 'rotate-180' : ''}`} />
    </button>
    {showControlSubmenu ? <div className="mt-1 space-y-1 border-l border-border/70 pl-3">
      {controlSubitems.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
          <Icon className="h-4 w-4" />
          {label}
        </Link>;
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
      <aside className="fixed inset-y-0 flex w-64 flex-col overflow-hidden border-r bg-card p-5">
        <Link href="/admin" className="block shrink-0" aria-label="Ir al panel de M&M Eventos">
          <Image src={brandAssets.logoDarkOnLight} alt="M&M Eventos" width={150} height={150} className="h-auto w-32 object-contain" priority />
        </Link>
        <nav className="mt-10 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-label="Módulos del backoffice">
          {mainItems.map(({ href, label, icon: Icon }) => <div key={href}>
            <Link href={href} aria-current={isActive(href) ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive(href) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              <Icon className="h-4 w-4" />
              <span className="flex-1">{label}</span>
              {href === '/admin/quotes' && canSeeQuotes && newQuoteRequests > 0 ? <span title={`${newQuoteRequests} solicitudes nuevas`} aria-label={`${newQuoteRequests} solicitudes nuevas`} className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold ${isActive(href) ? 'bg-white text-zinc-950' : 'bg-red-500 text-white'}`}>{newQuoteRequests > 99 ? '99+' : newQuoteRequests}</span> : null}
            </Link>
            {href === '/admin/payments' ? controlMenu : null}
          </div>)}
          {!mainItems.some((item) => item.href === '/admin/payments') ? controlMenu : null}
          {configSubitems.length ? <div className="pt-2">
            <button type="button" aria-expanded={showConfigSubmenu} onClick={() => setSettingsOpen((open) => !open)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium ${configActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <Settings className="h-4 w-4" />
              <span className="flex-1">Configuración</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showConfigSubmenu ? 'rotate-180' : ''}`} />
            </button>
            {showConfigSubmenu ? <div className="mt-1 space-y-1 border-l border-border/70 pl-3">
              {configSubitems.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>;
              })}
            </div> : null}
          </div> : null}
        </nav>
      </aside>
      <main className="ml-64">
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
