import type { Metadata } from 'next';
import { TicketCheckout } from '@/features/digital/public-tickets';

export const metadata: Metadata = { title: 'Checkout de entradas', robots: { index: false, follow: false } };

export default async function TicketCheckoutPage({ params }: { params: Promise<{ slug: string }> }) { return <TicketCheckout slug={(await params).slug} />; }
