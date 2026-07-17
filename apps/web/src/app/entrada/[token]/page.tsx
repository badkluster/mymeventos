import type { Metadata } from 'next';
import { PublicTicket } from '@/features/digital/public-tickets';
export const metadata: Metadata = { title: 'Entrada digital', robots: { index: false, follow: false } };
export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) { return <PublicTicket token={(await params).token} />; }
