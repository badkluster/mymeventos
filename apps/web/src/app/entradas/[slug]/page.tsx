import type { Metadata } from 'next';
import { PublicTickets } from '@/features/digital/public-tickets';
export const metadata: Metadata = { title: 'Entradas', robots: { index: false, follow: false } };
export default async function TicketsPage({ params }: { params: Promise<{ slug: string }> }) { return <PublicTickets slug={(await params).slug} />; }
