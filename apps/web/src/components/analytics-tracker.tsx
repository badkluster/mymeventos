'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type AnalyticsName =
  | 'session_start' | 'page_view' | 'section_view' | 'section_engagement' | 'scroll_depth' | 'click' | 'cta_click'
  | 'whatsapp_click' | 'phone_click' | 'map_click' | 'social_click' | 'gallery_open' | 'gallery_navigation'
  | 'form_start' | 'form_field_interaction' | 'form_submit' | 'form_success' | 'form_error'
  | 'promotion_view' | 'promotion_click' | 'salon_view' | 'package_view';
type QueueEvent = Record<string, unknown> & { eventName: AnalyticsName };
type TrackerSettings = { enabled: boolean; consentRequired: boolean; collectClicks: boolean; collectSectionEngagement: boolean };
type MetaStandardEvent = 'PageView' | 'ViewContent' | 'Contact' | 'Lead';
type MetaCustomerData = { email?: string; phone?: string; firstName?: string; lastName?: string };
type AnalyticsDetail = { sectionId?: string; elementId?: string; entityId?: string; metaCustomerData?: MetaCustomerData };
type MetaFbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: (...args: unknown[]) => void;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: MetaFbq;
    _fbq?: MetaFbq;
    dataLayer?: Array<Record<string, unknown>>;
  }
}

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api');
const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '2426577017753592';
const visitorKey = 'mym.analytics.visitor';
const attributionKey = 'mym.analytics.attribution';
const consentKey = 'mym.analytics.consent';
const pageVersion = 'landing-2026-07';
const metaAttributionMaxAgeSeconds = 90 * 24 * 60 * 60;
const metaEventMapping: Partial<Record<AnalyticsName, MetaStandardEvent>> = {
  page_view: 'PageView',
  salon_view: 'ViewContent',
  promotion_view: 'ViewContent',
  package_view: 'ViewContent',
  whatsapp_click: 'Contact',
  phone_click: 'Contact',
  form_success: 'Lead',
};
const ga4EventMapping: Partial<Record<AnalyticsName, string>> = {
  phone_click: 'phone_click',
  form_start: 'form_start',
  form_submit: 'form_submit',
  form_success: 'generate_lead',
  salon_view: 'salon_view',
  package_view: 'package_view',
  promotion_click: 'promotion_click',
};

function trackGa4DataLayerEvent(eventName: AnalyticsName, detail: Record<string, unknown>) {
  const ga4EventName = ga4EventMapping[eventName];
  if (!ga4EventName) return;
  window.dataLayer = window.dataLayer || [];
  const payload: Record<string, unknown> = {
    event: ga4EventName,
    section_id: detail.sectionId,
    element_id: detail.elementId,
    entity_id: detail.entityId,
  };
  if (ga4EventName === 'generate_lead') payload.lead_id = detail.entityId;
  if (ga4EventName === 'salon_view') {
    payload.salon_id = detail.entityId;
    payload.salon_name = detail.elementId;
  }
  if (ga4EventName === 'package_view') {
    payload.package_id = detail.entityId;
    payload.package_name = detail.elementId;
  }
  if (ga4EventName === 'promotion_click') {
    payload.promotion_id = detail.entityId;
    payload.promotion_name = detail.elementId;
  }
  window.dataLayer.push(payload);
}

