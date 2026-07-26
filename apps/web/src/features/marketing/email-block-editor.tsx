'use client';

import { useState } from 'react';
import { MARKETING_DYNAMIC_VARIABLES } from '@mym/shared';
import { ChevronUp, ChevronDown, Copy, Eye, EyeOff, Monitor, Plus, Smartphone, Trash2, Variable } from 'lucide-react';
import { Button, Input, Select, Textarea } from '@/components/ui/primitives';
import { CloudinaryUpload, type UploadedAsset } from '@/components/cloudinary-upload';
import {
  AVAILABLE_EMAIL_BLOCKS,
  EMAIL_BLOCK_LABELS,
  createEmailBlock,
  type EmailBlock,
  type EmailBlockType,
  type EmailContent
} from './email-content-types';
import { renderEmailContentToHtml } from './email-html-renderer';
import { renderPreviewSample } from './email-preview-sample';

type Props = { content: EmailContent; onChange: (content: EmailContent) => void };

function withOrder(blocks: EmailBlock[]): EmailBlock[] { return blocks; }

export function EmailBlockEditor({ content, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | undefined>(content.blocks[0]?.id);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [panel, setPanel] = useState<'sections' | 'design' | 'preview'>('sections');
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const blocks = content.blocks;
  const selected = blocks.find((block) => block.id === selectedId) ?? blocks[0];

  function updateBlocks(next: EmailBlock[]) {
    onChange({ ...content, blocks: withOrder(next) });
  }
  function patchBlock(id: string, patch: Partial<EmailBlock>) {
    updateBlocks(blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  }
  function patchData(id: string, key: string, value: unknown) {
    const block = blocks.find((item) => item.id === id);
    if (block) patchBlock(id, { data: { ...block.data, [key]: value } });
  }
  function addBlock(type: EmailBlockType) {
    const block = createEmailBlock(type);
    updateBlocks([...blocks, block]);
    setSelectedId(block.id);
    setAddMenuOpen(false);
  }
  function removeBlock(id: string) {
    updateBlocks(blocks.filter((block) => block.id !== id));
    if (selectedId === id) setSelectedId(undefined);
  }
  function duplicateBlock(id: string) {
    const index = blocks.findIndex((block) => block.id === id);
    if (index < 0) return;
    const copy = { ...blocks[index], id: `${blocks[index].type}-${Math.random().toString(36).slice(2, 10)}` };
    const next = [...blocks];
    next.splice(index + 1, 0, copy);
    updateBlocks(next);
  }
  function moveBlock(id: string, direction: -1 | 1) {
    const index = blocks.findIndex((block) => block.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    updateBlocks(next);
  }

  const previewHtml = renderPreviewSample(renderEmailContentToHtml(content));

  return (
    <div className="space-y-3">
      <div className="flex gap-2 md:hidden">
        {(['sections', 'design', 'preview'] as const).map((tab) => (
          <button key={tab} type="button" onClick={() => setPanel(tab)} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${panel === tab ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-600'}`}>
            {tab === 'sections' ? 'Secciones' : tab === 'design' ? 'Editar' : 'Vista previa'}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr_320px]">
        <aside className={`space-y-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm ${panel === 'sections' ? '' : 'hidden md:block'}`}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase text-zinc-500">Secciones</p>
            <div className="relative">
              <Button type="button" variant="secondary" onClick={() => setAddMenuOpen((c) => !c)} className="h-8 px-2 text-xs"><Plus className="h-3.5 w-3.5" /></Button>
              {addMenuOpen ? (
                <div className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg">
                  {AVAILABLE_EMAIL_BLOCKS.map((type) => (
                    <button key={type} type="button" onClick={() => addBlock(type)} className="block w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-zinc-100">{EMAIL_BLOCK_LABELS[type]}</button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          {blocks.map((block, index) => (
            <div key={block.id} onClick={() => setSelectedId(block.id)} className={`cursor-pointer rounded-xl border p-2 text-xs ${selected?.id === block.id ? 'border-zinc-950 bg-zinc-50' : 'border-zinc-200'}`}>
              <div className="flex items-center justify-between">
                <span className={`font-medium ${block.enabled ? 'text-zinc-900' : 'text-zinc-400 line-through'}`}>{EMAIL_BLOCK_LABELS[block.type]}</span>
                <div className="flex items-center gap-0.5">
                  <button type="button" title="Subir" onClick={(e) => { e.stopPropagation(); moveBlock(block.id, -1); }} disabled={index === 0} className="rounded p-1 hover:bg-zinc-200 disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                  <button type="button" title="Bajar" onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 1); }} disabled={index === blocks.length - 1} className="rounded p-1 hover:bg-zinc-200 disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                  <button type="button" title={block.enabled ? 'Ocultar' : 'Mostrar'} onClick={(e) => { e.stopPropagation(); patchBlock(block.id, { enabled: !block.enabled }); }} className="rounded p-1 hover:bg-zinc-200">{block.enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}</button>
                  <button type="button" title="Duplicar" onClick={(e) => { e.stopPropagation(); duplicateBlock(block.id); }} className="rounded p-1 hover:bg-zinc-200"><Copy className="h-3 w-3" /></button>
                  <button type="button" title="Eliminar" onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }} className="rounded p-1 hover:bg-red-100 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            </div>
          ))}
          {!blocks.length ? <p className="text-xs text-zinc-400">Agregá una sección para empezar.</p> : null}
        </aside>

        <section className={`rounded-2xl border border-zinc-200 bg-zinc-100 p-4 ${panel === 'preview' ? '' : 'hidden md:block'}`}>
          <div className="mb-3 flex items-center justify-center gap-2">
            <button type="button" onClick={() => setDevice('desktop')} className={`rounded-lg p-2 ${device === 'desktop' ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-500'}`}><Monitor className="h-4 w-4" /></button>
            <button type="button" onClick={() => setDevice('mobile')} className={`rounded-lg p-2 ${device === 'mobile' ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-500'}`}><Smartphone className="h-4 w-4" /></button>
          </div>
          <div className={`mx-auto overflow-hidden rounded-xl bg-white shadow ${device === 'mobile' ? 'max-w-[390px]' : 'max-w-full'}`}>
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </section>

        <aside className={`space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm ${panel === 'design' ? '' : 'hidden md:block'}`}>
          {selected ? <BlockEditorPanel key={selected.id} block={selected} onChangeData={(key, value) => patchData(selected.id, key, value)} onChangeBlock={(patch) => patchBlock(selected.id, patch)} /> : <p className="text-sm text-zinc-500">Seleccioná una sección para editarla.</p>}

          <div className="rounded-xl border border-dashed border-zinc-300 p-3">
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-zinc-500"><Variable className="h-3.5 w-3.5" />Fondo y tipografía</p>
            <div className="grid grid-cols-2 gap-2">
              <ColorMini label="Fondo" value={content.settings.backgroundColor} onChange={(v) => onChange({ ...content, settings: { ...content.settings, backgroundColor: v } })} />
              <ColorMini label="Contenido" value={content.settings.contentBackgroundColor} onChange={(v) => onChange({ ...content, settings: { ...content.settings, contentBackgroundColor: v } })} />
            </div>
            <Input className="mt-2" placeholder="Tipografía" value={content.settings.fontFamily} onChange={(e) => onChange({ ...content, settings: { ...content.settings, fontFamily: e.target.value } })} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function ColorMini({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs text-zinc-600">
      {label}
      <div className="mt-1 flex items-center gap-1.5">
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} className="h-8 w-8 rounded border border-zinc-200" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs" />
      </div>
    </label>
  );
}

function VariablePicker({ onInsert }: { onInsert: (token: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button type="button" onClick={() => setOpen((c) => !c)} className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-200"><Variable className="h-3 w-3" />Variable</button>
      {open ? (
        <div className="absolute left-0 z-20 mt-1 max-h-56 w-52 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg">
          {MARKETING_DYNAMIC_VARIABLES.map((name) => (
            <button key={name} type="button" onClick={() => { onInsert(`{{${name}}}`); setOpen(false); }} className="block w-full rounded-lg px-2 py-1 text-left font-mono text-[11px] hover:bg-zinc-100">{`{{${name}}}`}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BlockEditorPanel({ block, onChangeData, onChangeBlock }: { block: EmailBlock; onChangeData: (key: string, value: unknown) => void; onChangeBlock: (patch: Partial<EmailBlock>) => void }) {
  const insertInto = (key: string, current: string) => (token: string) => onChangeData(key, `${current ?? ''}${token}`);

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase text-zinc-500">{EMAIL_BLOCK_LABELS[block.type]}</p>

      {block.type === 'heading' || block.type === 'text' ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between"><span className="text-xs text-zinc-500">Texto</span><VariablePicker onInsert={insertInto('text', block.data.text)} /></div>
          <Textarea rows={4} value={block.data.text ?? ''} onChange={(e) => onChangeData('text', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" placeholder="Tamaño" value={block.data.fontSize ?? ''} onChange={(e) => onChangeData('fontSize', Number(e.target.value))} />
            <ColorMini label="Color" value={block.data.color ?? '#18181B'} onChange={(v) => onChangeData('color', v)} />
          </div>
        </div>
      ) : null}

      {block.type === 'image' || block.type === 'logo' ? (
        <div className="space-y-1.5">
          <CloudinaryUpload context="general" accept="image/*" label="Subir imagen" onUploaded={(asset: UploadedAsset) => onChangeData('url', asset.secureUrl || asset.url)} />
          <Input placeholder="URL de la imagen" value={block.data.url ?? ''} onChange={(e) => onChangeData('url', e.target.value)} />
          {block.type === 'image' ? <Input placeholder="Texto alternativo" value={block.data.alt ?? ''} onChange={(e) => onChangeData('alt', e.target.value)} /> : null}
          <Input placeholder="Enlace al hacer clic" value={block.data.link ?? ''} onChange={(e) => onChangeData('link', e.target.value)} />
        </div>
      ) : null}

      {block.type === 'button' ? (
        <div className="space-y-1.5">
          <Input placeholder="Texto del botón" value={block.data.label ?? ''} onChange={(e) => onChangeData('label', e.target.value)} />
          <div className="flex items-center justify-between"><span className="text-xs text-zinc-500">Enlace</span><VariablePicker onInsert={insertInto('url', block.data.url)} /></div>
          <Input value={block.data.url ?? ''} onChange={(e) => onChangeData('url', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <ColorMini label="Fondo" value={block.data.backgroundColor ?? '#18181B'} onChange={(v) => onChangeData('backgroundColor', v)} />
            <ColorMini label="Texto" value={block.data.textColor ?? '#FFFFFF'} onChange={(v) => onChangeData('textColor', v)} />
          </div>
          <Input type="number" placeholder="Radio de borde" value={block.data.borderRadius ?? 8} onChange={(e) => onChangeData('borderRadius', Number(e.target.value))} />
        </div>
      ) : null}

      {block.type === 'divider' ? (
        <div className="grid grid-cols-2 gap-2">
          <ColorMini label="Color" value={block.data.color ?? '#E4E4E7'} onChange={(v) => onChangeData('color', v)} />
          <Input type="number" placeholder="Grosor" value={block.data.thickness ?? 1} onChange={(e) => onChangeData('thickness', Number(e.target.value))} />
        </div>
      ) : null}

      {block.type === 'spacer' ? <Input type="number" placeholder="Alto en píxeles" value={block.data.height ?? 24} onChange={(e) => onChangeData('height', Number(e.target.value))} /> : null}

      {block.type === 'columns' ? (
        <div className="space-y-1.5">
          <Textarea rows={3} placeholder="Columna izquierda" value={block.data.leftText ?? ''} onChange={(e) => onChangeData('leftText', e.target.value)} />
          <Textarea rows={3} placeholder="Columna derecha" value={block.data.rightText ?? ''} onChange={(e) => onChangeData('rightText', e.target.value)} />
        </div>
      ) : null}

      {block.type === 'promotion' ? (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">Usa los datos de la promoción vinculada a la campaña.</p>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={block.data.showCode ?? true} onChange={(e) => onChangeData('showCode', e.target.checked)} />Mostrar código de descuento</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={block.data.showButton ?? true} onChange={(e) => onChangeData('showButton', e.target.checked)} />Mostrar botón</label>
        </div>
      ) : null}

      {block.type === 'social' ? (
        <div className="space-y-1.5">
          <Input placeholder="Instagram URL" value={block.data.instagramUrl ?? ''} onChange={(e) => onChangeData('instagramUrl', e.target.value)} />
          <Input placeholder="Facebook URL" value={block.data.facebookUrl ?? ''} onChange={(e) => onChangeData('facebookUrl', e.target.value)} />
          <Input placeholder="WhatsApp URL" value={block.data.whatsappUrl ?? ''} onChange={(e) => onChangeData('whatsappUrl', e.target.value)} />
        </div>
      ) : null}

      {block.type === 'contact' ? (
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={block.data.showAddress ?? true} onChange={(e) => onChangeData('showAddress', e.target.checked)} />Dirección del salón</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={block.data.showPhone ?? true} onChange={(e) => onChangeData('showPhone', e.target.checked)} />Teléfono</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={block.data.showWhatsApp ?? true} onChange={(e) => onChangeData('showWhatsApp', e.target.checked)} />WhatsApp</label>
        </div>
      ) : null}

      {block.type === 'footer' ? (
        <div className="space-y-1.5">
          <Textarea rows={2} value={block.data.text ?? ''} onChange={(e) => onChangeData('text', e.target.value)} />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={block.data.showUnsubscribe ?? true} onChange={(e) => onChangeData('showUnsubscribe', e.target.checked)} />Incluir enlace de baja</label>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 border-t pt-3">
        <label className="text-xs text-zinc-500">Alineación
          <Select value={block.align} onChange={(e) => onChangeBlock({ align: e.target.value as EmailBlock['align'] })} className="mt-1">
            <option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option>
          </Select>
        </label>
        <ColorMini label="Fondo del bloque" value={block.backgroundColor ?? ''} onChange={(v) => onChangeBlock({ backgroundColor: v })} />
      </div>
    </div>
  );
}
