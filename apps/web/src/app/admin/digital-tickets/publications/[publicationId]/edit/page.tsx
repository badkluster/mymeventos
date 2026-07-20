import { TicketPublicationEditor } from '@/features/digital/tickets-admin';
export default async function EditDigitalTicketPublicationPage({ params }: { params: Promise<{ publicationId: string }> }) { return <TicketPublicationEditor publicationId={(await params).publicationId} />; }
