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
  context: 'salons' | 'users' | 'quotes' | 'documents' | 'general';
  salonId?: string;
  quoteId?: string;
  accept?: string;
  label?: string;
  onUploaded: (asset: UploadedAsset) => void;
};

export function CloudinaryUpload({ context, salonId, quoteId, accept = 'image/*,video/*,application/pdf', label = 'Subir archivo', onUploaded }: CloudinaryUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('context', context);
      if (salonId) form.append('salonId', salonId);
      if (quoteId) form.append('quoteId', quoteId);
      const response = await api.post<{ asset: UploadedAsset }>('/uploads', form);
      onUploaded(response.asset);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo subir el archivo.');
    } finally {
      setUploading(false);
    }
  }

  return <div className="space-y-2">
    <label className="inline-flex cursor-pointer">
      <input type="file" accept={accept} className="sr-only" disabled={uploading} onChange={(event) => void upload(event)} />
      <Button type="button" disabled={uploading} className="pointer-events-none"><UploadCloud className="mr-2 h-4 w-4" />{uploading ? 'Subiendo…' : label}</Button>
    </label>
    {error && <p className="text-sm text-red-600">{error}</p>}
  </div>;
}
