import type { Metadata } from 'next';
import GuestListView from './guest-list-view';

export const metadata: Metadata = { title: 'Lista de invitados', robots: { index: false, follow: false } };

export default function PublicGuestListPage({ params }: { params: Promise<{ token: string }> }) {
  return <GuestListView params={params} />;
}
