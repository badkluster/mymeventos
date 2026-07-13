'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button, Input } from '@/components/ui/primitives';

export type MenuSectionValue = { title: string; items: string[] };

export function StringListEditor({ label, values, onChange, itemPlaceholder = 'Nuevo ítem' }: { label: string; values: string[]; onChange: (values: string[]) => void; itemPlaceholder?: string }) {
  const update = (index: number, value: string) => onChange(values.map((item, itemIndex) => itemIndex === index ? value : item));
  const remove = (index: number) => onChange(values.filter((_, itemIndex) => itemIndex !== index));
  return <fieldset className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
    <div className="flex items-center justify-between gap-3"><legend className="text-sm font-semibold text-zinc-900">{label}</legend><Button type="button" variant="secondary" onClick={() => onChange([...values, ''])}><Plus className="mr-2 h-4 w-4" />Agregar</Button></div>
    {values.length ? <div className="space-y-2">{values.map((value, index) => <div key={index} className="flex gap-2"><Input value={value} onChange={(event) => update(index, event.target.value)} placeholder={itemPlaceholder} /><Button type="button" variant="secondary" aria-label={`Eliminar ${label.toLowerCase()} ${index + 1}`} onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button></div>)}</div> : <p className="text-sm text-zinc-500">Todavía no hay ítems. Usá “Agregar” para cargar uno.</p>}
  </fieldset>;
}

export function MenuSectionsEditor({ value, onChange }: { value: MenuSectionValue[]; onChange: (value: MenuSectionValue[]) => void }) {
  const updateSection = (index: number, section: MenuSectionValue) => onChange(value.map((item, itemIndex) => itemIndex === index ? section : item));
  return <fieldset className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
    <div className="flex items-center justify-between gap-3"><legend className="text-sm font-semibold text-zinc-900">Menú</legend><Button type="button" variant="secondary" onClick={() => onChange([...value, { title: '', items: [] }])}><Plus className="mr-2 h-4 w-4" />Agregar sección</Button></div>
    {value.map((section, index) => <section key={index} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex gap-2"><Input value={section.title} onChange={(event) => updateSection(index, { ...section, title: event.target.value })} placeholder="Nombre de sección: Recepción, Plato principal…" /><Button type="button" variant="secondary" aria-label={`Eliminar sección ${index + 1}`} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>
      <StringListEditor label="Platos o ítems" values={section.items} itemPlaceholder="Ej.: Empanadas variadas" onChange={(items) => updateSection(index, { ...section, items })} />
    </section>)}
    {!value.length && <p className="text-sm text-zinc-500">Todavía no hay secciones de menú.</p>}
  </fieldset>;
}

export function cleanMenuSections(value: MenuSectionValue[]): MenuSectionValue[] {
  return value.map((section) => ({ title: section.title.trim(), items: section.items.map((item) => item.trim()).filter(Boolean) })).filter((section) => section.title && section.items.length);
}

export function cleanStringList(value: string[]): string[] {
  return value.map((item) => item.trim()).filter(Boolean);
}
