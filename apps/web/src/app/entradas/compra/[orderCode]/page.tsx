import { TicketOrderPortal } from "@/features/digital/ticket-order-portal";

export default async function TicketOrderPortalPage({ params }: { params: Promise<{ orderCode: string }> }) {
  return <TicketOrderPortal orderCode={(await params).orderCode} />;
}
