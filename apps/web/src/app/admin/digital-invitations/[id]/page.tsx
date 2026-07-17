import { InvitationDetail } from '@/features/digital/invitations-admin';

export default async function DigitalInvitationDetailPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <InvitationDetail invitationId={id} />; }
