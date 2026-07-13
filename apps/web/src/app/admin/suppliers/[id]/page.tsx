'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Building2, Mail, MapPin, MessageCircle, Truck, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { displayLabel, supplierCategoryLabels } from '@/lib/display-labels';
import { Button, PageHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast-provider';

type Supplier = {
  _id: string;
  name: string;
  businessName?: string;
  taxId?: string;
  category: string;
  contactPerson?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  active?: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

type DetailResponse = { supplier: Supplier };

const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'No informado';
const cleanPhone = (value?: string) => value?.replace(/\D/g, '') ?? '';

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const supplierId = params?.id ?? '';
  const { showToast } = useToast();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<DetailResponse>(`/suppliers/${supplierId}`);
      setSupplier(response.supplier);
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'No se pudo cargar el proveedor.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showToast, supplierId]);

  useEffect(() => { if (supplierId) void load(); }, [load, supplierId]);

  if (loading) return <section className="space-y-6"><PageHeader title="Proveedor" description="Cargando detalle del proveedor..." /></section>;
  if (!supplier) return <section className="space-y-6"><Link href="/admin/suppliers" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-950"><ArrowLeft className="h-4 w-4" />Volver a Proveedores</Link><EmptyDetail /></section>;

  const whatsapp = cleanPhone(supplier.whatsapp || supplier.phone);
  return <section className="space-y-6 pb-8">
    <Link href="/admin/suppliers" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-950"><ArrowLeft className="h-4 w-4" />Volver a Proveedores</Link>
    <header className="rounded-3xl border border-zinc-200 bg-white px-6 py-6 shadow-sm md:px-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{supplier.name}</h1><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${supplier.active === false ? 'bg-zinc-100 text-zinc-700' : 'bg-emerald-50 text-emerald-700'}`}>{supplier.active === false ? 'Inactivo' : 'Activo'}</span></div>
          <p className="mt-2 text-sm text-zinc-500">{displayLabel(supplierCategoryLabels, supplier.category)} · {supplier.businessName || 'Sin razón social'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {whatsapp ? <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer"><Button variant="secondary"><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</Button></a> : null}
          {supplier.email ? <a href={`mailto:${supplier.email}`}><Button variant="secondary"><Mail className="mr-2 h-4 w-4" />Email</Button></a> : null}
        </div>
      </div>
    </header>

    <div className="grid gap-5 lg:grid-cols-3">
      <Card title="Identificación" icon={<Building2 className="h-4 w-4" />}><Item label="Nombre comercial" value={supplier.name} /><Item label="Razón social" value={supplier.businessName || 'No informado'} /><Item label="CUIT" value={supplier.taxId || 'No informado'} /><Item label="Categoría" value={displayLabel(supplierCategoryLabels, supplier.category)} /></Card>
      <Card title="Contacto" icon={<UserRound className="h-4 w-4" />}><Item label="Responsable" value={supplier.contactPerson || 'No informado'} /><Item label="Teléfono" value={supplier.phone || 'No informado'} /><Item label="WhatsApp" value={supplier.whatsapp || 'No informado'} /><Item label="Email" value={supplier.email || 'No informado'} /></Card>
      <Card title="Operativo" icon={<Truck className="h-4 w-4" />}><Item label="Dirección" value={supplier.address || 'No informado'} /><Item label="Alta" value={formatDate(supplier.createdAt)} /><Item label="Última actualización" value={formatDate(supplier.updatedAt)} /></Card>
    </div>

    <Card title="Notas internas" icon={<MapPin className="h-4 w-4" />}><p className="text-sm leading-6 text-zinc-700">{supplier.notes || 'Sin notas cargadas.'}</p></Card>
  </section>;
}

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="flex items-center gap-2 text-base font-semibold text-zinc-950">{icon}{title}</h2><div className="mt-5 space-y-4">{children}</div></article>;
}

function Item({ label, value }: { label: string; value: string | number }) {
  return <div><dt className="text-xs font-medium uppercase text-zinc-400">{label}</dt><dd className="mt-1 whitespace-pre-wrap font-medium text-zinc-800">{value}</dd></div>;
}

function EmptyDetail() {
  return <div className="grid min-h-56 place-items-center rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-sm">Proveedor no encontrado.</div>;
}
