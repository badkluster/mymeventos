'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Permission } from '@mym/shared';
import { useSession } from '@/components/session-provider';
import { userCanAccess } from '@/lib/admin-permissions';
export function AnalyticsNav() {
  const pathname = usePathname() ?? ''; const { user } = useSession();
  const items = [
    { href: '/admin/analytics', label: 'Resumen', permission: Permission.ANALYTICS_VIEW, exact: true },
    { href: '/admin/analytics/heatmap', label: 'Mapas de calor', permission: Permission.ANALYTICS_HEATMAP_VIEW },
    { href: '/admin/analytics/settings', label: 'Privacidad y retención', permission: Permission.ANALYTICS_SETTINGS_MANAGE },
  ].filter((item) => userCanAccess(user, [item.permission]));
  return <nav className="flex flex-wrap gap-1 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm">{items.map((item) => {
    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
    return <Link key={item.href} href={item.href} className={`rounded-xl px-4 py-2 text-sm font-medium ${active ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>{item.label}</Link>;
  })}</nav>;
}
