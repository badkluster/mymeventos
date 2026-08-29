'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';

const GTM_ID = 'GTM-P9CKBZ7X';

const excludedPrefixes = [
  '/admin',
  '/entrada',
  '/entradas',
  '/invitacion',
  '/invitados',
];

export function GoogleTagManager() {
  const pathname = usePathname() ?? '';
  const enabled = !excludedPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (!enabled) return null;

  return (
    <Script id="google-tag-manager" strategy="afterInteractive">
      {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
    </Script>
  );
}
