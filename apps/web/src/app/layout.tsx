import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from '@/components/theme-provider';
import { brandAssets } from '@/lib/brand-assets';
import { AnalyticsTracker } from '@/components/analytics-tracker';
import { GoogleTagManager } from '@/components/google-tag-manager';
import { LegalFooter } from '@/components/legal/legal-footer';

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-display', style: ['normal', 'italic'] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.mymsalones.com.ar';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'M&M Eventos | Salones de eventos en La Plata con catering', template: '%s | M&M Eventos' },
  description: 'Salones para fiestas, 15 años, casamientos, cumpleaños, egresados y eventos empresariales en La Plata. Catering, DJ, ambientación, barra y organización integral.',
  manifest: '/site.webmanifest',
  icons: {
    icon: [{ url: brandAssets.favicon }, { url: brandAssets.icon32, sizes: '32x32', type: 'image/png' }, { url: brandAssets.icon192, sizes: '192x192', type: 'image/png' }],
    apple: [{ url: brandAssets.icon192, sizes: '192x192', type: 'image/png' }]
  },
  openGraph: { title: 'M&M Eventos | Salones de eventos en La Plata con catering', description: 'Salones para fiestas, 15 años, casamientos, cumpleaños, egresados y eventos empresariales en La Plata.', type: 'website', images: [{ url: brandAssets.openGraphImage, width: 1200, height: 1200, alt: 'M&M Eventos' }] },
  twitter: { card: 'summary_large_image', title: 'M&M Eventos | Salones de eventos en La Plata', description: 'Salones, catering y organización integral para eventos inolvidables.', images: [brandAssets.openGraphImage] },
  robots: { index: true, follow: true },
  verification: {
    other: {
      'facebook-domain-verification': 'am7groy654rg20qnzq0s1ns11qq501',
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`h-full antialiased ${fraunces.variable}`}
    >
      <body className="min-h-full flex flex-col"><GoogleTagManager /><ThemeProvider>{children}<LegalFooter /><AnalyticsTracker /></ThemeProvider></body>
    </html>
  );
}
