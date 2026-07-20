import { TicketCheckout } from '@/features/digital/public-tickets';
export default async function TicketCheckoutPage({ params }: { params: Promise<{ slug: string }> }) { return <TicketCheckout slug={(await params).slug} />; }
