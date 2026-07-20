import { TicketOrderDetail } from '@/features/digital/ticket-operations';
export default async function TicketOrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) { return <TicketOrderDetail orderId={(await params).orderId} />; }
