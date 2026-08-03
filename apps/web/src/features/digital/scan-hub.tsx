"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, MapPin, Search, Ticket } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Input, PageHeader } from "@/components/ui/primitives";
import { TicketCheckIn } from "./check-in";
import type { TicketPublication } from "./types";

const statusLabel: Record<string, string> = {
  draft: "Borrador",
  scheduled: "Programada",
  active: "Activa",
  paused: "Pausada",
  sold_out: "Agotada",
  finished: "Finalizada",
  closed: "Cerrada",
  cancelled: "Cancelada",
  archived: "Archivada",
};
const statusStyle = (status?: string) =>
  status === "active"
    ? "bg-emerald-100 text-emerald-800"
    : status === "paused"
      ? "bg-amber-100 text-amber-900"
      : "bg-sky-100 text-sky-800";
const date = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("es-AR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Sin fecha";

export function TicketScanHub() {
  const [items, setItems] = useState<TicketPublication[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TicketPublication>();

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api
      .get<{ publications: TicketPublication[] }>("/tickets/publications?limit=100")
      .then((data) => {
        if (mounted) setItems(data.publications);
      })
      .catch(() => {
        if (mounted) setItems([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const relevant = useMemo(() => {
    const term = search.trim().toLowerCase();
    const now = Date.now();
    return items
      .filter((item) => !["archived", "draft"].includes(item.status ?? ""))
      .filter(
        (item) =>
          !term ||
          item.title.toLowerCase().includes(term) ||
          (item.venueName ?? "").toLowerCase().includes(term),
      )
      .sort((a, b) => {
        // Ordena por cercanía a "ahora" para que el evento de hoy quede arriba,
        // sin ocultar el resto (útil si hay que validar una entrada atrasada).
        const da = a.startsAt ? Math.abs(new Date(a.startsAt).getTime() - now) : Infinity;
        const db = b.startsAt ? Math.abs(new Date(b.startsAt).getTime() - now) : Infinity;
        return da - db;
      });
  }, [items, search]);

  if (selected) {
    return (
      <section className="space-y-4">
        <Button variant="secondary" onClick={() => setSelected(undefined)}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Elegir otra publicación
        </Button>
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm text-zinc-600">
          Escaneando para <b className="text-zinc-950">{selected.title}</b>
          {selected.venueName ? ` · ${selected.venueName}` : ""}
        </div>
        <TicketCheckIn publicationId={selected._id} />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Escanear entradas"
        description="Elegí la publicación y validá cada QR contra el servidor antes de permitir el acceso."
      />
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
        <Input
          className="pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre o lugar"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <p className="col-span-full py-10 text-center text-sm text-zinc-500">
            Cargando publicaciones…
          </p>
        ) : relevant.length ? (
          relevant.map((item) => (
            <button
              key={item._id}
              type="button"
              onClick={() => setSelected(item)}
              className="rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-zinc-950 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-zinc-950">{item.title}</p>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(item.status)}`}
                >
                  {statusLabel[item.status ?? ""] ?? item.status}
                </span>
              </div>
              <p className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
                <CalendarClock className="h-3 w-3" />
                {date(item.startsAt)}
              </p>
              {item.venueName ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                  <MapPin className="h-3 w-3" />
                  {item.venueName}
                </p>
              ) : null}
              <p className="mt-3 flex items-center gap-1 text-sm font-medium text-zinc-950">
                <Ticket className="h-4 w-4" />
                Escanear para esta publicación
              </p>
            </button>
          ))
        ) : (
          <p className="col-span-full rounded-2xl border border-zinc-200 bg-white py-10 text-center text-sm text-zinc-500">
            No hay publicaciones para mostrar.
          </p>
        )}
      </div>
    </section>
  );
}
