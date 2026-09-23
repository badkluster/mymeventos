import type { Metadata } from "next";
import { Allura, Fraunces } from "next/font/google";
import "./globals.css";
import { brandAssets } from '@/lib/brand-assets';
import { getPublicLanding } from '@/lib/public-landing';
import { AnalyticsTracker } from '@/components/analytics-tracker';
import { GoogleTagManager } from '@/components/google-tag-manager';
import { LegalFooter } from '@/components/legal/legal-footer';

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-display', style: ['normal', 'italic'] });
const allura = Allura({ subsets: ['latin'], variable: '--font-script', weight: '400' });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.mymsalones.com.ar';

export async function generateMetadata(): Promise<Metadata> {
  const landing = await getPublicLanding();
  const settings = landing?.settings;
  const title = settings?.seoTitle || 'Salones de Fiestas en La Plata | M&M Eventos';
  const description = settings?.seoDescription || 'Salones de fiestas en La Plata para cumpleaños, 15 años y casamientos, con catering, bebidas, DJ, iluminación y servicio completo.';
  const favicon = settings?.faviconUrl || brandAssets.favicon;
  const shareImage = settings?.openGraphImageUrl || brandAssets.openGraphImage;

  return {
    metadataBase: new URL(siteUrl),
    title: { default: title, template: '%s | M&M Eventos' },
    description,
    manifest: '/site.webmanifest',
    icons: { icon: [{ url: favicon }], apple: [{ url: favicon }] },
    openGraph: { title, description, type: 'website', images: [{ url: shareImage, width: 1200, height: 1200, alt: 'M&M Eventos' }] },
    twitter: { card: 'summary_large_image', title, description, images: [shareImage] },
    robots: { index: true, follow: true },
    verification: {
      other: {
        'facebook-domain-verification': 'am7groy654rg20qnzq0s1ns11qq501',
      },
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`h-full antialiased ${fraunces.variable} ${allura.variable}`}
    >
      <body className="min-h-full flex flex-col"><GoogleTagManager />{children}<LegalFooter /><AnalyticsTracker /></body>
    </html>
  );
}
