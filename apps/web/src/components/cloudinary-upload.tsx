'use client';

import { ChangeEvent, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/primitives';

export type UploadedAsset = {
  publicId: string;
  url: string;
  secureUrl: string;
  resourceType: 'image' | 'video' | 'raw' | string;
  format?: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  originalFilename?: string;
};

type CloudinaryUploadProps = {
  context: 'salons' | 'users' | 'quotes' | 'documents' | 'invitations' | 'tickets' | 'marketing' | 'expenses' | 'general';
  salonId?: string;
  quoteId?: string;
  accept?: string;
  label?: string;
  multiple?: boolean;
  dropzone?: boolean;
  onUploaded?: (asset: UploadedAsset) => void | Promise<void>;
  onUploadedBatch?: (assets: UploadedAsset[]) => void | Promise<void>;
};

export function CloudinaryUpload({ context, salonId, quoteId, accept = 'image/*,.heic,.heif,video/*,application/pdf', label = 'Subir archivo', multiple = false, dropzone = false, onUploaded, onUploadedBatch }: CloudinaryUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [fileCount, setFileCount] = useState(0);
  const [dragging, setDragging] = useState(false);

  function acceptedFiles(files: File[]) {
    const rules = accept.split(',').map((rule) => rule.trim().toLowerCase()).filter(Boolean);
    const accepted = files.filter((file) => {
      const type = file.type.toLowerCase();
      const name = file.name.toLowerCase();
      return rules.some((rule) => rule.endsWith('/*') ? type.startsWith(rule.slice(0, -1)) : rule.startsWith('.') ? name.endsWith(rule) : type === rule);
    });
    const rejected = files.filter((file) => !accepted.includes(file));
    if (rejected.length) setError(`Formato no permitido: ${rejected.map((file) => file.name).join(', ')}`);
    return accepted;
  }

  async function uploadFiles(selectedFiles: File[]) {
    const files = acceptedFiles(selectedFiles);
    if (!files.length) return;
    setUploading(true);
    setFileCount(files.length);
    setError('');
    try {
      const uploaded: UploadedAsset[] = [];
      const failed: string[] = [];
      for (const file of files) {
        try {
          const form = new FormData();
          form.append('file', file);
          form.append('context', context);
          if (salonId) form.append('salonId', salonId);
          if (quoteId) form.append('quoteId', quoteId);
          const response = await api.post<{ asset: UploadedAsset }>('/uploads', form);
          uploaded.push(response.asset);
        } catch {
          failed.push(file.name);
        }
      }
      if (uploaded.length) {
        if (onUploadedBatch) await onUploadedBatch(uploaded);
        else if (onUploaded) {
          for (const asset of uploaded) await onUploaded(asset);
        }
      }
      if (failed.length) setError(`No se pudieron subir ${failed.length} archivo(s): ${failed.join(', ')}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo subir el archivo.');
    } finally {
      setUploading(false);
      setFileCount(0);
    }
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void uploadFiles(files);
  }

  return <div className={`space-y-2 ${dropzone ? `rounded-xl border border-dashed p-2 transition ${dragging ? 'border-zinc-950 bg-zinc-100' : 'border-zinc-300 bg-white/70'}` : ''}`} onDragOver={dropzone ? (event) => { event.preventDefault(); if (!uploading) setDragging(true); } : undefined} onDragLeave={dropzone ? () => setDragging(false) : undefined} onDrop={dropzone ? (event) => { event.preventDefault(); setDragging(false); if (!uploading) void uploadFiles(Array.from(event.dataTransfer.files)); } : undefined}>
    <label className="inline-flex cursor-pointer">
      <input type="file" accept={accept} multiple={multiple} className="sr-only" disabled={uploading} onChange={(event) => void upload(event)} />
      <Button type="button" disabled={uploading} className="pointer-events-none"><UploadCloud className="mr-2 h-4 w-4" />{uploading ? `Subiendo${fileCount > 1 ? ` ${fileCount}` : ''}…` : label}</Button>
    </label>
    {dropzone && <p className="px-1 text-xs text-zinc-500">{dragging ? 'Soltá el archivo para subirlo.' : 'También podés arrastrar y soltar archivos aquí.'}</p>}
    {error && <p className="text-sm text-danger-foreground">{error}</p>}
  </div>;
}
