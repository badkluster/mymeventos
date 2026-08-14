import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { brandAssets } from '@/lib/brand-assets';

type LegalPageShellProps = {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
};

export function LegalPageShell({ eyebrow, title, intro, children }: LegalPageShellProps) {
  return (
    <main className="min-h-screen bg-[#070707] text-white">
      <header className="border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-4 px-5 py-4 md:px-8">
          <Link href="/" className="inline-flex items-center gap-3" aria-label="Volver a M&M Eventos">
            <Image src={brandAssets.logoLightOnDark} alt="M&M Eventos" width={150} height={64} className="h-12 w-auto object-contain" priority />
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:bg-white/[0.06] hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Volver al sitio
          </Link>
        </div>
      </header>

      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(219,225,232,.12),transparent_40%)] px-5 py-14 md:px-8 md:py-20">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#dbe1e8]">{eyebrow}</p>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.03em] text-white md:text-6xl">{title}</h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-zinc-300 md:text-lg">{intro}</p>
          <p className="mt-5 text-sm text-zinc-500">Última actualización: 13 de agosto de 2026.</p>
        </div>
      </section>

      <div className="mx-auto grid max-w-4xl gap-10 px-5 py-12 md:px-8 md:py-16">
        {children}
      </div>
    </main>
  );
}

export function LegalSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.025] p-6 md:p-8">
      <h2 className="text-2xl font-semibold text-white">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-zinc-300">{children}</div>
    </section>
  );
}
