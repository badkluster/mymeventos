'use client';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/primitives';
import { visibleAdminModules } from '@/lib/admin-permissions';
import { useSession } from '@/components/session-provider';

export default function AdminPage() {
  const { user } = useSession();
  const modules = visibleAdminModules(user).filter((module) => module.href !== '/admin');
  return <section className="space-y-6">
    <PageHeader title="Panel" description="Accesos directos a los módulos implementados del backoffice." />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {modules.map(({ title, description, href, icon: Icon }) => <Link key={href} href={href} className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50" aria-label={`Ir a ${title}`}>
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-zinc-100 text-zinc-700 transition group-hover:bg-zinc-950 group-hover:text-white"><Icon className="h-5 w-5" /></span>
        <h2 className="mt-5 text-base font-semibold text-zinc-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-500">{description}</p>
      </Link>)}
    </div>
  </section>;
}
