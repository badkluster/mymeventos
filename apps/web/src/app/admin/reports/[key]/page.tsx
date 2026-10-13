import { ReportWorkspace } from '@/features/reports/report-workspace';
import { MarketingFunnelReport } from '@/features/reports/marketing-funnel-report';

export default async function ReportDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (key === 'marketing-funnel') return <MarketingFunnelReport />;
  return <ReportWorkspace reportKey={key} />;
}
