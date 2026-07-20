import { InvitationExamples } from '@/features/digital/invitation-examples';

export default async function InvitationExamplesPage({ searchParams }: { searchParams: Promise<{ templateId?: string }> }) { const { templateId } = await searchParams; return <InvitationExamples initialTemplateId={templateId} />; }