function identifier(storage: Storage, key: string) {
  const existing = storage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  storage.setItem(key, next);
  return next;
}
function deviceType(): 'desktop' | 'tablet' | 'mobile' | 'unknown' {
  if (window.innerWidth < 768) return 'mobile';
  if (window.innerWidth < 1100) return 'tablet';
  return 'desktop';
}
function browserFamily() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge'; if (/Chrome\//.test(ua)) return 'Chrome'; if (/Firefox\//.test(ua)) return 'Firefox'; if (/Safari\//.test(ua)) return 'Safari';
  return 'Otro';
}
function operatingSystem() {
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return 'Windows'; if (/Android/.test(ua)) return 'Android'; if (/iPhone|iPad/.test(ua)) return 'iOS'; if (/Mac OS/.test(ua)) return 'macOS'; if (/Linux/.test(ua)) return 'Linux';
  return 'Otro';
}
function analyticsElementId(target: HTMLElement) {
  if (target.dataset.analyticsId) return target.dataset.analyticsId;
  const description = target.getAttribute('aria-label') || target.textContent || target.getAttribute('title') || '';
  const slug = description.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
  return slug ? `element-${slug}` : 'unidentified';
}
function cookieValue(name: string) {
  const prefix = `${name}=`;
  const item = document.cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : '';
}
function ensureMetaFbc() {
  const existing = cookieValue('_fbc');
  if (existing) return existing;
  const fbclid = new URLSearchParams(location.search).get('fbclid')?.trim();
  if (!fbclid || fbclid.length > 500) return '';
  const fbc = `fb.1.${Date.now()}.${fbclid}`;
  document.cookie = `_fbc=${encodeURIComponent(fbc)}; Max-Age=${metaAttributionMaxAgeSeconds}; Path=/; SameSite=Lax; Secure`;
  return fbc;
}
function ensureMetaPixel() {
  if (window.fbq) return window.fbq;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as MetaFbq;
  fbq.queue = [];
  fbq.push = (...args: unknown[]) => fbq(...args);
  fbq.loaded = true;
  fbq.version = '2.0';
  window.fbq = fbq;
  window._fbq = fbq;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  script.dataset.mymMetaPixel = metaPixelId;
  document.head.appendChild(script);
  fbq('init', metaPixelId);
  return fbq;
}
function trackMetaBrowserEvent(eventName: AnalyticsName, eventId: string, detail: Record<string, unknown>) {
  const standardEvent = metaEventMapping[eventName];
  if (!standardEvent) return null;
  const fbq = ensureMetaPixel();
  const params: Record<string, unknown> = {};
  if (detail.entityId) params.content_ids = [String(detail.entityId)];
  if (detail.elementId) params.content_name = String(detail.elementId);
  params.content_category = eventName;
  fbq('track', standardEvent, params, { eventID: eventId });
  return standardEvent;
}
function trackMetaServerEvent(standardEvent: MetaStandardEvent, analyticsName: AnalyticsName, eventId: string, occurredAt: string, externalId: string, detail: Record<string, unknown>, customerData?: MetaCustomerData) {
  const query = new URLSearchParams(location.search);
  const body = {
    eventId,
    eventName: standardEvent,
    eventTime: occurredAt,
    eventSourceUrl: location.href,
    externalId,
    fbp: cookieValue('_fbp'),
    fbc: ensureMetaFbc(),
    contentName: detail.elementId ? String(detail.elementId) : '',
    contentCategory: analyticsName,
    contentIds: detail.entityId ? [String(detail.entityId)] : undefined,
    email: customerData?.email || '',
    phone: customerData?.phone || '',
    firstName: customerData?.firstName || '',
    lastName: customerData?.lastName || '',
    testEventCode: query.get('test_event_code') || '',
  };
  void fetch(`${apiBase}/public/meta/events`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}
export function analyticsAttributionId() {
  if (typeof window === 'undefined') return '';
  return identifier(window.localStorage, attributionKey);
}
export function emitAnalyticsEvent(eventName: AnalyticsName, detail: AnalyticsDetail = {}) {
  window.dispatchEvent(new CustomEvent('mym:analytics', { detail: { eventName, ...detail } }));
}

function updateConsent(choice: 'accepted' | 'declined') {
  localStorage.setItem(consentKey, choice);
  window.dispatchEvent(new CustomEvent('mym:consent-change', { detail: { choice } }));
}

export function AnalyticsTracker() {
  const pathname = usePathname() ?? '';
  const [settings, setSettings] = useState<TrackerSettings | null>(null);
  // Keep the server and first client render identical. Reading localStorage in
  // the state initializer made returning visitors hydrate without the consent
  // banner that was present in the server HTML, aborting hydration before GTM
  // and the commercial event listeners could initialize.
  const [consent, setConsent] = useState<'accepted' | 'declined' | null>(null);
  const [consentLoaded, setConsentLoaded] = useState(false);
  const queue = useRef<QueueEvent[]>([]);
  const sessionId = useRef('');
  const visitorId = useRef('');
  const attributionId = useRef('');
  const utm = useRef<Record<string, string>>({});
  const viewedSections = useRef(new Set<string>());
  const sectionStartedAt = useRef(new Map<string, number>());
  const scrollMilestones = useRef(new Set<number>());
  const formStarted = useRef(new Set<string>());
  const formCustomerData = useRef(new Map<string, MetaCustomerData>());
  const publicPage = !pathname.startsWith('/admin') && !pathname.startsWith('/invitacion') && !pathname.startsWith('/invitados') && !pathname.startsWith('/entrada');

  useEffect(() => {
    setConsent(localStorage.getItem(consentKey) as 'accepted' | 'declined' | null);
    setConsentLoaded(true);
  }, []);

  useEffect(() => {
    if (!publicPage) return;
    void fetch(`${apiBase}/public/analytics/settings`, { credentials: 'include' }).then((response) => response.json()).then((payload) => setSettings(payload.data)).catch(() => setSettings({ enabled: false, consentRequired: true, collectClicks: false, collectSectionEngagement: false }));
  }, [publicPage]);

  useEffect(() => {
    if (!publicPage || !settings?.enabled || (settings.consentRequired && consent !== 'accepted') || consent === 'declined') return;
    visitorId.current = identifier(localStorage, visitorKey);
    attributionId.current = identifier(localStorage, attributionKey);
    sessionId.current = identifier(sessionStorage, 'mym.analytics.session');
    const query = new URLSearchParams(location.search);
    utm.current = { utmSource: query.get('utm_source') || '', utmMedium: query.get('utm_medium') || '', utmCampaign: query.get('utm_campaign') || '', utmContent: query.get('utm_content') || '', utmTerm: query.get('utm_term') || '' };
    const flush = () => {
      if (!queue.current.length) return;
      const events = queue.current.splice(0, 25);
      const body = JSON.stringify({ events });
      if (document.visibilityState === 'hidden' && navigator.sendBeacon) navigator.sendBeacon(`${apiBase}/public/analytics/collect`, new Blob([body], { type: 'application/json' }));
      else void fetch(`${apiBase}/public/analytics/collect`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
    };
    const enqueue = (eventName: AnalyticsName, detail: AnalyticsDetail & Record<string, unknown> = {}) => {
      const eventId = crypto.randomUUID();
      const occurredAt = new Date().toISOString();
      const { metaCustomerData, ...analyticsDetail } = detail;
      const queuedEvent: QueueEvent = {
        eventId, anonymousVisitorId: visitorId.current, sessionId: sessionId.current, attributionId: attributionId.current,
        eventName, pagePath: location.pathname, pageTitle: document.title.slice(0, 240), referrer: document.referrer.slice(0, 500),
        ...utm.current, deviceType: deviceType(), browserFamily: browserFamily(), operatingSystem: operatingSystem(),
        viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, language: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        occurredAt, pageVersion, ...analyticsDetail,
      };
      queue.current.push(queuedEvent);
      trackGa4DataLayerEvent(eventName, analyticsDetail);
      const standardEvent = trackMetaBrowserEvent(eventName, eventId, analyticsDetail);
      if (standardEvent) trackMetaServerEvent(standardEvent, eventName, eventId, occurredAt, attributionId.current, analyticsDetail, metaCustomerData);
      if (queue.current.length >= 10) flush();
    };
    enqueue('session_start'); enqueue('page_view');
    const timer = window.setInterval(flush, 5_000);
    const sectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const section = entry.target as HTMLElement; const sectionId = section.dataset.analyticsSection;
        if (!sectionId) continue;
        if (entry.isIntersecting) {
          if (!viewedSections.current.has(sectionId)) { viewedSections.current.add(sectionId); enqueue('section_view', { sectionId }); }
          if (!sectionStartedAt.current.has(sectionId)) sectionStartedAt.current.set(sectionId, performance.now());
        } else {
          const startedAt = sectionStartedAt.current.get(sectionId);
          if (startedAt) {
            const durationMs = Math.round(performance.now() - startedAt); sectionStartedAt.current.delete(sectionId);
            if (durationMs >= 500 && settings.collectSectionEngagement) enqueue('section_engagement', { sectionId, durationMs });
          }
        }
      }
    }, { threshold: 0.4 });
    document.querySelectorAll<HTMLElement>('[data-analytics-section]').forEach((section) => sectionObserver.observe(section));
    const click = (event: MouseEvent) => {
      if (!settings.collectClicks) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-analytics-id],a,button') : null;
      if (!target) return;
      const sectionId = target.closest<HTMLElement>('[data-analytics-section]')?.dataset.analyticsSection;
      const elementId = analyticsElementId(target);
      const href = target instanceof HTMLAnchorElement ? target.href : '';
      let eventName: AnalyticsName = target.dataset.analyticsId ? 'cta_click' : 'click';
      if (/wa\.me|whatsapp/i.test(href) || /whatsapp/i.test(elementId)) eventName = 'whatsapp_click';
      else if (/^tel:/i.test(href)) eventName = 'phone_click';
      else if (/maps|mapa/i.test(href) || /map/i.test(elementId)) eventName = 'map_click';
      else if (/instagram|facebook|tiktok/i.test(href)) eventName = 'social_click';
      const scrollWidth = Math.max(document.documentElement.scrollWidth, 1); const scrollHeight = Math.max(document.documentElement.scrollHeight, 1);
      enqueue(eventName, { sectionId, elementId, normalizedX: Math.min(1, Math.max(0, event.pageX / scrollWidth)), normalizedY: Math.min(1, Math.max(0, event.pageY / scrollHeight)) });
    };
    const scroll = () => {
      const maximum = document.documentElement.scrollHeight - innerHeight;
      const depth = maximum > 0 ? Math.round((scrollY / maximum) * 100) : 100;
      for (const milestone of [25, 50, 75, 90, 100]) if (depth >= milestone && !scrollMilestones.current.has(milestone)) { scrollMilestones.current.add(milestone); enqueue('scroll_depth', { scrollDepth: milestone }); }
    };
    const focus = (event: FocusEvent) => {
      const input = event.target instanceof HTMLElement ? event.target.closest('input,select,textarea') : null;
      const form = input?.closest<HTMLFormElement>('[data-analytics-form]');
      if (!form) return; const formId = form.dataset.analyticsForm || 'contact';
      if (!formStarted.current.has(formId)) { formStarted.current.add(formId); enqueue('form_start', { elementId: formId, sectionId: form.closest<HTMLElement>('[data-analytics-section]')?.dataset.analyticsSection }); }
      enqueue('form_field_interaction', { elementId: input?.getAttribute('name') || 'field', sectionId: form.closest<HTMLElement>('[data-analytics-section]')?.dataset.analyticsSection });
    };
    const submit = (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form?.dataset.analyticsForm) return;
      const formId = form.dataset.analyticsForm;
      const data = new FormData(form);
      const fullName = String(data.get('name') || '').trim().split(/\s+/).filter(Boolean);
      formCustomerData.current.set(formId, {
        email: String(data.get('email') || ''),
        phone: String(data.get('phone') || ''),
        firstName: fullName[0] || '',
        lastName: fullName.slice(1).join(' '),
      });
      enqueue('form_submit', { elementId: formId, sectionId: form.closest<HTMLElement>('[data-analytics-section]')?.dataset.analyticsSection });
    };
    const custom = (event: Event) => {
      const detail = (event as CustomEvent).detail as AnalyticsDetail & { eventName: AnalyticsName };
      if (!detail?.eventName) return;
      const formId = detail.elementId || 'contact-form';
      const eventDetail = detail.eventName === 'form_success' && !detail.metaCustomerData
        ? { ...detail, metaCustomerData: formCustomerData.current.get(formId) }
        : detail;
      enqueue(detail.eventName, eventDetail);
      if (detail.eventName === 'form_success' || detail.eventName === 'form_error') formCustomerData.current.delete(formId);
    };
    const visibility = () => { if (document.visibilityState === 'hidden') { for (const [sectionId, startedAt] of sectionStartedAt.current) enqueue('section_engagement', { sectionId, durationMs: Math.round(performance.now() - startedAt) }); sectionStartedAt.current.clear(); flush(); } };
    document.addEventListener('click', click, true); window.addEventListener('scroll', scroll, { passive: true }); document.addEventListener('focusin', focus); document.addEventListener('submit', submit); window.addEventListener('mym:analytics', custom); document.addEventListener('visibilitychange', visibility);
    return () => { window.clearInterval(timer); sectionObserver.disconnect(); document.removeEventListener('click', click, true); window.removeEventListener('scroll', scroll); document.removeEventListener('focusin', focus); document.removeEventListener('submit', submit); window.removeEventListener('mym:analytics', custom); document.removeEventListener('visibilitychange', visibility); flush(); };
  }, [consent, pathname, publicPage, settings]);

  if (!publicPage || !consentLoaded || !settings?.enabled || consent || !settings.consentRequired) return null;
  return <aside className="fixed inset-x-3 bottom-3 z-[120] mx-auto max-w-2xl rounded-2xl border border-white/15 bg-zinc-950/95 p-4 text-white shadow-2xl backdrop-blur">
    <p className="text-sm font-semibold">Privacidad y analítica</p><p className="mt-1 text-xs leading-5 text-zinc-300">Usamos analítica propia y, si aceptás, Meta Pixel y medición server-side para medir visitas y solicitudes. Al enviar el formulario, los datos de contacto necesarios se comparten cifrados con Meta para medir la conversión y no se guardan en nuestra analítica de navegación.</p>
    <div className="mt-3 flex justify-end gap-2"><button className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold" onClick={() => { updateConsent('declined'); setConsent('declined'); }}>No permitir</button><button className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black" onClick={() => { updateConsent('accepted'); setConsent('accepted'); }}>Permitir analítica</button></div>
  </aside>;
}
