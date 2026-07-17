import type { Metadata } from 'next';
import { PublicInvitation } from '@/features/digital/public-invitation';
export const metadata: Metadata = { title: 'Invitación', robots: { index: false, follow: false } };
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) { return <PublicInvitation token={(await params).token} />; }
