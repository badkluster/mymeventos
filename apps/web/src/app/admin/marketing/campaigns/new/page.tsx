'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast-provider';
import { api } from '@/lib/api';

export default function NewCampaignPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void api.post<{ campaign: { _id: string } }>('/marketing/campaigns', { name: 'Nueva campaña' })
      .then((response) => router.replace(`/admin/marketing/campaigns/${response.campaign._id}/edit`))
      .catch((error: Error) => { showToast({ message: error.message, variant: 'error' }); router.replace('/admin/marketing/campaigns'); });
  }, [router, showToast]);

  return <p className="p-6 text-sm text-zinc-500">Creando campaña...</p>;
}
