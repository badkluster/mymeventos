import { TicketCheckIn } from '@/features/digital/check-in';
export default async function DigitalTicketCheckInPage({ params }: { params: Promise<{ publicationId: string }> }) { const { publicationId } = await params; return <TicketCheckIn publicationId={publicationId} />; }
