import type { Metadata } from 'next';
import { TicketsCatalog } from '@/features/digital/public-tickets';

export const metadata: Metadata = {
  title: 'Entradas digitales',
  description: 'Comprá entradas digitales con QR para eventos y publicaciones activas de M&M Eventos.',
  alternates: { canonical: '/entradas' }
};

export default function TicketsCatalogPage() { return <TicketsCatalog />; }
