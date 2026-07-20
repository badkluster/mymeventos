import { InvitationEditor } from '@/features/digital/invitations-admin';

export default async function NewDigitalInvitationPage({ searchParams }: { searchParams: Promise<{ templateId?: string }> }) { const { templateId } = await searchParams; return <InvitationEditor initialTemplateId={templateId} />; }
