'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { TableActionButton } from '@/components/admin/table-action-button';
import { Button, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';
import { displayLabel, leadSourceLabels, leadStatusLabels } from '@/lib/display-labels';

type Lead = {
  _id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email?: string;
  alternativePhone?: string;
  eventType: string;
  eventDate?: string;
  salonId: string;
  salonIds?: string[];
  status: string;
  source: string;
  guestCount: number;
  message?: string;
  notes?: string;
};

type Salon = { _id: string; name: string };
type Meta = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
};

type Filters = {
  query: string;
  status: string;
  source: string;
  salonId: string;
  limit: number;
  page: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
};

const initialMeta: Meta = {
  page: 1,
  limit: 10,
  totalItems: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

const initialFilters: Filters = {
  query: '',
  status: '',
  source: '',
  salonId: '',
  limit: 10,
  page: 1,
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

function formatDate(value?: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(
    new Date(`${value.slice(0, 10)}T12:00:00`),
  );
}

function dateForInput(value?: string): string {
  return value?.slice(0, 10) ?? '';
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function LeadBadge({ value, type }: { value: string; type: 'status' | 'source' }) {
  const label = displayLabel(type === 'status' ? leadStatusLabels : leadSourceLabels, value);
  const colors =
    type === 'status'
      ? {
          new: 'bg-sky-50 text-sky-700 ring-sky-600/20',
          contacted: 'bg-violet-50 text-violet-700 ring-violet-600/20',
          follow_up: 'bg-amber-50 text-amber-700 ring-amber-600/20',
          quote_sent: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
          negotiation: 'bg-orange-50 text-orange-700 ring-orange-600/20',
          won: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
          lost: 'bg-rose-50 text-rose-700 ring-rose-600/20',
          converted: 'bg-teal-50 text-teal-700 ring-teal-600/20',
        }
      : {
          web_form: 'bg-zinc-100 text-zinc-700 ring-zinc-500/20',
          quick_quote: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20',
          whatsapp: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
          manual: 'bg-zinc-100 text-zinc-700 ring-zinc-500/20',
          promotion: 'bg-yellow-50 text-yellow-800 ring-yellow-600/20',
          ticket: 'bg-blue-50 text-blue-700 ring-blue-600/20',
          invitation: 'bg-purple-50 text-purple-700 ring-purple-600/20',
          other: 'bg-zinc-100 text-zinc-700 ring-zinc-500/20',
        };
  const color = colors[value as keyof typeof colors] ?? 'bg-zinc-100 text-zinc-700 ring-zinc-500/20';

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${color}`}>{label}</span>;
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

export default function LeadsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<Lead[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [meta, setMeta] = useState<Meta>(initialMeta);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [searchInput, setSearchInput] = useState('');
  const [formLead, setFormLead] = useState<Lead | null | undefined>();
  const [selectedSalonIds, setSelectedSalonIds] = useState<string[]>([]);
  const [remove, setRemove] = useState<Lead | null>(null);
  const setMessage = (value: string) => {
    if (!value) return;
    const isSuccess = /correctamente|generada|creado|creada|actualizado|actualizada|eliminado|eliminada/i.test(value);
    showToast({ message: value, variant: isSuccess ? 'success' : 'error' });
  };
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(filters.page),
      limit: String(filters.limit),
      q: filters.query,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });
    if (filters.status) params.set('status', filters.status);
    if (filters.source) params.set('source', filters.source);
    if (filters.salonId) params.set('salonId', filters.salonId);

    const result = await api.get<{ items: Lead[]; meta: Meta }>(`/leads?${params.toString()}`);
    setItems(result.items);
    setMeta(result.meta);
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => (current.query === searchInput ? current : { ...current, query: searchInput, page: 1 }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  useEffect(() => {
    void api
      .get<{ salons: Salon[] }>('/salons')
      .then((result) => setSalons(result.salons))
      .catch((error: Error) => setMessage(error.message));
  }, []);

  const salonNames = useMemo(() => new Map(salons.map((salon) => [salon._id, salon.name])), [salons]);
  const visibleMetrics = useMemo(
    () => ({
      new: items.filter((lead) => lead.status === 'new').length,
      open: items.filter((lead) => ['contacted', 'follow_up', 'quote_sent', 'negotiation'].includes(lead.status)).length,
      dated: items.filter((lead) => Boolean(lead.eventDate)).length,
    }),
    [items],
  );

  function updateFilters(change: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...change, page: change.page ?? 1 }));
  }

  function toggleSort(sortBy: string) {
    setFilters((current) => ({
      ...current,
      page: 1,
      sortBy,
      sortOrder: current.sortBy === sortBy && current.sortOrder === 'asc' ? 'desc' : 'asc',
    }));
  }

  function openCreateModal() {
    setMessage('');
    setSelectedSalonIds([]);
    setFormLead(null);
  }

  function openEditModal(lead: Lead) {
    setMessage('');
    setSelectedSalonIds((lead.salonIds?.length ? lead.salonIds : [lead.salonId]).map(String));
    setFormLead(lead);
  }

  function getLeadSalonNames(lead: Lead): string {
    const ids = lead.salonIds?.length ? lead.salonIds : [lead.salonId];
    return ids.map(String).map((id) => salonNames.get(id)).filter(Boolean).join(', ') || 'Sin salón asignado';
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedSalonIds.length === 0) {
      setMessage('Seleccioná al menos un salón para continuar.');
      return;
    }

    setSaving(true);
    const data = new FormData(event.currentTarget);
    const body = {
      firstName: String(data.get('firstName') ?? ''),
      lastName: String(data.get('lastName') ?? ''),
      phone: String(data.get('phone') ?? ''),
      email: String(data.get('email') ?? ''),
      alternativePhone: String(data.get('alternativePhone') ?? ''),
      eventType: String(data.get('eventType') ?? ''),
      eventDate: String(data.get('eventDate') ?? '') || undefined,
      guestCount: Number(data.get('guestCount')),
      salonId: selectedSalonIds[0],
      salonIds: selectedSalonIds,
      source: String(data.get('source') ?? 'manual'),
      message: String(data.get('message') ?? ''),
      notes: String(data.get('notes') ?? ''),
    };

    try {
      if (formLead) await api.patch(`/leads/${formLead._id}`, body);
      else await api.post('/leads', body);
      setFormLead(undefined);
      setMessage(formLead ? 'Lead actualizado correctamente.' : 'Lead creado correctamente.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron guardar los cambios.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteLead() {
    if (!remove) return;
    setDeleting(true);
    try {
      await api.delete(`/leads/${remove._id}`);
      setRemove(null);
      setMessage('Lead eliminado correctamente.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo eliminar el lead.');
    } finally {
      setDeleting(false);
    }
  }

  async function fetchAllFilteredLeads(): Promise<Lead[]> {
    const all: Lead[] = [];
    let page = 1;
    let next = true;

    while (next) {
      const params = new URLSearchParams({
        page: String(page),
        limit: '100',
        q: filters.query,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      });
      if (filters.status) params.set('status', filters.status);
      if (filters.source) params.set('source', filters.source);
      if (filters.salonId) params.set('salonId', filters.salonId);
      const result = await api.get<{ items: Lead[]; meta: Meta }>(`/leads?${params.toString()}`);
      all.push(...result.items);
      next = result.meta.hasNextPage;
      page += 1;
    }

    return all;
  }

  function exportRows(leads: Lead[]): string[][] {
    return [
      ['Nombre', 'Teléfono', 'Email', 'Evento', 'Fecha estimativa', 'Personas', 'Salones', 'Estado', 'Origen'],
      ...leads.map((lead) => [
        lead.fullName,
        lead.phone,
        lead.email ?? '',
        lead.eventType,
        formatDate(lead.eventDate),
        String(lead.guestCount),
        getLeadSalonNames(lead),
        displayLabel(leadStatusLabels, lead.status),
        displayLabel(leadSourceLabels, lead.source),
      ]),
    ];
  }

  function downloadFile(content: BlobPart, type: string, extension: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `leads-${new Date().toISOString().slice(0, 10)}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function buildReport(rows: string[][]): string {
    const escape = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const header = rows[0].map((cell) => `<th>${escape(cell)}</th>`).join('');
    const body = rows.slice(1).map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Reporte de Leads</title><style>@page{size:landscape;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#18181b}h1{font-size:20px;margin:0 0 4px}.meta{color:#52525b;font-size:11px;margin:0 0 16px}table{border-collapse:collapse;width:100%;font-size:10px}th{background:#18181b;color:white;text-align:left;padding:8px}td{border-bottom:1px solid #e4e4e7;padding:7px;vertical-align:top}tr:nth-child(even) td{background:#fafafa}</style></head><body><h1>Reporte de Leads</h1><p class="meta">M&M Eventos · ${escape(new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeStyle:'short'}).format(new Date()))}</p><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  }

  async function exportLeads(exportFormat: 'csv' | 'excel' | 'word' | 'pdf') {
    setExporting(true);
    try {
      const leads = await fetchAllFilteredLeads();
      const rows = exportRows(leads);
      const report = buildReport(rows);

      if (exportFormat === 'csv') {
        downloadFile(`\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\n')}`, 'text/csv;charset=utf-8', 'csv');
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
      setMessage('Exportación generada correctamente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo exportar el listado.');
    } finally {
      setExporting(false);
    }
  }

  const columns: { key: string; label: string; sortable?: boolean }[] = [
    { key: 'fullName', label: 'Nombre', sortable: true },
    { key: 'phone', label: 'Teléfono', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'eventType', label: 'Evento', sortable: true },
    { key: 'eventDate', label: 'Fecha estimativa', sortable: true },
    { key: 'guestCount', label: 'Personas', sortable: true },
    { key: 'status', label: 'Estado', sortable: true },
    { key: 'source', label: 'Origen', sortable: true },
  ];

  return (
    <section className="space-y-6">
      <PageHeader
        title="Leads (posibles clientes)"
        description="Consultas y oportunidades comerciales."
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
                  {([['csv', 'CSV'], ['excel', 'Excel'], ['word', 'Word'], ['pdf', 'PDF']] as const).map(([format, label]) => <DropdownMenu.Item key={format} onSelect={() => { setExportMenuOpen(false); void exportLeads(format); }} className="cursor-pointer rounded-lg px-3 py-2 text-sm text-zinc-700 outline-none hover:bg-zinc-100 focus:bg-zinc-100">Descargar en {label}</DropdownMenu.Item>)}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <Button onClick={openCreateModal}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo lead
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Leads registrados" value={meta.totalItems} icon={Users} detail="Según los filtros aplicados" />
        <MetricCard label="Nuevos" value={visibleMetrics.new} icon={Plus} detail="En la página actual" />
        <MetricCard label="En gestión" value={visibleMetrics.open} icon={MessageCircle} detail="En la página actual" />
        <MetricCard label="Con fecha estimativa" value={visibleMetrics.dated} icon={CalendarDays} detail="En la página actual" />
      </div>

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_repeat(4,auto)]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="h-11 pl-10" placeholder="Buscar por nombre, teléfono, email o evento…" />
          </div>
          <Select aria-label="Filtrar por estado" value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })} className="h-11 min-w-40">
            <option value="">Todos los estados</option>
            {Object.entries(leadStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Select aria-label="Filtrar por origen" value={filters.source} onChange={(event) => updateFilters({ source: event.target.value })} className="h-11 min-w-40">
            <option value="">Todos los orígenes</option>
            {Object.entries(leadSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Select aria-label="Filtrar por salón" value={filters.salonId} onChange={(event) => updateFilters({ salonId: event.target.value })} className="h-11 min-w-40">
            <option value="">Todos los salones</option>
            {salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}
          </Select>
          <Select aria-label="Cantidad de filas por página" value={filters.limit} onChange={(event) => updateFilters({ limit: Number(event.target.value) })} className="h-11 min-w-32">
            {[10, 25, 50, 100].map((amount) => <option key={amount} value={amount}>{amount} por página</option>)}
          </Select>
        </div>
      </div>


      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-500">
              <tr>
                {columns.map((column) => (
                  <th key={column.key} scope="col" className="whitespace-nowrap px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide">
                    {column.sortable ? (
                      <button type="button" onClick={() => toggleSort(column.key)} className="inline-flex items-center gap-1.5 rounded text-left hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-900/15">
                        {column.label}
                        {filters.sortBy === column.key ? filters.sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-zinc-900" /> : <ArrowDown className="h-3.5 w-3.5 text-zinc-900" /> : <ArrowUpDown className="h-3.5 w-3.5 text-zinc-400" />}
                      </button>
                    ) : column.label}
                  </th>
                ))}
                <th scope="col" className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {items.map((lead) => (
                <tr key={lead._id} className="transition-colors hover:bg-amber-50/35">
                  <td className="px-5 py-4 font-semibold text-zinc-900">{lead.fullName}</td>
                  <td className="px-5 py-4 text-zinc-700">{lead.phone}</td>
                  <td className="px-5 py-4 text-zinc-600">{lead.email || '—'}</td>
                  <td className="px-5 py-4 text-zinc-700">{lead.eventType}</td>
                  <td className="px-5 py-4 whitespace-nowrap text-zinc-700">{formatDate(lead.eventDate)}</td>
                  <td className="px-5 py-4 text-zinc-700">{lead.guestCount || '—'}</td>
                  <td className="px-5 py-4"><LeadBadge type="status" value={lead.status} /></td>
                  <td className="px-5 py-4"><LeadBadge type="source" value={lead.source} /></td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-0.5">
                      <TableActionButton icon={Eye} label="Ver detalle" onClick={() => router.push(`/admin/leads/${lead._id}`)} />
                      <TableActionButton icon={Pencil} label="Editar lead" onClick={() => openEditModal(lead)} />
                      {lead.email && <TableActionButton icon={Mail} label="Enviar email" onClick={() => { window.location.href = `mailto:${lead.email}?subject=Consulta%20M%26M%20Eventos`; }} />}
                      <TableActionButton icon={MessageCircle} label="Enviar WhatsApp" onClick={() => window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer')} />
                      <TableActionButton icon={Trash2} label="Eliminar lead" onClick={() => setRemove(lead)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 && (
          <div className="grid place-items-center px-6 py-16 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-500"><Users className="h-6 w-6" /></span>
            <h2 className="mt-4 font-semibold text-zinc-900">No encontramos leads</h2>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">Probá ajustar la búsqueda o los filtros para ver otros resultados.</p>
          </div>
        )}
      </div>

      <footer className="flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="text-zinc-600">Mostrando <strong className="font-semibold text-zinc-950">{items.length}</strong> de <strong className="font-semibold text-zinc-950">{meta.totalItems}</strong> leads</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="px-3" disabled={!meta.hasPreviousPage} onClick={() => updateFilters({ page: meta.page - 1 })}><ChevronLeft className="h-4 w-4" /><span className="sr-only">Anterior</span></Button>
          <span className="min-w-28 text-center text-zinc-600">Página {meta.page} de {meta.totalPages}</span>
          <Button variant="secondary" className="px-3" disabled={!meta.hasNextPage} onClick={() => updateFilters({ page: meta.page + 1 })}><ChevronRight className="h-4 w-4" /><span className="sr-only">Siguiente</span></Button>
        </div>
      </footer>

      <Modal open={formLead !== undefined} onClose={() => setFormLead(undefined)} title={formLead ? 'Editar lead' : 'Nuevo lead'} description={formLead ? 'Actualizá la información comercial del lead.' : 'Cargá una nueva consulta comercial.'}>
        <form key={formLead?._id ?? 'new'} onSubmit={save} className="grid gap-5 p-6 md:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium text-zinc-700">Nombre<Input required name="firstName" defaultValue={formLead?.firstName ?? ''} placeholder="Nombre" /></label>
          <label className="space-y-1.5 text-sm font-medium text-zinc-700">Apellido<Input required name="lastName" defaultValue={formLead?.lastName ?? ''} placeholder="Apellido" /></label>
          <label className="space-y-1.5 text-sm font-medium text-zinc-700">Teléfono<Input required name="phone" defaultValue={formLead?.phone ?? ''} placeholder="Ej. 221 555 1234" /></label>
          <label className="space-y-1.5 text-sm font-medium text-zinc-700">Teléfono alternativo<Input name="alternativePhone" defaultValue={formLead?.alternativePhone ?? ''} placeholder="Opcional" /></label>
          <label className="space-y-1.5 text-sm font-medium text-zinc-700">Email<Input name="email" type="email" defaultValue={formLead?.email ?? ''} placeholder="nombre@email.com" /></label>
          <label className="space-y-1.5 text-sm font-medium text-zinc-700">Origen<Select name="source" defaultValue={formLead?.source ?? 'manual'}>{Object.entries(leadSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
          <label className="space-y-1.5 text-sm font-medium text-zinc-700">Tipo de evento<Input required name="eventType" defaultValue={formLead?.eventType ?? ''} placeholder="Ej. Casamiento" /></label>
          <label className="space-y-1.5 text-sm font-medium text-zinc-700">Fecha estimativa del evento<Input name="eventDate" type="date" defaultValue={dateForInput(formLead?.eventDate)} /></label>
          <label className="space-y-1.5 text-sm font-medium text-zinc-700">Cantidad de personas<Input required min="1" name="guestCount" type="number" defaultValue={formLead?.guestCount ?? ''} placeholder="Ej. 120" /></label>
          <div className="md:col-span-2">
            <label className="space-y-1.5 text-sm font-medium text-zinc-700">Salones de interés
              <Select multiple required aria-label="Salones de interés" value={selectedSalonIds} onChange={(event) => setSelectedSalonIds(Array.from(event.currentTarget.selectedOptions, (option) => option.value))} className="min-h-32 py-2">
                {salons.map((salon) => <option key={salon._id} value={salon._id}>{salon.name}</option>)}
              </Select>
            </label>
            <p className="mt-1.5 text-xs text-zinc-500">Mantené presionada la tecla Ctrl o Cmd para seleccionar más de un salón.</p>
          </div>
          <label className="space-y-1.5 text-sm font-medium text-zinc-700 md:col-span-2">Mensaje<Textarea name="message" defaultValue={formLead?.message ?? ''} placeholder="Consulta inicial del lead" /></label>
          <label className="space-y-1.5 text-sm font-medium text-zinc-700 md:col-span-2">Notas internas<Textarea name="notes" defaultValue={formLead?.notes ?? ''} placeholder="Información útil para el equipo" /></label>
          <footer className="flex justify-end gap-3 border-t border-zinc-100 pt-5 md:col-span-2">
            <Button type="button" variant="secondary" onClick={() => setFormLead(undefined)}>Cancelar</Button>
            <Button disabled={saving}>{saving ? 'Guardando…' : 'Guardar lead'}</Button>
          </footer>
        </form>
      </Modal>

      <Modal open={Boolean(remove)} onClose={() => setRemove(null)} title="Eliminar lead" description="Esta acción eliminará el lead del listado, pero conservará el registro internamente.">
        <div className="p-6">
          <footer className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setRemove(null)}>Cancelar</Button>
            <Button variant="danger" disabled={deleting} onClick={() => void deleteLead()}>{deleting ? 'Eliminando…' : 'Eliminar'}</Button>
          </footer>
        </div>
      </Modal>
    </section>
  );
}
