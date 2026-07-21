"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, ExternalLink, Ticket } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/primitives";
import { formatDateTime, money } from "./types";
import { ticketLabel } from "./ticket-labels";

type Portal = {
  order: {
    publicId: string;
    buyer: { name: string; email: string };
    status: string;
    totalAmount: number;
  };
  publication?: {
    title: string;
    startsAt?: string;
    venueName?: string;
    address?: string;
  };
  tickets: Array<{
    ticketCode: string;
    status: string;
    attendeeName?: string;
    ticketTypeName?: string;
    issuedAt?: string;
    accessToken: string;
  }>;
};

export function TicketOrderPortal({ orderCode }: { orderCode: string }) {
  const [data, setData] = useState<Portal>();
  const [error, setError] = useState("");
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setError("El enlace de acceso es inválido o está incompleto.");
      return;
    }
    const load = () => api.get<Portal>(`/public/ticket-orders/${orderCode}?token=${encodeURIComponent(token)}`).then(setData).catch((cause: Error) => setError(cause.message));
    void load();
    const interval = window.setInterval(() => { void load(); }, 3500);
    return () => window.clearInterval(interval);
  }, [orderCode]);
  if (!data)
    return (
      <main className="min-h-dvh bg-zinc-50 p-6">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="text-sm font-semibold text-zinc-700">← Volver a M&M Eventos</Link>
          <div className="mt-5 rounded-3xl bg-white p-8 shadow-sm">{error || "Cargando tus entradas…"}</div>
        </div>
      </main>
    );
  return (
    <main className="min-h-dvh bg-[#f7f7f5] p-4 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <nav className="flex items-center justify-between gap-4 text-sm">
          <Link href="/" className="font-bold tracking-[.12em] text-zinc-950">M&M EVENTOS</Link>
          <Link href="/" className="rounded-full border bg-white px-4 py-2 font-medium text-zinc-700">← Volver al inicio</Link>
        </nav>
        <header className="rounded-3xl bg-zinc-950 p-7 text-white">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-amber-300">
            M&M Eventos
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Tus entradas</h1>
          <p className="mt-3 text-zinc-300">
            {data.order.status === 'paid' ? `Hola ${data.order.buyer.name}. Tu pago fue aprobado; recibirás un email con tus entradas y el detalle de la compra.` : data.order.status === 'payment_pending' || data.order.status === 'pending' ? 'Estamos confirmando tu pago. Esta página se actualizará automáticamente.' : `El pago no pudo completarse (${ticketLabel(data.order.status)}). Podés volver a intentar la compra.`}
          </p>
        </header>
        <section className="rounded-3xl border bg-white p-6">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-500">Orden</p>
              <p className="font-semibold">{data.order.publicId}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Total abonado</p>
              <p className="font-semibold">{money(data.order.totalAmount)}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Estado</p>
              <p className="font-semibold">{ticketLabel(data.order.status)}</p>
            </div>
          </div>
          {data.publication ? (
            <p className="mt-5 flex gap-2 border-t pt-5 text-sm text-zinc-600">
              <CalendarDays className="h-4 w-4" />
              {data.publication.title} ·{" "}
              {formatDateTime(data.publication.startsAt)} ·{" "}
              {data.publication.venueName || data.publication.address}
            </p>
          ) : null}
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          {data.tickets.map((ticket) => (
            <article
              key={ticket.ticketCode}
              className="rounded-3xl border bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <Ticket className="h-6 w-6 text-amber-600" />
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold">
                  {ticketLabel(ticket.status)}
                </span>
              </div>
              <h2 className="mt-5 font-semibold">
                {ticket.ticketTypeName || "Entrada"}
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                {ticket.attendeeName || data.order.buyer.name}
              </p>
              <p className="mt-4 font-mono text-sm font-semibold">
                {ticket.ticketCode}
              </p>
              <Link
                className="mt-5 block"
                href={`/entrada/${ticket.accessToken}`}
                target="_blank"
              >
                <Button className="w-full">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Ver código QR
                </Button>
              </Link>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
