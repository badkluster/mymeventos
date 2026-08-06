'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Mail,
  MessageCircle,
  Plus,
  ReceiptText,
  Search,
  UserRound,
  Users,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { api } from '@/lib/api';
import { Button, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { TableActionButton } from '@/components/admin/table-action-button';
import { useToast } from '@/components/ui/toast-provider';
import { formatCivilDate } from '@/lib/dates';
import type { Customer, PaginationMeta, Salon } from '@/features/quotes/types';

type ListResponse = { items?: Customer[]; meta?: Partial<PaginationMeta> };

// `formatCivilDate` distingue fecha civil (eventDate) de instante real (createdAt) mirando la
// forma del valor — esta columna mezcla ambas según si el cliente tiene un próximo evento.
const formatDate = (value?: string) => value ? formatCivilDate(value, 'Sin fecha', 'medium') : 'Sin fecha';
const customerName = (customer: Customer) => customer.fullName || [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Cliente sin nombre';

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function normalize(response: ListResponse): { items: Customer[]; meta: PaginationMeta } {
  const items = response.items ?? [];
  const source = response.meta ?? {};
  const totalItems = source.totalItems ?? items.length;
  const limit = source.limit ?? 20;
  const page = source.page ?? 1;
  const totalPages = source.totalPages ?? Math.max(1, Math.ceil(totalItems / limit));
  return { items, meta: { page, limit, totalItems, totalPages, hasNextPage: source.hasNextPage ?? page < totalPages, hasPreviousPage: source.hasPreviousPage ?? page > 1 } };
}

function MetricCard({ label, value, icon: Icon, detail }: { label: string; value: number; icon: typeof Users; detail: string }) {
  return (
    <article className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{value}</p>
          <p className="mt-2 text-xs text-zinc-500">{detail}</p>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </article>
  );
}

export default function CustomersPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Customer[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ page: 1, limit: 20, query: '', salonId: '' });
  const [searchInput, setSearchInput] = useState('');
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 20, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false });
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSalonIds, setSelectedSalonIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const notice = (message: string) => message && showToast({ message, variant: 'error' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit), search: filters.query });
      if (filters.salonId) query.set('salonId', filters.salonId);
      const response = normalize(await api.get<ListResponse>(`/customers?${query.toString()}`));
      setItems(response.items);
      setMeta(response.meta);
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudieron cargar los clientes.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // La pantalla debe sincronizar datos con filtros y paginación.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => ({ ...current, page: 1, query: searchInput.trim() })), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    void api.get<{ salons: Salon[] }>('/salons').then((result) => setSalons(result.salons)).catch((error: Error) => notice(error.message));
  }, []);

  const updateFilters = (changes: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...changes, page: changes.page ?? 1 }));
  const openWhatsApp = (customer: Customer) => {
    if (!customer.phone) return notice('El cliente no tiene teléfono.');
    window.open(`https://wa.me/${customer.phone.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer');
  };

  const visibleMetrics = useMemo(() => {
    const now = new Date();
    return {
      newThisMonth: items.filter((customer) => {
        if (!customer.createdAt) return false;
        const created = new Date(customer.createdAt);
        return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
      }).length,
      withEvents: items.filter((customer) => (customer.eventCount ?? 0) > 0).length,
      withQuotes: items.filter((customer) => (customer.quoteCount ?? 0) > 0).length,
    };
  }, [items]);

  function openCreateModal() {
    setSelectedSalonIds([]);
    setCreateOpen(true);
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedSalonIds.length === 0) {
      notice('Seleccioná al menos un salón para continuar.');
      return;
    }

    setSaving(true);
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? '').trim() || undefined;
    const body = {
      firstName: value('firstName'),
      lastName: value('lastName'),
      phone: value('phone'),
      email: value('email'),
      documentNumber: value('documentNumber'),
      address: value('address'),
      occupation: value('occupation'),
      birthDate: value('birthDate'),
      notes: value('notes'),
      salonIds: selectedSalonIds,
    };

    try {
      await api.post('/customers', body);
      setCreateOpen(false);
      showToast({ message: 'Cliente creado correctamente.', variant: 'success' });
      await load();
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo crear el cliente.');
    } finally {
      setSaving(false);
    }
  }

  async function fetchAllFilteredCustomers(): Promise<Customer[]> {
    const all: Customer[] = [];
    let page = 1;
    let next = true;

    while (next) {
      const params = new URLSearchParams({ page: String(page), limit: '100', search: filters.query });
      if (filters.salonId) params.set('salonId', filters.salonId);
      const result = normalize(await api.get<ListResponse>(`/customers?${params.toString()}`));
      all.push(...result.items);
      next = result.meta.hasNextPage;
      page += 1;
    }

    return all;
  }

  function exportRows(customers: Customer[]): string[][] {
    return [
      ['Nombre', 'Teléfono', 'Email', 'Documento', 'Presupuestos', 'Eventos', 'Última actividad', 'Cliente desde'],
      ...customers.map((customer) => [
        customerName(customer),
        customer.phone ?? '',
        customer.email ?? '',
        customer.documentNumber ?? '',
        String(customer.quoteCount ?? 0),
        String(customer.eventCount ?? 0),
        formatDate(customer.lastEvent?.eventDate ?? customer.createdAt),
        formatDate(customer.createdAt),
      ]),
    ];
  }

  function downloadFile(content: BlobPart, type: string, extension: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `clientes-${new Date().toISOString().slice(0, 10)}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function buildReport(rows: string[][]): string {
    const escape = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const header = rows[0].map((cell) => `<th>${escape(cell)}</th>`).join('');
    const body = rows.slice(1).map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Reporte de Clientes</title><style>@page{size:landscape;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#18181b}h1{font-size:20px;margin:0 0 4px}.meta{color:#52525b;font-size:11px;margin:0 0 16px}table{border-collapse:collapse;width:100%;font-size:10px}th{background:#18181b;color:white;text-align:left;padding:8px}td{border-bottom:1px solid #e4e4e7;padding:7px;vertical-align:top}tr:nth-child(even) td{background:#fafafa}</style></head><body><h1>Reporte de Clientes</h1><p class="meta">M&M Eventos · ${escape(new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeStyle:'short'}).format(new Date()))}</p><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  }

  async function exportCustomers(exportFormat: 'csv' | 'excel' | 'word' | 'pdf') {
    setExporting(true);
    try {
      const customers = await fetchAllFilteredCustomers();
      const rows = exportRows(customers);
      const report = buildReport(rows);

      if (exportFormat === 'csv') {
        downloadFile(`﻿${rows.map((row) => row.map(csvCell).join(';')).join('\n')}`, 'text/csv;charset=utf-8', 'csv');
      } else if (exportFormat === 'excel') {
        downloadFile(report, 'application/vnd.ms-excel', 'xls');
      } else if (exportFormat === 'word') {
        downloadFile(report, 'application/msword', 'doc');
      } else {
        const printable = window.open('', '_blank');
        if (!printable) throw new Error('El navegador bloqueó la ventana de impresión.');
        printable.document.write(report);
        printable.document.close();
        printable.addEventListener('load', () => { printable.focus(); printable.print(); }, { once: true });
      }
      showToast({ message: 'Exportación generada correctamente.', variant: 'success' });
    } catch (error) {
      notice(error instanceof Error ? error.message : 'No se pudo exportar el listado.');
    } finally {
      setExporting(false);
    }
  }

  return <section className="space-y-6">
    <PageHeader
      title="Clientes"
      description="Clientes consolidados con historial comercial, presupuestos y eventos."
      action={
        <div className="flex flex-wrap gap-2">
          <DropdownMenu.Root open={exportMenuOpen} onOpenChange={setExportMenuOpen}>
            <DropdownMenu.Trigger asChild>
              <Button variant="secondary" disabled={exporting}>
                <Download className="mr-2 h-4 w-4" />
                {exporting ? 'Exportando…' : 'Exportar'}
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="start" sideOffset={8} className="z-50 min-w-48 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl">
                {([['csv', 'CSV'], ['excel', 'Excel'], ['word', 'Word'], ['pdf', 'PDF']] as const).map(([format, label]) => <DropdownMenu.Item key={format} onSelect={() => { setExportMenuOpen(false); void exportCustomers(format); }} className="cursor-pointer rounded-lg px-3 py-2 text-sm text-zinc-700 outline-none hover:bg-zinc-100 focus:bg-zinc-100">Descargar en {label}</DropdownMenu.Item>)}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <Button onClick={openCreateModal}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo cliente
          </Button>
        </div>
      }
    />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Clientes registrados" value={meta.totalItems} icon={Users} detail="Según los filtros aplicados" />
      <MetricCard label="Nuevos este mes" value={visibleMetrics.newThisMonth} icon={Plus} detail="En la página actual" />
      <MetricCard label="Con eventos realizados" value={visibleMetrics.withEvents} icon={CalendarDays} detail="En la página actual" />
      <MetricCard label="Con presupuestos activos" value={visibleMetrics.withQuotes} icon={ReceiptText} detail="En la página actual" />
    </div>

    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="relative min-w-0"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="h-11 pl-10" placeholder="Buscar por nombre, teléfono o email..." /></div>
        <Select aria-label="Filtrar por salón" value={filters.salonId} onChange={(event) => updateFilters({ salonId: event.target.value })} className="h-11 min-w-40">
          <option value="">Todos los salones</option>
          {salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}
        </Select>
        <Select aria-label="Cantidad de filas por página" value={filters.limit} onChange={(event) => updateFilters({ limit: Number(event.target.value) })} className="h-11 min-w-32">{[10, 20, 50].map((item) => <option key={item} value={item}>{item} por página</option>)}</Select>
      </div>
    </div>
    <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-sm"><thead className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-500"><tr>{['Cliente', 'Teléfono', 'Email', 'Eventos', 'Presupuestos', 'Última actividad', 'Estado'].map((label) => <th key={label} className="whitespace-nowrap px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">{label}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-100">{items.map((customer) => <tr key={customer._id} className="transition-colors hover:bg-amber-50/35"><td className="px-5 py-4 font-medium text-zinc-900">{customerName(customer)}</td><td className="px-5 py-4 text-zinc-700">{customer.phone || 'No informado'}</td><td className="px-5 py-4 text-zinc-700">{customer.email || 'No informado'}</td><td className="px-5 py-4 text-zinc-700">{customer.eventCount ?? 0}</td><td className="px-5 py-4 text-zinc-700">{customer.quoteCount ?? 0}</td><td className="px-5 py-4 text-zinc-700">{formatDate(customer.lastEvent?.eventDate ?? customer.createdAt)}</td><td className="px-5 py-4"><span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Activo</span></td><td className="px-5 py-4"><div className="flex justify-end gap-0.5"><Link href={`/admin/customers/${customer._id}`}><TableActionButton icon={Eye} label="Ver cliente" /></Link><TableActionButton icon={MessageCircle} label="WhatsApp" onClick={() => openWhatsApp(customer)} />{customer.email ? <a href={`mailto:${customer.email}`}><TableActionButton icon={Mail} label="Email" /></a> : null}<Link href={`/admin/quotes?customerId=${customer._id}`}><TableActionButton icon={ReceiptText} label="Crear presupuesto" /></Link></div></td></tr>)}</tbody></table></div>
      {loading && <div className="px-6 py-12 text-center text-sm text-zinc-500">Cargando clientes...</div>}
      {!loading && items.length === 0 && <div className="grid place-items-center px-6 py-16 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-500"><UserRound className="h-6 w-6" /></span><h2 className="mt-4 font-semibold text-zinc-900">No hay clientes</h2><p className="mt-1 max-w-sm text-sm text-zinc-500">Los clientes aparecerán al convertir presupuestos o crearlos manualmente.</p></div>}
    </div>
    <footer className="flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-zinc-600">Mostrando <strong className="font-semibold text-zinc-950">{items.length}</strong> de <strong className="font-semibold text-zinc-950">{meta.totalItems}</strong></span><div className="flex items-center gap-2"><Button variant="secondary" className="px-3" disabled={!meta.hasPreviousPage} onClick={() => updateFilters({ page: meta.page - 1 })}><ChevronLeft className="h-4 w-4" /><span className="sr-only">Anterior</span></Button><span className="min-w-32 text-center text-zinc-600">Página {meta.page} de {meta.totalPages}</span><Button variant="secondary" className="px-3" disabled={!meta.hasNextPage} onClick={() => updateFilters({ page: meta.page + 1 })}><ChevronRight className="h-4 w-4" /><span className="sr-only">Siguiente</span></Button></div></footer>

    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo cliente" description="Cargá un cliente manualmente, sin pasar por un lead o presupuesto.">
      <form onSubmit={createCustomer} className="grid gap-5 p-6 md:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium text-zinc-700">Nombre<Input required name="firstName" placeholder="Nombre" /></label>
        <label className="space-y-1.5 text-sm font-medium text-zinc-700">Apellido<Input required name="lastName" placeholder="Apellido" /></label>
        <label className="space-y-1.5 text-sm font-medium text-zinc-700">Teléfono<Input name="phone" placeholder="Ej. 221 555 1234" /></label>
        <label className="space-y-1.5 text-sm font-medium text-zinc-700">Email<Input name="email" type="email" placeholder="nombre@email.com" /></label>
        <label className="space-y-1.5 text-sm font-medium text-zinc-700">Documento / DNI<Input name="documentNumber" placeholder="Opcional" /></label>
        <label className="space-y-1.5 text-sm font-medium text-zinc-700">Ocupación<Input name="occupation" placeholder="Opcional" /></label>
        <label className="space-y-1.5 text-sm font-medium text-zinc-700">Fecha de nacimiento<Input name="birthDate" type="date" /><span className="mt-1 block text-xs font-normal text-zinc-400">Opcional — habilita el saludo automático de cumpleaños.</span></label>
        <label className="space-y-1.5 text-sm font-medium text-zinc-700">Domicilio<Input name="address" placeholder="Opcional" /></label>
        <div className="md:col-span-2">
          <label className="space-y-1.5 text-sm font-medium text-zinc-700">Salones asociados
            <Select multiple required aria-label="Salones asociados" value={selectedSalonIds} onChange={(event) => setSelectedSalonIds(Array.from(event.currentTarget.selectedOptions, (option) => option.value))} className="min-h-32 py-2">
              {salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}
            </Select>
          </label>
          <p className="mt-1.5 text-xs text-zinc-500">Mantené presionada la tecla Ctrl o Cmd para seleccionar más de un salón.</p>
        </div>
        <label className="space-y-1.5 text-sm font-medium text-zinc-700 md:col-span-2">Notas internas<Textarea name="notes" placeholder="Información útil para el equipo" /></label>
        <footer className="flex justify-end gap-3 border-t border-zinc-100 pt-5 md:col-span-2">
          <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button disabled={saving}>{saving ? 'Guardando…' : 'Guardar cliente'}</Button>
        </footer>
      </form>
    </Modal>
  </section>;
}
