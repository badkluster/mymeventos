'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Moon, Settings, ShieldX, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { NotificationBell } from '@/components/admin/notification-bell';
import { brandAssets } from '@/lib/brand-assets';
import { api } from '@/lib/api';
import { moduleForPath, userCanAccess, visibleAdminModules } from '@/lib/admin-permissions';
import { useSession } from './session-provider';

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
  const userMenuRef = useRef<HTMLDivElement>(null);
  const items = visibleAdminModules(user);
  const currentModule = moduleForPath(pathname);
  const blocked = Boolean(currentModule && !userCanAccess(user, currentModule.permissions));
  const isActive = (href: string) => href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const displayName = user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || 'Usuario';

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  async function logoutAll() {
    await api.post('/auth/logout-all');
    await logout();
    router.push('/admin/login');
  }

  return (
    <div data-admin-shell className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 w-64 border-r bg-card p-5">
        <Link href="/admin" className="block" aria-label="Ir al panel de M&M Eventos">
          <Image src={brandAssets.logoDarkOnLight} alt="M&M Eventos" width={150} height={150} className="h-auto w-32 object-contain" priority />
        </Link>
        <nav className="mt-10 space-y-1" aria-label="Módulos del backoffice">
          {items.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive(href) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
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
