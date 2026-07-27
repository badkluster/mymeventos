import { redirect } from 'next/navigation';

// Legacy staff detail links now open the single canonical user profile.
export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/users/${id}?tab=operation`);
}
