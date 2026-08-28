'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, LayoutDashboard, Megaphone, FileStack, Users2, History, Settings } from 'lucide-react';

const tabs = [
  { href: '/admin/marketing', label: 'Resumen', icon: LayoutDashboard },
  { href: '/admin/marketing/performance', label: 'Performance 360', icon: BarChart3 },
  { href: '/admin/marketing/campaigns', label: 'Campañas', icon: Megaphone },
  { href: '/admin/marketing/templates', label: 'Plantillas', icon: FileStack },
  { href: '/admin/marketing/audiences', label: 'Audiencias', icon: Users2 },
  { href: '/admin/marketing/history', label: 'Historial de envíos', icon: History },
  { href: '/admin/marketing/settings', label: 'Configuración', icon: Settings }
];

export function MarketingTabs() {
  const pathname = usePathname() ?? '';
  return (
    <nav className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm" aria-label="Marketing">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = href === '/admin/marketing' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${active ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950'}`}>
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
