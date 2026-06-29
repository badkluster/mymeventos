'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/primitives';
import type { Contract, ContractAddendum } from '@/features/quotes/types';

const money = (value?: unknown) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value ?? 0));
const formatDate = (value?: unknown) => typeof value === 'string' ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(value)) : 'Sin fecha';
const text = (value: unknown, fallback = 'No informado') => typeof value === 'string' && value.trim() ? value : fallback;

export default function ContractPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const [contract, setContract] = useState<Contract>();
  const [addendums, setAddendums] = useState<ContractAddendum[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void params.then(async ({ id }) => { try { const [contractResponse, addendumsResponse] = await Promise.all([api.get<{ contract: Contract }>(`/contracts/${id}`), api.get<{ items: ContractAddendum[] }>(`/contracts/${id}/addendums`)]); setContract(contractResponse.contract); setAddendums((addendumsResponse.items ?? []).filter((item) => item.status === 'approved')); } finally { setLoading(false); } }); }, [params]);
  if (loading || !contract) return <div className="p-8 text-sm text-zinc-500">Cargando contrato...</div>;
  return <main className="mx-auto max-w-4xl bg-white p-8 text-zinc-950 print:p-0">
    <div className="mb-6 flex items-center justify-between print:hidden"><Link href={`/admin/contracts/${contract._id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600"><ChevronLeft className="h-4 w-4" />Volver</Link><Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Imprimir</Button></div>
    <header className="border-b border-zinc-300 pb-6"><p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">M&M Eventos</p><h1 className="mt-2 text-3xl font-semibold">Contrato de prestación de servicios</h1><p className="mt-2 text-sm text-zinc-600">Contrato {contract.contractNumber}</p></header>
    <Section title="Datos de la prestadora"><p>M&M Eventos · Datos fiscales y domicilio configurables desde la administración.</p></Section>
    <Section title="Datos del usuario"><Grid items={[['Nombre', text(contract.customerSnapshot?.fullName)], ['Documento', text(contract.customerSnapshot?.documentNumber ?? contract.customerSnapshot?.dni)], ['Teléfono', text(contract.customerSnapshot?.phone)], ['Email', text(contract.customerSnapshot?.email)], ['Domicilio', text(contract.customerSnapshot?.address)]]} /></Section>
    <Section title="Datos del evento"><Grid items={[['Tipo', text(contract.eventSnapshot?.eventType)], ['Fecha', formatDate(contract.eventSnapshot?.eventDate)], ['Horario', [contract.eventSnapshot?.startTime, contract.eventSnapshot?.endTime].filter(Boolean).join(' - ') || 'Sin horario'], ['Invitados', String(contract.eventSnapshot?.guestCount ?? 'Sin definir')], ['Salón', text(contract.eventSnapshot?.salonName)], ['Dirección', text(contract.eventSnapshot?.salonAddress)]]} /></Section>
    <Section title="Servicios incluidos">{contract.servicesSnapshot?.length ? <ul className="list-disc pl-5">{contract.servicesSnapshot.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No hay servicios cargados.</p>}</Section>
    <Section title="Menú">{contract.menuSnapshot?.length ? contract.menuSnapshot.map((section, index) => <div key={`${section.title}-${index}`} className="mb-3"><h3 className="font-semibold">{section.title || 'Menú'}</h3><ul className="list-disc pl-5">{(section.items ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div>) : <p>No hay menú cargado.</p>}</Section>
    <Section title="Adendas aprobadas">{addendums.length ? <ul className="list-disc pl-5">{addendums.map((item) => <li key={item._id}>{item.addendumNumber} · {item.title} · {money(item.totalAmount)}</li>)}</ul> : <p>No hay adendas aprobadas.</p>}</Section>
    <Section title="Valores y pagos"><Grid items={[['Paquete', text(contract.commercialSnapshot?.packageName, 'Personalizado')], ['Base', money(contract.baseAmount)], ['Adendas aprobadas', money(contract.approvedAddendumsAmount)], ['Descuentos', money(contract.discountsAmount)], ['Total contractual', money(contract.totalAmount)], ['Saldo', money(contract.balanceAmount)], ['Condiciones', text(contract.paymentAgreementSnapshot?.paymentTerms)], ['Depósito por roturas', money(contract.securityDeposit?.amount)]]} /></Section>
    <Section title="Cláusulas">{(contract.legalTermsSnapshot?.clauses ?? []).map((clause, index) => <article key={clause.key ?? index} className="mb-4"><h3 className="font-semibold">{clause.title}</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{clause.text}</p></article>)}</Section>
    <Section title="Observaciones"><p className="whitespace-pre-wrap">{contract.observations || 'Sin observaciones.'}</p></Section>
    <footer className="mt-16 grid grid-cols-2 gap-12 text-center"><div className="border-t border-zinc-400 pt-3">Firma prestadora</div><div className="border-t border-zinc-400 pt-3">Firma usuario</div></footer>
  </main>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="border-b border-zinc-200 py-5 break-inside-avoid"><h2 className="mb-3 text-lg font-semibold">{title}</h2>{children}</section>; }
function Grid({ items }: { items: Array<[string, string]> }) { return <dl className="grid gap-3 sm:grid-cols-2">{items.map(([label, value]) => <div key={label}><dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>; }
