import { MockTicketPayment } from '@/features/digital/public-tickets';
export default async function MockPaymentPage({ params }: { params: Promise<{ orderCode: string }> }) { return <MockTicketPayment orderCode={(await params).orderCode} />; }
