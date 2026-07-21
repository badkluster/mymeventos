"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Ticket,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Button,
  Input,
  NumberField,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast-provider";
import {
  CloudinaryUpload,
  type UploadedAsset,
} from "@/components/cloudinary-upload";
import { TicketBuyersAdmin, TicketOrdersAdmin } from "./ticket-operations";
import type { TicketPublication, TicketType } from "./types";

type Publication = TicketPublication & {
  internalName?: string;
  category?: string;
  endsAt?: string;
  soldCount?: number;
  reservedCount?: number;
  revenue?: number;
  updatedAt?: string;
  visibility?: { isPublic?: boolean };
  location?: { mapsUrl?: string };
  gallery?: string[];
  appearance?: {
    primaryColor?: string;
    secondaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
  };
};
type Dashboard = {
  activePublications: number;
  ticketsSold: number;
  ticketsAvailable: number;
  monthSales: number;
  revenue: number;
  pendingPayments: number;
  refunds: number;
  checkIns: number;
};
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
const money = (value = 0) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
const date = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("es-AR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
const toDateTimeLocal = (value?: string | Date) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};
const statusStyle = (status?: string) =>
  status === "active"
    ? "bg-emerald-100 text-emerald-800"
    : status === "paused"
      ? "bg-amber-100 text-amber-900"
      : status === "draft"
        ? "bg-zinc-100 text-zinc-700"
        : "bg-sky-100 text-sky-800";

