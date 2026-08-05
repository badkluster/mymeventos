'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Input, Modal, Textarea } from '@/components/ui/primitives';

export type RelatedContactTarget = { kind: 'customer' | 'lead'; id: string };
type CustomerRecord = { _id: string; fullName?: string; phone?: string; email?: string; documentNumber?: string; address?: string; occupation?: string; birthDate?: string; notes?: string };
type LeadRecord = { _id: string; firstName: string; lastName: string; phone: string; alternativePhone?: string; email?: string; eventType?: string; eventDate?: string; guestCount?: number; message?: string; notes?: string };

export function RelatedContactModal({ target, onClose, onSaved, onNotice }: { target?: RelatedContactTarget; onClose: () => void; onSaved: () => Promise<void>; onNotice: (message: string, variant?: 'success' | 'error') => void }) {
  const [customer, setCustomer] = useState<CustomerRecord>();
  const [lead, setLead] = useState<LeadRecord>();
  const [loadedTarget, setLoadedTarget] = useState<RelatedContactTarget>();
  const [saving, setSaving] = useState(false);

  const loading = Boolean(target && (!loadedTarget || loadedTarget.kind !== target.kind || loadedTarget.id !== target.id));

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    void (target.kind === 'customer' ? api.get<{ customer: CustomerRecord }>(`/customers/${target.id}`) : api.get<{ lead: LeadRecord }>(`/leads/${target.id}`)).then((response) => {
      if (cancelled) return;
      if (target.kind === 'customer') {
        setCustomer((response as { customer: CustomerRecord }).customer);
        setLead(undefined);
      } else {
        setLead((response as { lead: LeadRecord }).lead);
        setCustomer(undefined);
      }
      setLoadedTarget(target);
    }).catch((error: Error) => {
      if (!cancelled) {
        setCustomer(undefined);
        setLead(undefined);
        setLoadedTarget(target);
        onNotice(error.message || 'No se pudo cargar el contacto relacionado.', 'error');
      }
    });
    return () => { cancelled = true; };
  }, [target, onClose, onNotice]);

  const saveCustomer = async () => {
    if (!customer) return;
    setSaving(true);
    try {
      await api.patch(`/customers/${customer._id}`, { fullName: customer.fullName?.trim(), phone: customer.phone?.trim() || undefined, email: customer.email?.trim() ?? '', documentNumber: customer.documentNumber ?? '', address: customer.address ?? '', occupation: customer.occupation ?? '', birthDate: customer.birthDate?.slice(0, 10) || '', notes: customer.notes ?? '' });
      await onSaved();
      onClose();
      onNotice('Cliente actualizado correctamente.');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'No se pudo actualizar el cliente.', 'error');
    } finally { setSaving(false); }
  };
  const saveLead = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      await api.patch(`/leads/${lead._id}`, { firstName: lead.firstName.trim(), lastName: lead.lastName.trim(), phone: lead.phone.trim(), alternativePhone: lead.alternativePhone?.trim() ?? '', email: lead.email?.trim() ?? '', eventType: lead.eventType?.trim(), eventDate: lead.eventDate?.slice(0, 10) || undefined, guestCount: lead.guestCount, message: lead.message ?? '', notes: lead.notes ?? '' });
      await onSaved();
      onClose();
      onNotice('Lead actualizado correctamente.');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'No se pudo actualizar el lead.', 'error');
    } finally { setSaving(false); }
  };

  return <Modal open={Boolean(target)} onClose={onClose} title={target?.kind === 'customer' ? 'Cliente relacionado' : 'Lead relacionado'} description="Consultá y actualizá los datos sin salir del evento.">
    {loading ? <div className="p-6 text-sm text-zinc-500">Cargando datos...</div> : target?.kind === 'customer' && customer ? <div className="grid gap-4 p-6 sm:grid-cols-2"><label className="text-sm font-medium text-zinc-700 sm:col-span-2">Nombre completo<Input required value={customer.fullName ?? ''} onChange={(event) => setCustomer((current) => current && { ...current, fullName: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700">Teléfono<Input value={customer.phone ?? ''} onChange={(event) => setCustomer((current) => current && { ...current, phone: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700">Email<Input type="email" value={customer.email ?? ''} onChange={(event) => setCustomer((current) => current && { ...current, email: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700">Documento / DNI<Input value={customer.documentNumber ?? ''} onChange={(event) => setCustomer((current) => current && { ...current, documentNumber: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700">Ocupación<Input value={customer.occupation ?? ''} onChange={(event) => setCustomer((current) => current && { ...current, occupation: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700">Fecha de nacimiento<Input type="date" value={customer.birthDate?.slice(0, 10) ?? ''} onChange={(event) => setCustomer((current) => current && { ...current, birthDate: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700 sm:col-span-2">Domicilio<Input value={customer.address ?? ''} onChange={(event) => setCustomer((current) => current && { ...current, address: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700 sm:col-span-2">Notas<Textarea value={customer.notes ?? ''} onChange={(event) => setCustomer((current) => current && { ...current, notes: event.target.value })} className="mt-1.5" /></label><footer className="flex justify-end gap-3 sm:col-span-2"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={saving || !customer.fullName?.trim()} onClick={() => void saveCustomer()}>{saving ? 'Guardando...' : 'Guardar datos'}</Button></footer></div> : target?.kind === 'lead' && lead ? <div className="grid max-h-[70vh] gap-4 overflow-y-auto p-6 sm:grid-cols-2"><label className="text-sm font-medium text-zinc-700">Nombre<Input required value={lead.firstName} onChange={(event) => setLead((current) => current && { ...current, firstName: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700">Apellido<Input required value={lead.lastName} onChange={(event) => setLead((current) => current && { ...current, lastName: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700">Teléfono<Input required value={lead.phone} onChange={(event) => setLead((current) => current && { ...current, phone: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700">Teléfono alternativo<Input value={lead.alternativePhone ?? ''} onChange={(event) => setLead((current) => current && { ...current, alternativePhone: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700">Email<Input type="email" value={lead.email ?? ''} onChange={(event) => setLead((current) => current && { ...current, email: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700">Tipo de evento<Input value={lead.eventType ?? ''} onChange={(event) => setLead((current) => current && { ...current, eventType: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700">Fecha estimativa<Input type="date" value={lead.eventDate?.slice(0, 10) ?? ''} onChange={(event) => setLead((current) => current && { ...current, eventDate: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700">Cantidad de personas<Input type="number" min="1" value={lead.guestCount ?? ''} onChange={(event) => setLead((current) => current && { ...current, guestCount: Number(event.target.value) })} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700 sm:col-span-2">Mensaje<Textarea value={lead.message ?? ''} onChange={(event) => setLead((current) => current && { ...current, message: event.target.value })} className="mt-1.5" /></label><label className="text-sm font-medium text-zinc-700 sm:col-span-2">Notas internas<Textarea value={lead.notes ?? ''} onChange={(event) => setLead((current) => current && { ...current, notes: event.target.value })} className="mt-1.5" /></label><footer className="flex justify-end gap-3 sm:col-span-2"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={saving || !lead.firstName.trim() || !lead.lastName.trim() || !lead.phone.trim() || !lead.eventType?.trim() || !lead.guestCount} onClick={() => void saveLead()}>{saving ? 'Guardando...' : 'Guardar datos'}</Button></footer></div> : <div className="p-6 text-sm text-zinc-500">No se encontraron datos para este contacto.</div>}
  </Modal>;
}
