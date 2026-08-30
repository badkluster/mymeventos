'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const GTM_ID = 'GTM-P9CKBZ7X';
const CONSENT_KEY = 'mym.analytics.consent';
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api');

type ConsentChoice = 'accepted' | 'declined' | null;
type AnalyticsSettings = { enabled: boolean; consentRequired: boolean };

function consentLayer() {
  const target = window as Window & { dataLayer?: unknown[] };
  target.dataLayer = target.dataLayer || [];
  return target.dataLayer;
}

function pushConsent(command: 'default' | 'update', choice: ConsentChoice) {
  const consent = {
    analytics_storage: choice === 'accepted' ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    ...(command === 'default' ? { wait_for_update: 500 } : {}),
  };
  consentLayer().push(['consent', command, consent]);
}

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
  const [choice, setChoice] = useState<ConsentChoice>(null);
  const [settings, setSettings] = useState<AnalyticsSettings | null>(null);

  useEffect(() => {
    if (!enabled) return;
    pushConsent('default', null);
    const stored = localStorage.getItem(CONSENT_KEY) as ConsentChoice;
    setChoice(stored);
    if (stored) pushConsent('update', stored);
    const onConsentChange = (event: Event) => {
      const next = (event as CustomEvent<{ choice?: ConsentChoice }>).detail?.choice ?? null;
      setChoice(next);
      pushConsent('update', next);
    };
    window.addEventListener('mym:consent-change', onConsentChange);
    return () => window.removeEventListener('mym:consent-change', onConsentChange);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void fetch(`${API_BASE}/public/analytics/settings`, { credentials: 'include' })
      .then((response) => response.json())
      .then((payload) => setSettings({ enabled: Boolean(payload.data?.enabled), consentRequired: payload.data?.consentRequired !== false }))
      .catch(() => setSettings({ enabled: false, consentRequired: true }));
  }, [enabled]);

  if (!enabled) return null;

  // Basic Consent Mode: do not request GTM/GA4 before analytics consent. This
  // avoids both cookies and cookieless measurement pings before acceptance.
  const canLoad = Boolean(settings?.enabled && (!settings.consentRequired || choice === 'accepted'));
  if (!canLoad) return null;

  return (
    <Script id="google-tag-manager" strategy="afterInteractive">
      {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
    </Script>
  );
}
