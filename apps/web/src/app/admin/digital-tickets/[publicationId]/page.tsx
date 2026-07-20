import { redirect } from 'next/navigation';
export default async function DigitalTicketPublicationPage({ params }: { params: Promise<{ publicationId: string }> }) { redirect(`/admin/digital-tickets/publications/${(await params).publicationId}/edit`); }
