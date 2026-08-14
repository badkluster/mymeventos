'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function LegalFooter() {
  const pathname = usePathname();
  const visible = pathname === '/' || pathname === '/privacidad' || pathname === '/terminos';
  if (!visible) return null;

  return (
    <footer className="border-t border-white/10 bg-[#050505] px-5 py-5 text-zinc-500 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 text-xs sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} M&M Eventos</span>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Información legal y soporte">
          <Link href="/privacidad" className="transition hover:text-white">Privacidad</Link>
          <Link href="/terminos" className="transition hover:text-white">Términos y condiciones</Link>
          <Link href="/privacidad#soporte" className="transition hover:text-white">Soporte</Link>
          <Link href="/privacidad#eliminar-cuenta" className="transition hover:text-white">Eliminar cuenta</Link>
        </nav>
      </div>
    </footer>
  );
}
