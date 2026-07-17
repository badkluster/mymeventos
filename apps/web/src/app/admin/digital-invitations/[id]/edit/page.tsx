import { InvitationEditor } from '@/features/digital/invitations-admin';

export default async function EditDigitalInvitationPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <InvitationEditor invitationId={id} />; }
