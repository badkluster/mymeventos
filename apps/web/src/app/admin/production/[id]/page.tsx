import { ProductionDetail } from '@/features/production/production-detail';

export default async function ProductionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductionDetail planId={id} />;
}
