import type { ReactNode } from 'react';
import { Ga4PerformancePlacement } from '@/components/admin/ga4-performance-placement';

export default function PerformanceLayout({ children }: { children: ReactNode }) {
  return <>{children}<Ga4PerformancePlacement /></>;
}