function TicketsNav({
  active,
  onChange,
}: {
  active: "panel" | "sales" | "buyers";
  onChange: (view: "panel" | "sales" | "buyers") => void;
}) {
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-1.5 text-sm shadow-sm">
      {[
        ["panel", "Panel"],
        ["sales", "Ventas"],
        ["buyers", "Compradores"],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() =>
            onChange(value as "panel" | "sales" | "buyers")
          }
          className={`rounded-xl px-3 py-2 text-sm font-medium ${active === value ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

export function TicketPublicationsAdmin() {
  const { showToast } = useToast();
  const [metrics, setMetrics] = useState<Dashboard>();
  const [items, setItems] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [view, setView] = useState<"panel" | "sales" | "buyers">(
    "panel",
  );
  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (dateFilter) params.set("date", dateFilter);
      const [dashboard, list] = await Promise.all([
        api.get<{ metrics: Dashboard }>("/tickets/dashboard"),
        api.get<{
          publications: Publication[];
          pagination: { total: number; totalPages: number };
        }>(`/tickets/publications?${params}`),
      ]);
      setMetrics(dashboard.metrics);
      setItems(list.publications);
      setPages(list.pagination.totalPages);
      setTotal(list.pagination.total);
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "No se pudo cargar el panel de entradas.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [search, status, dateFilter, page, refresh]);
  if (view !== "panel")
    return (
      <section className="space-y-6">
        <PageHeader
          title="Entradas digitales"
          description="Gestioná publicaciones, ventas, compradores, ingresos y devoluciones."
          action={
            <Button variant="secondary" onClick={() => setView("panel")}>
              Volver al panel
            </Button>
          }
        />
        <TicketsNav active={view} onChange={setView} />
        {view === "sales" ? (
          <TicketOrdersAdmin />
        ) : (
          <TicketBuyersAdmin />
        )}
      </section>
    );
  const setPublicationState = async (
    item: Publication,
    action: "activate" | "pause" | "archive",
  ) => {
    try {
      await api.post(`/tickets/publications/${item._id}/${action}`, {});
      showToast({
        message:
          action === "activate"
            ? "Publicación activada."
            : action === "pause"
              ? "Venta pausada."
              : "Publicación archivada.",
        variant: "success",
      });
      setRefresh((value) => value + 1);
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar la publicación.",
        variant: "error",
      });
    }
  };
  const cards = [
    {
      label: "Publicaciones activas",
      value: metrics?.activePublications ?? 0,
      icon: Ticket,
    },
    {
      label: "Entradas vendidas",
      value: metrics?.ticketsSold ?? 0,
      icon: CheckCircle2,
    },
    {
      label: "Disponibles",
      value: metrics?.ticketsAvailable ?? 0,
      icon: Users,
    },
    {
      label: "Ventas del mes",
      value: money(metrics?.monthSales),
      icon: BarChart3,
    },
    { label: "Recaudación", value: money(metrics?.revenue), icon: BarChart3 },
    {
      label: "Pagos pendientes",
      value: metrics?.pendingPayments ?? 0,
      icon: CalendarDays,
    },
    {
      label: "Reembolsos",
      value: money(metrics?.refunds),
      icon: MoreHorizontal,
    },
    {
      label: "Ingresos registrados",
      value: metrics?.checkIns ?? 0,
      icon: CheckCircle2,
    },
  ];
  return (
    <section className="space-y-6">
      <PageHeader
        title="Entradas digitales"
        description="Gestioná publicaciones, ventas, compradores, ingresos y devoluciones."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/entradas" target="_blank">
              <Button variant="secondary">
                <ExternalLink className="mr-2 h-4 w-4" />
                Ver catálogo público
              </Button>
            </Link>
            <Link href="/admin/digital-tickets/publications/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nueva publicación
              </Button>
            </Link>
          </div>
        }
      />
      <TicketsNav active={view} onChange={setView} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <article
            key={label}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-sm">{label}</span>
              <Icon className="h-4 w-4" />
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">
              {value}
            </p>
          </article>
        ))}
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm font-medium text-zinc-700 md:col-span-2">
            Buscar publicación
            <div className="relative mt-1.5">
              <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Nombre, enlace, categoría o lugar"
              />
            </div>
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Estado
            <Select
              className="mt-1.5"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {Object.entries(statusLabel).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Fecha de inicio
            <Input
              className="mt-1.5"
              type="date"
              value={dateFilter}
              onChange={(event) => {
                setDateFilter(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Publicación</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Fecha y lugar</th>
                <th className="px-4 py-3">Vendidas</th>
                <th className="px-4 py-3">Disponibles</th>
                <th className="px-4 py-3">Recaudación</th>
                <th className="px-4 py-3">Modificada</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-zinc-500"
                  >
                    Cargando publicaciones…
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item._id} className="hover:bg-zinc-50">
                    <td className="px-4 py-4">
                      <div className="flex gap-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-zinc-100">
                          {item.coverImage ? (
                            <img
                              src={item.coverImage}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Ticket className="h-5 text-zinc-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-zinc-950">
                            {item.title}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {item.category || "Sin categoría"} · /{item.slug}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(item.status)}`}
                      >
                        {statusLabel[item.status ?? "draft"] ?? item.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p>{date(item.startsAt)}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                        <MapPin className="h-3 w-3" />
                        {item.venueName || "Sin lugar"}
                      </p>
                    </td>
                    <td className="px-4 py-4 font-medium">
                      {item.soldCount ?? 0}
                    </td>
                    <td className="px-4 py-4">
                      {item.availableCount ??
                        Math.max(
                          0,
                          (item.capacity ?? 0) -
                            (item.soldCount ?? 0) -
                            (item.reservedCount ?? 0),
                        )}
                    </td>
                    <td className="px-4 py-4">{money(item.revenue)}</td>
                    <td className="px-4 py-4 text-zinc-500">
                      {date(item.updatedAt)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-1">
                        <Link
                          title="Editar"
                          href={`/admin/digital-tickets/publications/${item._id}/edit`}
                        >
                          <Button variant="secondary" className="px-3">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Link
                          title="Abrir venta pública"
                          href={`/entradas/${item.slug}`}
                          target="_blank"
                        >
                          <Button variant="secondary" className="px-3">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Link
                          title="Control de ingreso"
                          href={`/admin/digital-tickets/${item._id}/check-in`}
                        >
                          <Button variant="secondary" className="px-3">
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                        </Link>
                        {item.status === "active" ? (
                          <Button
                            title="Pausar"
                            variant="secondary"
                            onClick={() =>
                              void setPublicationState(item, "pause")
                            }
                          >
                            Pausar
                          </Button>
                        ) : (
                          <Button
                            title="Activar"
                            variant="secondary"
                            onClick={() =>
                              void setPublicationState(item, "activate")
                            }
                          >
                            Activar
                          </Button>
                        )}
                        <Button
                          title="Archivar"
                          variant="secondary"
                          onClick={() => {
                            if (window.confirm(`¿Archivar ${item.title}?`))
                              void setPublicationState(item, "archive");
                          }}
                        >
                          Archivar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
              {!loading && !items.length ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-14 text-center text-zinc-500"
                  >
                    No hay publicaciones para los filtros seleccionados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <footer className="flex items-center justify-between border-t bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          <span>{total} publicaciones</span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              disabled={page >= pages}
              onClick={() => setPage((current) => current + 1)}
            >
              Siguiente
            </Button>
          </div>
        </footer>
      </div>
    </section>
  );
}

export function TicketPublicationAdmin({
  publicationId,
}: {
  publicationId: string;
}) {
  return <TicketPublicationEditor publicationId={publicationId} />;
}

function EditableTicketType({
  type,
  publicationId,
  onChanged,
}: {
  type: TicketType;
  publicationId: string;
  onChanged: (type?: TicketType) => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState({
    name: type.name,
    description: type.description ?? "",
    price: type.price ?? 0,
    promotionalPrice: (type as any).promotionalPrice ?? 0,
    promotionalStartsAt: toDateTimeLocal((type as any).promotionalStartsAt),
    promotionalEndsAt: toDateTimeLocal((type as any).promotionalEndsAt),
    capacity: type.capacity ?? 1,
    minPerOrder: (type as any).minPerOrder ?? 1,
    maxPerOrder: type.maxPerOrder ?? 8,
    status: type.status ?? "active",
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const result = await api.patch<{ ticketType: TicketType }>(
        `/tickets/publications/${publicationId}/types/${type._id}`,
        {
          ...form,
          promotionalPrice: form.promotionalPrice || null,
          promotionalStartsAt: form.promotionalPrice
            ? form.promotionalStartsAt
              ? new Date(form.promotionalStartsAt).toISOString()
              : null
            : null,
          promotionalEndsAt: form.promotionalPrice
            ? form.promotionalEndsAt
              ? new Date(form.promotionalEndsAt).toISOString()
              : null
            : null,
        },
      );
      onChanged(result.ticketType);
      showToast({ message: "Entrada actualizada.", variant: "success" });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar la entrada.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <article className="rounded-xl border border-zinc-200 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium">
          Nombre
          <Input
            className="mt-1"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="text-sm font-medium">
          Estado
          <Select
            className="mt-1"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option value="active">Activa</option>
            <option value="paused">Pausada</option>
            <option value="hidden">Oculta</option>
            <option value="inactive">Inactiva</option>
          </Select>
        </label>
        <NumberField
          label="Precio de lista"
          min={0}
          value={form.price}
          onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
        />
        <NumberField
          label="Precio promocional (opcional)"
          min={0}
          value={form.promotionalPrice}
          onChange={(e) =>
            setForm({ ...form, promotionalPrice: Number(e.target.value) })
          }
        />
        <label className="text-sm font-medium">
          Promo válida desde
          <Input
            className="mt-1"
            type="datetime-local"
            disabled={!form.promotionalPrice}
            value={form.promotionalStartsAt}
            onChange={(e) =>
              setForm({ ...form, promotionalStartsAt: e.target.value })
            }
          />
        </label>
        <label className="text-sm font-medium">
          Promo válida hasta
          <Input
            className="mt-1"
            type="datetime-local"
            disabled={!form.promotionalPrice}
            min={form.promotionalStartsAt || undefined}
            value={form.promotionalEndsAt}
            onChange={(e) =>
              setForm({ ...form, promotionalEndsAt: e.target.value })
            }
          />
        </label>
        <p className="text-xs text-zinc-500 md:col-span-2">
          Si dejás las fechas vacías, el precio promocional se aplica mientras
          la entrada esté a la venta.
        </p>
        <NumberField
          label="Cupo"
          min={Math.max(type.soldCount ?? 0, type.reservedCount ?? 0)}
          value={form.capacity}
          onChange={(e) =>
            setForm({ ...form, capacity: Number(e.target.value) })
          }
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Mínimo por orden"
            min={1}
            value={form.minPerOrder}
            onChange={(e) =>
              setForm({ ...form, minPerOrder: Number(e.target.value) })
            }
          />
          <NumberField
            label="Máximo por orden"
            min={1}
            value={form.maxPerOrder}
            onChange={(e) =>
              setForm({ ...form, maxPerOrder: Number(e.target.value) })
            }
          />
        </div>
        <label className="text-sm font-medium md:col-span-2">
          Descripción
          <Textarea
            className="mt-1"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
      </div>
      <div className="mt-3 flex justify-between text-xs text-zinc-500">
        <span>
          {type.soldCount ?? 0} vendidas · {type.reservedCount ?? 0} reservadas
        </span>
        <Button
          disabled={saving || !form.name.trim()}
          onClick={() => void save()}
        >
          {saving ? "Guardando…" : "Guardar entrada"}
        </Button>
      </div>
    </article>
  );
}

export function TicketPublicationEditor({
  publicationId,
  create = false,
}: {
  publicationId?: string;
  create?: boolean;
}) {
  const { showToast } = useToast();
  const [publication, setPublication] = useState<Publication>();
  const [types, setTypes] = useState<TicketType[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [tab, setTab] = useState("general");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    title: "",
    internalName: "",
    slug: "",
    category: "",
    description: "",
    startsAt: "",
    endsAt: "",
    venueName: "",
    address: "",
    mapsUrl: "",
    capacity: 1,
    coverImage: "",
    gallery: [],
    termsAndConditions: "",
    cancellationPolicy: "",
    refundPolicy: "",
    appearance: {
      primaryColor: "#18181b",
      secondaryColor: "#d4a373",
      backgroundColor: "#fafaf9",
      textColor: "#18181b",
    },
    visibility: { isPublic: true, showInPublicCatalog: true },
  });
  const load = async () => {
    if (!publicationId) return;
    try {
      const data = await api.get<{
        publication: Publication;
        types: TicketType[];
      }>(`/tickets/publications/${publicationId}`);
      const item: any = data.publication;
      setPublication(item);
      setTypes(data.types);
      setForm((current: any) => ({
        ...current,
        ...item,
        startsAt: toDateTimeLocal(item.startsAt),
        endsAt: toDateTimeLocal(item.endsAt),
        mapsUrl: item.mapsUrl ?? item.location?.mapsUrl ?? "",
        gallery: item.gallery ?? [],
        appearance: item.appearance ?? current.appearance,
        visibility: item.visibility ?? current.visibility,
      }));
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "No se pudo cargar la publicación.",
        variant: "error",
      });
    }
  };
  useEffect(() => {
    void load();
  }, [publicationId]);
  useEffect(() => {
    if (!publicationId || !["buyers", "payments"].includes(tab)) return;
    void api
      .get<{
        orders: any[];
      }>(`/tickets/orders?publicationId=${publicationId}&limit=100`)
      .then((data) => setOrders(data.orders));
  }, [publicationId, tab]);
  const save = async (override?: any) => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        ...override,
        startsAt: form.startsAt
          ? new Date(form.startsAt).toISOString()
          : undefined,
        endsAt: form.endsAt
          ? new Date(form.endsAt).toISOString()
          : publicationId
            ? null
            : undefined,
      };
      const result = publicationId
        ? await api.patch<{ publication: Publication }>(
            `/tickets/publications/${publicationId}`,
            payload,
          )
        : await api.post<{ publication: Publication }>(
            "/tickets/publications",
            payload,
          );
      showToast({ message: "Cambios guardados.", variant: "success" });
      if (!publicationId)
        window.location.assign(
          `/admin/digital-tickets/publications/${result.publication._id}/edit`,
        );
      else {
        setPublication(result.publication);
        setForm((current: any) => ({
          ...current,
          ...result.publication,
          startsAt: toDateTimeLocal(result.publication.startsAt),
          endsAt: toDateTimeLocal(result.publication.endsAt),
          mapsUrl:
            result.publication.mapsUrl ??
            result.publication.location?.mapsUrl ??
            "",
          gallery: result.publication.gallery ?? [],
          appearance: result.publication.appearance ?? current.appearance,
          visibility: result.publication.visibility ?? current.visibility,
        }));
      }
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "No se pudo guardar.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };
  const addType = async () => {
    if (!publicationId) return;
    const name = `Nueva entrada ${types.length + 1}`;
    try {
      const result = await api.post<{ ticketType: TicketType }>(
        `/tickets/publications/${publicationId}/types`,
        {
          name,
          price: 0,
          capacity: Math.max(1, form.capacity),
          minPerOrder: 1,
          maxPerOrder: 8,
          status: "inactive",
        },
      );
      setTypes((current) => [...current, result.ticketType]);
      showToast({
        message: "Entrada creada. Completá sus datos y guardala.",
        variant: "success",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "No se pudo crear la entrada.",
        variant: "error",
      });
    }
  };
  const media = async (asset: UploadedAsset, cover = false) => {
    const next = cover
      ? { ...form, coverImage: asset.secureUrl }
      : { ...form, gallery: [...form.gallery, asset.secureUrl] };
    setForm(next);
    await save(
      cover ? { coverImage: asset.secureUrl } : { gallery: next.gallery },
    );
  };
  const tabs = [
    ["general", "General"],
    ["multimedia", "Multimedia"],
    ["date", "Fecha y ubicación"],
    ["types", "Entradas y precios"],
    ["buyers", "Compradores"],
    ["payments", "Pagos"],
    ["policies", "Políticas"],
    ["appearance", "Apariencia"],
    ["publish", "Publicación"],
  ];
  return (
    <section className="space-y-5">
      <PageHeader
        title={
          create
            ? "Nueva publicación"
            : publication?.title || "Editar publicación"
        }
        description="Configurá la experiencia de venta sin asociarla a un evento."
        action={
          <div className="flex gap-2">
            <Link href="/admin/digital-tickets">
              <Button variant="secondary">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Volver
              </Button>
            </Link>
            {publication?.slug ? (
              <Link href={`/entradas/${publication.slug}`} target="_blank">
                <Button variant="secondary">Vista previa</Button>
              </Link>
            ) : null}
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <aside className="flex gap-1 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-2 lg:flex-col">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm ${tab === key ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {label}
            </button>
          ))}
        </aside>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          {tab === "general" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium">
                Nombre interno
                <Input
                  className="mt-1.5"
                  value={form.internalName}
                  onChange={(e) =>
                    setForm({ ...form, internalName: e.target.value })
                  }
                />
              </label>
              <label className="text-sm font-medium">
                Título público
                <Input
                  className="mt-1.5"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label className="text-sm font-medium">
                Slug público
                <Input
                  className="mt-1.5"
                  value={form.slug}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      slug: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                    })
                  }
                />
              </label>
              <label className="text-sm font-medium">
                Categoría
                <Input
                  className="mt-1.5"
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                />
              </label>
              <label className="text-sm font-medium md:col-span-2">
                Descripción pública
                <Textarea
                  className="mt-1.5"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
            </div>
          ) : null}
          {tab === "multimedia" ? (
            <div className="space-y-5">
              <div>
                <h2 className="font-semibold">Imagen principal</h2>
                {form.coverImage ? (
                  <img
                    src={form.coverImage}
                    alt="Portada"
                    className="mt-3 h-56 w-full rounded-xl object-cover"
                  />
                ) : (
                  <p className="mt-2 text-sm text-zinc-500">
                    Todavía no hay una imagen principal.
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <CloudinaryUpload
                    context="tickets"
                    accept="image/*"
                    label="Subir o reemplazar portada"
                    onUploaded={(asset) => media(asset, true)}
                  />
                  {form.coverImage ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setForm({ ...form, coverImage: "" });
                        void save({ coverImage: "" });
                      }}
                    >
                      Eliminar portada
                    </Button>
                  ) : null}
                </div>
              </div>
              <div>
                <h2 className="font-semibold">Galería de imágenes y videos</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {form.gallery.map((url: string) => (
                    <div
                      key={url}
                      className="relative overflow-hidden rounded-xl border"
                    >
                      <img
                        src={url}
                        alt="Galería"
                        className="h-32 w-full object-cover"
                      />
                      <Button
                        variant="danger"
                        className="absolute right-2 top-2 px-2 py-1"
                        onClick={() => {
                          const gallery = form.gallery.filter(
                            (item: string) => item !== url,
                          );
                          setForm({ ...form, gallery });
                          void save({ gallery });
                        }}
                      >
                        Eliminar
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <CloudinaryUpload
                    context="tickets"
                    accept="image/*,video/*"
                    multiple
                    label="Agregar imágenes o video"
                    onUploadedBatch={async (assets) => {
                      const gallery = [
                        ...form.gallery,
                        ...assets.map((asset) => asset.secureUrl),
                      ];
                      setForm({ ...form, gallery });
                      await save({ gallery });
                    }}
                  />
                </div>
              </div>
            </div>
          ) : null}
          {tab === "date" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium">
                Fecha y hora de inicio
                <Input
                  className="mt-1.5"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) =>
                    setForm({ ...form, startsAt: e.target.value })
                  }
                />
              </label>
              <label className="text-sm font-medium">
                Fecha y hora de finalización{" "}
                <span className="font-normal text-zinc-500">(opcional)</span>
                <Input
                  className="mt-1.5"
                  type="datetime-local"
                  value={form.endsAt}
                  min={form.startsAt || undefined}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                />
              </label>
              <NumberField
                label="Cupo total"
                min={0}
                value={form.capacity}
                onChange={(e) =>
                  setForm({ ...form, capacity: Number(e.target.value) })
                }
              />
              <label className="text-sm font-medium">
                Nombre del lugar
                <Input
                  className="mt-1.5"
                  value={form.venueName}
                  onChange={(e) =>
                    setForm({ ...form, venueName: e.target.value })
                  }
                />
              </label>
              <label className="text-sm font-medium">
                Dirección
                <Input
                  className="mt-1.5"
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                />
              </label>
              <label className="text-sm font-medium md:col-span-2">
                URL de Google Maps
                <Input
                  className="mt-1.5"
                  type="url"
                  value={form.mapsUrl}
                  onChange={(e) =>
                    setForm({ ...form, mapsUrl: e.target.value })
                  }
                  placeholder="https://www.google.com/maps/..."
                />
              </label>
              {form.mapsUrl ? (
                <iframe
                  className="h-72 w-full rounded-xl border md:col-span-2"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(form.address || form.venueName)}&z=15&output=embed`}
                  title="Mapa del lugar"
                />
              ) : null}
            </div>
          ) : null}
          {tab === "types" ? (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">Tipos de entrada</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Cada entrada se edita individualmente antes de activar su
                    venta.
                  </p>
                </div>
                <Button
                  onClick={() => void addType()}
                  disabled={!publicationId}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar entrada
                </Button>
              </div>
              <div className="mt-5 space-y-3">
                {types.map((type) => (
                  <EditableTicketType
                    key={type._id}
                    type={type}
                    publicationId={publicationId!}
                    onChanged={(updated) =>
                      setTypes((current) =>
                        updated
                          ? current.map((item) =>
                              item._id === updated._id ? updated : item,
                            )
                          : current,
                      )
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
          {tab === "buyers" || tab === "payments" ? (
            <div>
              <h2 className="font-semibold">
                {tab === "buyers"
                  ? "Compradores de esta publicación"
                  : "Pagos y devoluciones"}
              </h2>
              <div className="mt-4 space-y-3">
                {orders.map((order) => (
                  <Link
                    key={order._id}
                    href={`/admin/digital-tickets/orders/${order._id}`}
                    className="flex justify-between rounded-xl border p-4 hover:bg-zinc-50"
                  >
                    <span>
                      <b>
                        {tab === "buyers" ? order.buyer.name : order.publicId}
                      </b>
                      <small className="ml-2 text-zinc-500">
                        {order.buyer.email}
                      </small>
                    </span>
                    <span>
                      {tab === "buyers" ? order.status : order.paymentStatus}
                    </span>
                  </Link>
                ))}
                {!orders.length ? (
                  <p className="rounded-xl bg-zinc-50 p-6 text-sm text-zinc-500">
                    No hay órdenes todavía.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          {tab === "policies" ? (
            <div className="grid gap-4">
              <label className="text-sm font-medium">
                Términos y condiciones
                <Textarea
                  className="mt-1.5"
                  value={form.termsAndConditions}
                  onChange={(e) =>
                    setForm({ ...form, termsAndConditions: e.target.value })
                  }
                />
              </label>
              <label className="text-sm font-medium">
                Política de cancelación
                <Textarea
                  className="mt-1.5"
                  value={form.cancellationPolicy}
                  onChange={(e) =>
                    setForm({ ...form, cancellationPolicy: e.target.value })
                  }
                />
              </label>
              <label className="text-sm font-medium">
                Política de reembolsos
                <Textarea
                  className="mt-1.5"
                  value={form.refundPolicy}
                  onChange={(e) =>
                    setForm({ ...form, refundPolicy: e.target.value })
                  }
                />
              </label>
            </div>
          ) : null}
          {tab === "appearance" ? (
            <div>
              <h2 className="font-semibold">Apariencia pública</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {[
                  ["primaryColor", "Color principal"],
                  ["secondaryColor", "Color secundario"],
                  ["backgroundColor", "Color de fondo"],
                  ["textColor", "Color de texto"],
                ].map(([key, label]) => (
                  <label key={key} className="text-sm font-medium">
                    {label}
                    <Input
                      className="mt-1.5 h-11"
                      type="color"
                      value={form.appearance[key]}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          appearance: {
                            ...form.appearance,
                            [key]: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div
                className="mt-5 rounded-xl p-6"
                style={{
                  background: form.appearance.backgroundColor,
                  color: form.appearance.textColor,
                }}
              >
                <p className="text-xs">VISTA PREVIA</p>
                <p
                  className="mt-2 text-2xl font-semibold"
                  style={{ color: form.appearance.primaryColor }}
                >
                  {form.title || "Tu publicación"}
                </p>
                <Button
                  className="mt-4"
                  style={{
                    background: form.appearance.secondaryColor,
                    color: "#111",
                  }}
                >
                  Comprar entradas
                </Button>
              </div>
            </div>
          ) : null}
          {tab === "publish" ? (
            <div className="space-y-5">
              <h2 className="font-semibold">Publicación y visibilidad</h2>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.visibility?.isPublic ?? false}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      visibility: {
                        ...form.visibility,
                        isPublic: e.target.checked,
                      },
                    })
                  }
                />
                Visible públicamente
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.visibility?.showInPublicCatalog ?? false}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      visibility: {
                        ...form.visibility,
                        showInPublicCatalog: e.target.checked,
                      },
                    })
                  }
                />
                Mostrar en catálogo de entradas
              </label>
              <div className="flex gap-2">
                <Button onClick={() => void save()}>Guardar visibilidad</Button>
                {publicationId ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void api
                        .post(
                          `/tickets/publications/${publicationId}/${publication?.status === "active" ? "pause" : "activate"}`,
                          {},
                        )
                        .then(() => {
                          showToast({
                            message: "Estado actualizado.",
                            variant: "success",
                          });
                          void load();
                        })
                        .catch((error) =>
                          showToast({
                            message: error.message,
                            variant: "error",
                          }),
                        )
                    }
                  >
                    {publication?.status === "active"
                      ? "Pausar venta"
                      : "Activar venta"}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
