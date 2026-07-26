import { ReportWorkspace } from '@/features/reports/report-workspace';

export default async function ReportDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <ReportWorkspace reportKey={key} />;
}
