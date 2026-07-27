'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { UserRoundCog, Users } from 'lucide-react';

const tabs = [
  { href: '/admin/users', label: 'Usuarios', icon: Users },
  { href: '/admin/users?view=staff', label: 'Staff operativo', icon: UserRoundCog }
];

export function UsersStaffTabs() {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  return <nav className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm" aria-label="Usuarios y staff">
    {tabs.map(({ href, label, icon: Icon }) => {
      const isStaffView = href.includes('view=staff');
      const active = pathname === '/admin/users' && (isStaffView ? searchParams?.get('view') === 'staff' : searchParams?.get('view') !== 'staff');
      return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${active ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950'}`}>
        <Icon className="h-4 w-4" />
        {label}
      </Link>;
    })}
  </nav>;
}
