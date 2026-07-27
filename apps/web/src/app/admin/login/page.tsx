'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CalendarDays, Home, LockKeyhole, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { login } from '@/lib/auth';
import { brandAssets } from '@/lib/brand-assets';

const heroImage = 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1800&q=85';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const username = String(values.get('username') ?? '');
    const password = String(values.get('password') ?? '');
    if (!username || !password) {
      setError('Completá usuario o email y contraseña.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(username, password);
      router.replace('/admin/dashboard');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative isolate grid min-h-screen min-w-0 overflow-hidden bg-[#050505] px-4 py-6 text-white sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:p-0">
      <div
        className="absolute inset-0 -z-20 bg-cover bg-center opacity-55"
        style={{ backgroundImage: `url(${heroImage})` }}
      />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,5,5,.96),rgba(5,5,5,.82)_38%,rgba(5,5,5,.48)),linear-gradient(0deg,rgba(5,5,5,1),rgba(5,5,5,.36)_42%,rgba(5,5,5,.86))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#dbe1e8]/70 to-transparent" />
      <Link
        href="/"
        className="absolute right-4 top-4 z-20 inline-flex items-center gap-2 rounded-xl border border-white/12 bg-black/42 px-3 py-2 text-xs font-semibold text-zinc-200 shadow-2xl backdrop-blur transition hover:border-[#dbe1e8]/70 hover:bg-white/8 hover:text-white sm:right-auto sm:left-6 sm:top-6"
      >
        <ArrowLeft className="h-4 w-4 sm:block" />
        <span className="sm:hidden">Inicio</span>
        <span className="hidden sm:inline">Página principal</span>
      </Link>

      <section className="relative hidden min-h-screen flex-col justify-between px-10 py-9 lg:flex xl:px-16">
        <Image
          src={brandAssets.logoLightOnDark}
          alt="M&M Eventos"
          width={190}
          height={82}
          className="h-16 w-auto object-contain brightness-110 contrast-125"
          priority
        />

        <div className="max-w-2xl pb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.42em] text-[#dbe1e8]">Backoffice M&M</p>
          <h1 className="mt-5 text-5xl font-semibold leading-[1.02] text-white xl:text-7xl">
            Gestión elegante para eventos memorables.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-zinc-200 xl:text-lg">
            Centralizá consultas, presupuestos, salones, contratos y operaciones desde un panel preparado para el equipo.
          </p>

          <div className="mt-9 grid max-w-2xl gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/12 bg-black/38 p-4 backdrop-blur">
              <CalendarDays className="h-5 w-5 text-[#dbe1e8]" />
              <p className="mt-4 text-xs uppercase tracking-[0.16em] text-zinc-400">Agenda</p>
              <p className="mt-1 text-sm font-semibold text-white">Eventos y visitas</p>
            </div>
            <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/[0.08] p-4 backdrop-blur">
              <ShieldCheck className="h-5 w-5 text-emerald-100" />
              <p className="mt-4 text-xs uppercase tracking-[0.16em] text-zinc-400">Acceso</p>
              <p className="mt-1 text-sm font-semibold text-white">Sesión segura</p>
            </div>
            <div className="rounded-xl border border-amber-300/20 bg-amber-400/[0.08] p-4 backdrop-blur">
              <Sparkles className="h-5 w-5 text-amber-100" />
              <p className="mt-4 text-xs uppercase tracking-[0.16em] text-zinc-400">Equipo</p>
              <p className="mt-1 text-sm font-semibold text-white">Operación diaria</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid min-h-[calc(100vh-3rem)] min-w-0 w-full place-items-center lg:min-h-screen lg:bg-black/28 lg:px-8 lg:backdrop-blur-[2px]">
        <form
          onSubmit={submit}
          className="min-w-0 w-full max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/14 bg-[#0d0d0e]/88 shadow-[0_30px_90px_rgba(0,0,0,.55)] backdrop-blur-xl sm:max-w-[440px]"
        >
          <div className="border-b border-white/10 px-6 pb-6 pt-7 sm:px-8 sm:pt-8">
            <div className="flex min-w-0 flex-wrap items-center justify-start gap-4 sm:justify-between">
              <Image
                src={brandAssets.logoLightOnDark}
                alt="M&M Eventos"
                width={168}
                height={72}
                className="h-14 w-auto object-contain brightness-110 contrast-125 lg:hidden"
                priority
              />
              <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/[0.08] px-3 py-1.5 text-xs font-semibold text-emerald-100 sm:ml-auto">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.85)]" />
                <span className="truncate">Acceso privado</span>
              </span>
            </div>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.32em] text-[#c8cdd3]">Panel administrativo</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.01em] text-white sm:text-4xl">
              Ingresar al sistema
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Usá tus credenciales de backoffice para continuar.
            </p>
          </div>

          <div className="grid gap-5 px-6 py-6 sm:px-8 sm:py-7">
            {error ? (
              <p className="rounded-xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
                {error}
              </p>
            ) : null}

            <label className="grid gap-2 text-sm font-medium text-zinc-200">
              Usuario o email
              <span className="group flex items-center gap-3 rounded-xl border border-white/12 bg-black/35 px-3 py-3 transition focus-within:border-[#dbe1e8]/80 focus-within:bg-black/55">
                <UserRound className="h-4 w-4 shrink-0 text-zinc-500 transition group-focus-within:text-[#dbe1e8]" />
                <input
                  name="username"
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
                  autoComplete="username"
                  placeholder="usuario o correo@ejemplo.com"
                />
              </span>
            </label>

            <label className="grid gap-2 text-sm font-medium text-zinc-200">
              Contraseña
              <span className="group flex items-center gap-3 rounded-xl border border-white/12 bg-black/35 px-3 py-3 transition focus-within:border-[#dbe1e8]/80 focus-within:bg-black/55">
                <LockKeyhole className="h-4 w-4 shrink-0 text-zinc-500 transition group-focus-within:text-[#dbe1e8]" />
                <input
                  name="password"
                  type="password"
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
                  autoComplete="current-password"
                  placeholder="contraseña"
                />
              </span>
            </label>

            <button
              disabled={loading}
              className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#dbe1e8] px-5 py-3 text-sm font-semibold text-black shadow-[0_18px_45px_rgba(219,225,232,.18)] transition hover:bg-white disabled:opacity-60"
            >
              {loading ? 'Ingresando...' : 'Ingresar al backoffice'}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>

            <Link
              href="/"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.035] px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-[#dbe1e8]/60 hover:bg-white/[0.07] hover:text-white"
            >
              <Home className="h-4 w-4" />
              Volver a la página principal
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
