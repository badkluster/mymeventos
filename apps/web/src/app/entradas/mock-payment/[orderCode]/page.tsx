import type { Metadata } from 'next';
import { MockTicketPayment } from '@/features/digital/public-tickets';

export const metadata: Metadata = { title: 'Pago de prueba', robots: { index: false, follow: false } };

export default async function MockPaymentPage({ params }: { params: Promise<{ orderCode: string }> }) { return <MockTicketPayment orderCode={(await params).orderCode} />; }
