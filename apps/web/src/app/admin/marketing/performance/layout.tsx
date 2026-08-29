import type { ReactNode } from 'react';
import { Ga4PerformancePanel } from '@/components/admin/ga4-performance-panel';

export default function PerformanceLayout({ children }: { children: ReactNode }) {
  return <>{children}<Ga4PerformancePanel /></>;
}
