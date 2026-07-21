"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Info,
  MapPin,
  ShieldCheck,
  Sparkles,
  Tag,
  Ticket,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button, Input, NumberField } from "@/components/ui/primitives";
import type { DigitalTicket, TicketPublication, TicketType } from "./types";
import { formatDateTime, money } from "./types";
import { ticketLabel } from "./ticket-labels";
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#f7f7f5] px-4 py-6 text-zinc-900 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <nav className="mb-5 flex items-center justify-between gap-4 text-sm">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-[.12em] text-zinc-950">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-950 text-xs text-amber-300">M&M</span>
            <span>M&M EVENTOS</span>
          </Link>
          <Link href="/" className="rounded-full border border-zinc-200 bg-white px-4 py-2 font-medium text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:text-zinc-950">← Volver al inicio</Link>
        </nav>
        {children}
      </div>
    </main>
  );
}
type CatalogPublication = TicketPublication & {
  category?: string;
  fromPrice?: number;
  availableCount?: number;
  hasActivePromotion?: boolean;
};
const ticketPrice = (type: TicketType) => type.currentPrice ?? type.price ?? 0;
const ThemeIcon = ({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) => (
  <span
    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
    style={{
      backgroundColor: `${color ?? "#18181b"}16`,
      color: color ?? "#18181b",
    }}
  >
    {children}
  </span>
);
export function TicketsCatalog() {
  const [items, setItems] = useState<CatalogPublication[]>([]);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (date) params.set("date", date);
      void api
        .get<{ publications: CatalogPublication[] }>(
          `/public/tickets?${params}`,
        )
        .then((data) => setItems(data.publications))
        .catch(() => setItems([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, date]);
  return (
    <Frame>
      <header className="relative overflow-hidden rounded-[2rem] bg-zinc-950 px-6 py-10 text-white shadow-2xl sm:px-10">
        <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="relative max-w-2xl">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.24em] text-amber-300">
            <Sparkles className="h-4 w-4" /> M&M Eventos
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Experiencias para vivir y recordar.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-zinc-300">
            Descubrí las próximas entradas disponibles y reservá tu lugar de
            forma simple y segura.
          </p>
        </div>
      </header>
      <div className="relative z-10 mx-auto -mt-7 grid max-w-5xl gap-3 rounded-2xl border border-white/70 bg-white/95 p-4 shadow-xl backdrop-blur md:grid-cols-2">
        <label className="text-sm font-medium text-zinc-700">
          Buscar experiencia
          <Input
            className="mt-1.5"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-zinc-700">
          Fecha
          <Input
            className="mt-1.5"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
      </div>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <article
            key={item._id}
            className="group overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
          >
            <div
              className="relative h-52 bg-zinc-900"
              style={
                item.coverImage
                  ? {
                      backgroundImage: `url(${item.coverImage})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : undefined
              }
            >
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/65 via-transparent to-transparent" />
              <p className="absolute bottom-4 left-5 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-zinc-800 shadow-sm">
                {item.category || "Experiencia"}
              </p>
              {item.hasActivePromotion ? (
                <p className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-rose-500 px-3 py-1 text-xs font-bold text-white">
                  <Tag className="h-3.5 w-3.5" />
                  Oferta vigente
                </p>
              ) : null}
            </div>
            <div className="p-5">
              <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
                {item.title}
              </h2>
              <div className="mt-4 space-y-2 text-sm text-zinc-600">
                <p className="flex gap-2">
                  <CalendarDays className="h-4 w-4 shrink-0 text-zinc-400" />
                  {formatDateTime(item.startsAt)}
                </p>
                {item.venueName ? (
                  <p className="flex gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-zinc-400" />
                    {item.venueName}
                  </p>
                ) : null}
              </div>
              <div className="mt-6 flex items-end justify-between border-t border-zinc-100 pt-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Desde
                  </p>
                  <p className="mt-1 text-xl font-bold text-zinc-950">
                    {money(item.fromPrice)}
                  </p>
                </div>
                <Link href={`/entradas/${item.slug}`}>
                  <Button className="rounded-xl">
                    Ver detalle <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </article>
        ))}
        {!items.length ? (
          <p className="rounded-3xl border border-dashed border-zinc-300 bg-white p-12 text-center text-zinc-500 sm:col-span-2 lg:col-span-3">
            No encontramos experiencias activas con esos filtros.
          </p>
        ) : null}
      </div>
    </Frame>
  );
}
export function PublicTickets({ slug }: { slug: string }) {
  const [publication, setPublication] = useState<TicketPublication>();
  const [error, setError] = useState("");
  useEffect(() => {
    void api
      .get<{
        publication: TicketPublication;
        types: TicketPublication["ticketTypes"];
      }>(`/public/tickets/${slug}`)
      .then((data) =>
        setPublication({ ...data.publication, ticketTypes: data.types }),
      )
      .catch((cause: Error) => setError(cause.message));
  }, [slug]);
  if (!publication)
    return (
      <Frame>
        <p className="rounded-2xl bg-white p-6">
          {error || "Cargando entradas…"}
        </p>
      </Frame>
    );
  const mapQuery = [publication.venueName, publication.address]
    .filter(Boolean)
    .join(", ");
  const appearance = {
    primary: publication.appearance?.primaryColor || "#18181b",
    secondary: publication.appearance?.secondaryColor || "#d4a373",
    background: publication.appearance?.backgroundColor || "#ffffff",
    text: publication.appearance?.textColor || "#18181b",
  };
  const gallery = (publication.gallery ?? []).filter(
    (image) => image && image !== publication.coverImage,
  );
  return (
    <Frame>
      <article
        className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-xl"
        style={{
          backgroundColor: appearance.background,
          color: appearance.text,
        }}
      >
        <header
          className="relative min-h-[25rem] overflow-hidden p-6 text-white sm:p-10"
          style={{
            backgroundColor: appearance.primary,
            ...(publication.coverImage
              ? {
                  backgroundImage: `linear-gradient(0deg,${appearance.primary}ee,${appearance.primary}22),url(${publication.coverImage})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : {}),
          }}
        >
          <Link
            href="/entradas"
            className="relative inline-flex rounded-full bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur hover:bg-white/25"
          >
            ← Todas las experiencias
          </Link>
          <div className="relative mt-32 max-w-3xl">
            <p
              className="text-xs font-bold uppercase tracking-[.22em]"
              style={{ color: appearance.secondary }}
            >
              Entradas digitales
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">
              {publication.title}
            </h1>
            {publication.shortDescription ? (
              <p className="mt-4 max-w-2xl text-lg text-white/85">
                {publication.shortDescription}
              </p>
            ) : null}
          </div>
        </header>
        <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-8">
            <section>
              <p className="whitespace-pre-line text-base leading-7 text-zinc-600">
                {publication.fullDescription || publication.description}
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <div className="flex gap-3 rounded-2xl border border-zinc-200/80 bg-white/70 p-4">
                  <ThemeIcon color={appearance.secondary}>
                    <CalendarDays className="h-5 w-5" />
                  </ThemeIcon>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Comienza
                    </p>
                    <p className="mt-1 text-sm font-semibold text-zinc-800">
                      {formatDateTime(publication.startsAt)}
                    </p>
                    {publication.endsAt ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        Finaliza: {formatDateTime(publication.endsAt)}
                      </p>
                    ) : null}
                  </div>
                </div>
                {publication.venueName || publication.address ? (
                  <div className="flex gap-3 rounded-2xl border border-zinc-200/80 bg-white/70 p-4">
                    <ThemeIcon color={appearance.secondary}>
                      <MapPin className="h-5 w-5" />
                    </ThemeIcon>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Ubicación
                      </p>
                      <p className="mt-1 text-sm font-semibold text-zinc-800">
                        {[publication.venueName, publication.address]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
            {mapQuery ? (
              <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white">
                <iframe
                  className="h-64 w-full"
                  title="Ubicación del evento"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=15&output=embed`}
                />
                <a
                  className="block p-4 text-sm font-semibold underline"
                  style={{ color: appearance.primary }}
                  href={
                    publication.mapsUrl ||
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir ubicación en Google Maps
                </a>
              </section>
            ) : null}
            {gallery.length ? (
              <section>
                <h2 className="text-xl font-semibold">Galería</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {gallery.map((image) => (
                    <img
                      key={image}
                      src={image}
                      alt="Imagen de la experiencia"
                      className="h-52 w-full rounded-2xl object-cover"
                    />
                  ))}
                </div>
              </section>
            ) : null}
            {publication.accessInfo || publication.restrictions ? (
              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-zinc-950 p-5 text-white">
                  <Info
                    className="h-5 w-5"
                    style={{ color: appearance.secondary }}
                  />
                  <h2 className="mt-4 font-semibold">Información de acceso</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    {publication.accessInfo ||
                      "Presentá tu entrada digital al ingresar."}
                  </p>
                </div>
                {publication.restrictions ? (
                  <div className="rounded-2xl border border-zinc-200 p-5">
                    <ShieldCheck
                      className="h-5 w-5"
                      style={{ color: appearance.secondary }}
                    />
                    <h2 className="mt-4 font-semibold">Condiciones</h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">
                      {publication.restrictions}
                    </p>
                  </div>
                ) : null}
              </section>
            ) : null}
            {publication.organizer?.name ? (
              <section className="rounded-2xl border border-zinc-200 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Organiza
                </p>
                <p className="mt-2 font-semibold">
                  {publication.organizer.name}
                </p>
                {publication.organizer.email ? (
                  <a
                    className="mt-1 block text-sm underline"
                    href={`mailto:${publication.organizer.email}`}
                  >
                    {publication.organizer.email}
                  </a>
                ) : null}
              </section>
            ) : null}
            {publication.termsAndConditions ||
            publication.cancellationPolicy ||
            publication.refundPolicy ? (
              <section className="rounded-3xl border border-zinc-200 bg-white p-5">
                <h2 className="font-semibold">Políticas de compra</h2>
                <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-600">
                  {publication.termsAndConditions ? (
                    <details>
                      <summary className="cursor-pointer font-medium text-zinc-900">
                        Términos y condiciones
                      </summary>
                      <p className="mt-2 whitespace-pre-line">
                        {publication.termsAndConditions}
                      </p>
                    </details>
                  ) : null}
                  {publication.cancellationPolicy ? (
                    <details>
                      <summary className="cursor-pointer font-medium text-zinc-900">
                        Política de cancelación
                      </summary>
                      <p className="mt-2 whitespace-pre-line">
                        {publication.cancellationPolicy}
                      </p>
                    </details>
                  ) : null}
                  {publication.refundPolicy ? (
                    <details>
                      <summary className="cursor-pointer font-medium text-zinc-900">
                        Política de reembolsos
                      </summary>
                      <p className="mt-2 whitespace-pre-line">
                        {publication.refundPolicy}
                      </p>
                    </details>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
          <aside className="h-fit rounded-3xl border border-zinc-200 bg-white p-5 shadow-lg lg:sticky lg:top-5">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">
              Reservá tu lugar
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Elegí tus entradas</h2>
            <div className="mt-4 space-y-3">
              {(publication.ticketTypes ?? []).map((type) => (
                <div
                  key={type._id}
                  className="rounded-2xl border border-zinc-100 p-4"
                  style={{
                    borderLeftColor:
                      (type as any).color || appearance.secondary,
                    borderLeftWidth: 4,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{type.name}</p>
                      {type.description ? (
                        <p className="mt-1 text-xs leading-5 text-zinc-500">
                          {type.description}
                        </p>
                      ) : null}
                    </div>
                    {type.isPromotionActive ? (
                      <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-700">
                        OFERTA
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      {type.isPromotionActive &&
                      type.promotionalPrice !== undefined ? (
                        <p className="text-xs text-zinc-400 line-through">
                          {money(type.price)}
                        </p>
                      ) : null}
                      <p
                        className="text-lg font-bold"
                        style={{ color: appearance.primary }}
                      >
                        {money(ticketPrice(type))}
                      </p>
                      {type.isPromotionActive && type.promotionalEndsAt ? (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500">
                          <Clock3 className="h-3 w-3" />
                          Hasta {formatDateTime(type.promotionalEndsAt)}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-xs text-zinc-500">
                      {type.availableCount ?? 0} disponibles
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Link className="mt-5 block" href={`/entradas/${slug}/checkout`}>
              <Button
                className="w-full rounded-xl"
                style={{ backgroundColor: appearance.primary }}
              >
                <Ticket className="mr-2 h-4 w-4" />
                Continuar a compra
              </Button>
            </Link>
            {publication.termsAndConditions || publication.refundPolicy ? (
              <p className="mt-4 text-xs leading-5 text-zinc-500">
                Al continuar aceptás los términos y las políticas de compra de
                esta experiencia.
              </p>
            ) : null}
          </aside>
        </div>
      </article>
    </Frame>
  );
}
export function TicketCheckout({ slug }: { slug: string }) {
  const [publication, setPublication] = useState<TicketPublication>();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [buyer, setBuyer] = useState({
    name: "",
    email: "",
    phone: "",
    documentNumber: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [cartReady, setCartReady] = useState(false);
  const [cartIdempotencyKey, setCartIdempotencyKey] = useState("");
  const cartKey = `mym-ticket-cart:${slug}`;
  useEffect(() => { try { const saved = window.localStorage.getItem(cartKey); if (saved) { const cart = JSON.parse(saved) as { quantities?: Record<string, number>; buyer?: typeof buyer; idempotencyKey?: string }; setQuantities(cart.quantities ?? {}); setBuyer((current) => ({ ...current, ...(cart.buyer ?? {}) })); setCartIdempotencyKey(cart.idempotencyKey ?? crypto.randomUUID()); } else setCartIdempotencyKey(crypto.randomUUID()); } finally { setCartReady(true); } }, [cartKey]);
  useEffect(() => { if (cartReady) window.localStorage.setItem(cartKey, JSON.stringify({ quantities, buyer, idempotencyKey: cartIdempotencyKey, updatedAt: new Date().toISOString() })); }, [buyer, cartIdempotencyKey, cartKey, cartReady, quantities]);
  useEffect(() => {
    void api
      .get<{
        publication: TicketPublication;
        types: TicketPublication["ticketTypes"];
      }>(`/public/tickets/${slug}`)
      .then((data) =>
        setPublication({ ...data.publication, ticketTypes: data.types }),
      )
      .catch((cause: Error) => setError(cause.message));
  }, [slug]);
  const count = Object.values(quantities).reduce(
    (sum, value) => sum + value,
    0,
  );
  const total = useMemo(
    () =>
      (publication?.ticketTypes ?? []).reduce(
        (sum, type) => sum + (quantities[type._id] ?? 0) * ticketPrice(type),
        0,
      ),
    [publication, quantities],
  );
  const checkout = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!count) return setError("Elegí al menos una entrada.");
    setSaving(true);
    try {
      const result = await api.post<{
        checkout: { checkoutUrl: string };
        order: { publicId: string };
      }>(`/public/tickets/${slug}/orders`, {
        buyer,
        selections: Object.entries(quantities)
          .filter(([, quantity]) => quantity)
          .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })),
        idempotencyKey: cartIdempotencyKey || crypto.randomUUID(),
      });
      window.localStorage.setItem(`${cartKey}:pending-order`, result.order.publicId);
      window.location.assign(result.checkout.checkoutUrl);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo iniciar el pago.",
      );
    } finally {
      setSaving(false);
    }
  };
  if (!publication)
    return (
      <Frame>
        <p>{error || "Cargando checkout…"}</p>
      </Frame>
    );
  return (
    <Frame>
      <Link
        href={`/entradas/${slug}`}
        className="text-sm font-medium text-zinc-600"
      >
        ← Volver a la experiencia
      </Link>
      <form
        onSubmit={(event) => void checkout(event)}
        className="mt-5 grid gap-6 lg:grid-cols-[1fr_340px]"
      >
        <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-amber-700">PASO 1 DE 2</p>
            <h1 className="mt-1 text-2xl font-semibold">
              Entradas y datos del comprador
            </h1>
          </div>
          {(publication.ticketTypes ?? []).map((type) => (
            <div
              key={type._id}
              className="flex items-center gap-4 border-t pt-4"
            >
              <Ticket className="h-5 text-amber-700" />
              <div className="flex-1">
                <p className="font-medium">{type.name}</p>
                <p className="text-sm text-zinc-500">
                  {type.isPromotionActive &&
                  type.promotionalPrice !== undefined ? (
                    <>
                      <span className="mr-2 line-through">
                        {money(type.price)}
                      </span>
                      <span className="font-semibold text-rose-700">
                        {money(ticketPrice(type))} oferta vigente
                      </span>
                    </>
                  ) : (
                    money(ticketPrice(type))
                  )}
                </p>
              </div>
              <NumberField
                className="w-24"
                inputClassName="w-full"
                label={`Cantidad de ${type.name}`}
                min="0"
                max={type.maxPerOrder ?? 10}
                value={quantities[type._id] ?? 0}
                onChange={(event) =>
                  setQuantities({
                    ...quantities,
                    [type._id]: Number(event.target.value),
                  })
                }
              />
            </div>
          ))}
          <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
            <label className="text-sm font-medium text-zinc-700">
              Nombre y apellido
              <Input
                required
                className="mt-1.5"
                value={buyer.name}
                onChange={(event) =>
                  setBuyer({ ...buyer, name: event.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Email
              <Input
                required
                className="mt-1.5"
                type="email"
                value={buyer.email}
                onChange={(event) =>
                  setBuyer({ ...buyer, email: event.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Teléfono
              <Input
                className="mt-1.5"
                value={buyer.phone}
                onChange={(event) =>
                  setBuyer({ ...buyer, phone: event.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium text-zinc-700">
              DNI
              <Input
                className="mt-1.5"
                value={buyer.documentNumber}
                onChange={(event) =>
                  setBuyer({ ...buyer, documentNumber: event.target.value })
                }
              />
            </label>
          </div>
        </section>
        <aside className="h-fit rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm lg:sticky lg:top-5">
          <h2 className="font-semibold">Resumen</h2>
          <p className="mt-3 text-sm text-zinc-600">
            {count} entrada{count === 1 ? "" : "s"}
          </p>
          <p className="mt-4 text-2xl font-semibold">{money(total)}</p>
          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
          <Button className="mt-5 w-full" disabled={saving}>
            {saving ? "Preparando pago…" : "Ir al pago"}
          </Button>
        </aside>
      </form>
    </Frame>
  );
}
export function MockTicketPayment({ orderCode }: { orderCode: string }) {
  const [order, setOrder] = useState<any>();
  const [message, setMessage] = useState("");
  const load = () =>
    api
      .get<{ order: any }>(`/public/tickets/mock-payment/${orderCode}`)
      .then((data) => setOrder(data.order))
      .catch((error) => setMessage(error.message));
  useEffect(() => {
    void load();
  }, [orderCode]);
  const action = async (value: "approve" | "pending" | "reject" | "cancel") => {
    try {
      const result = await api.post<{ order: any }>(
        `/public/tickets/mock-payment/${orderCode}`,
        { action: value },
      );
      setOrder(result.order);
      setMessage(
        value === "approve"
          ? "Pago aprobado: las entradas fueron emitidas."
          : "Estado de pago simulado actualizado.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo simular el pago.",
      );
    }
  };
  if (!order)
    return (
      <Frame>
        <p>{message || "Cargando pago simulado…"}</p>
      </Frame>
    );
  return (
    <Frame>
      <article className="mx-auto max-w-xl rounded-3xl border border-zinc-200 bg-white p-7 shadow-xl">
        <p className="text-sm font-semibold tracking-wide text-amber-700">
          SIMULADOR LOCAL DE PAGOS
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Orden {order.publicId}</h1>
        <p className="mt-3 text-sm text-zinc-600">
          {order.buyer.name} · {order.buyer.email}
        </p>
        <div className="mt-5 space-y-2 rounded-xl bg-zinc-50 p-4">
          {order.lines.map((line: any) => (
            <p key={line.ticketTypeId}>
              {line.quantity} × {line.name}
            </p>
          ))}
          <p className="pt-2 text-xl font-semibold">
            Total: {money(order.totalAmount)}
          </p>
        </div>
        <p className="mt-4 text-sm">
          Estado actual: <b>{ticketLabel(order.status)}</b>
        </p>
        {message ? (
          <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button onClick={() => void action("approve")}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Aprobar pago
          </Button>
          <Button variant="secondary" onClick={() => void action("pending")}>
            Pago pendiente
          </Button>
          <Button variant="secondary" onClick={() => void action("reject")}>
            <XCircle className="mr-2 h-4 w-4" />
            Rechazar pago
          </Button>
          <Button variant="danger" onClick={() => void action("cancel")}>
            Cancelar
          </Button>
        </div>
      </article>
    </Frame>
  );
}
export function PublicTicket({ token }: { token: string }) {
  const [ticket, setTicket] = useState<DigitalTicket>();
  const [qr, setQr] = useState("");
  useEffect(() => {
    void api
      .get<{
        ticket: DigitalTicket;
        qrDataUrl: string;
      }>(`/public/ticket/${token}`)
      .then((data) => {
        setTicket(data.ticket);
        setQr(data.qrDataUrl);
      });
  }, [token]);
  if (!ticket)
    return (
      <Frame>
        <p>Cargando entrada…</p>
      </Frame>
    );
  return (
    <Frame>
      <article className="mx-auto max-w-xl rounded-3xl bg-white p-7 text-center shadow-xl">
        <p className="text-sm text-amber-700">ENTRADA DIGITAL</p>
        <h1 className="mt-3 text-3xl font-semibold">
          {ticket.publicationName}
        </h1>
        <p className="mt-2">{ticket.attendeeName}</p>
        {qr ? (
          <img src={qr} alt="Código QR" className="mx-auto my-6 h-56 w-56" />
        ) : (
          <b>{ticket.publicToken}</b>
        )}
        <p>{ticket.ticketTypeName}</p>
        <p className="mt-2 text-sm">
          {formatDateTime(ticket.startsAt)}
          <br />
          {ticket.venueName || ticket.address}
        </p>
        <p className="mt-4">
          Estado: <b>{ticketLabel(ticket.status)}</b>
        </p>
      </article>
    </Frame>
  );
}
