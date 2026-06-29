import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from '@/components/theme-provider';
import { brandAssets } from '@/lib/brand-assets';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'M&M Eventos | Salones, catering y organización integral', template: '%s | M&M Eventos' },
  description: 'Salones premium en La Plata, San Carlos y Villa Elisa con catering, ambientación, DJ y organización integral para eventos sociales y empresariales.',
  manifest: '/site.webmanifest',
  icons: {
    icon: [{ url: brandAssets.favicon }, { url: brandAssets.icon32, sizes: '32x32', type: 'image/png' }, { url: brandAssets.icon192, sizes: '192x192', type: 'image/png' }],
    apple: [{ url: brandAssets.icon192, sizes: '192x192', type: 'image/png' }]
  },
  openGraph: { title: 'M&M Eventos | Salones y eventos premium', description: 'Salones, catering, ambientación, DJ y organización integral para eventos inolvidables.', type: 'website', images: [{ url: brandAssets.openGraphImage, width: 1200, height: 1200, alt: 'M&M Eventos' }] },
  twitter: { card: 'summary_large_image', title: 'M&M Eventos', description: 'Salones, catering y organización integral para eventos inolvidables.', images: [brandAssets.openGraphImage] },
  robots: { index: true, follow: true },
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
