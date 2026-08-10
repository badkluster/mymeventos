import { TicketPublicationOperationalDetail } from '@/features/digital/ticket-operations';

export default async function TicketPublicationDetailPage({ params }: { params: Promise<{ publicationId: string }> }) {
  const { publicationId } = await params;
  return <TicketPublicationOperationalDetail publicationId={publicationId} />;
}
