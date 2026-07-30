'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { SessionProvider, useSession } from '@/components/session-provider';
import { ToastProvider } from '@/components/ui/toast-provider';

function Protected({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !isAuthenticated) router.replace('/admin/login');
  }, [loading, isAuthenticated, router]);
  if (loading || !isAuthenticated) return <main className="grid min-h-screen place-items-center">Cargando sesión…</main>;
  return <AdminShell>{children}</AdminShell>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const loginPage = pathname === '/admin/login';
  return <SessionProvider checkSession={!loginPage}>
    <ToastProvider>{loginPage ? children : <Protected>{children}</Protected>}</ToastProvider>
  </SessionProvider>;
}
