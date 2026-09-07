import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/theme-provider';
import { AdminClientLayout } from './admin-client-layout';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ThemeProvider><AdminClientLayout>{children}</AdminClientLayout></ThemeProvider>;
}
