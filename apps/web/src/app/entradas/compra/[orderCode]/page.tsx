import type { Metadata } from 'next';
import { TicketOrderPortal } from "@/features/digital/ticket-order-portal";

export const metadata: Metadata = { title: 'Mi compra', robots: { index: false, follow: false } };

export default async function TicketOrderPortalPage({ params }: { params: Promise<{ orderCode: string }> }) {
  return <TicketOrderPortal orderCode={(await params).orderCode} />;
}
