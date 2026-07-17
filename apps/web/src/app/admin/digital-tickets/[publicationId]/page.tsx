import { TicketPublicationAdmin } from '@/features/digital/tickets-admin';
export default async function DigitalTicketPublicationPage({ params }: { params: Promise<{ publicationId: string }> }) { const { publicationId } = await params; return <TicketPublicationAdmin publicationId={publicationId} />; }
