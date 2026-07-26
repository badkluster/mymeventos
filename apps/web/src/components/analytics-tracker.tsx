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

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api');
const visitorKey = 'mym.analytics.visitor';
const attributionKey = 'mym.analytics.attribution';
const consentKey = 'mym.analytics.consent';
const pageVersion = 'landing-2026-07';

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
export function analyticsAttributionId() {
  if (typeof window === 'undefined') return '';
  return identifier(window.localStorage, attributionKey);
}
export function emitAnalyticsEvent(eventName: AnalyticsName, detail: { sectionId?: string; elementId?: string; entityId?: string } = {}) {
  window.dispatchEvent(new CustomEvent('mym:analytics', { detail: { eventName, ...detail } }));
}

export function AnalyticsTracker() {
  const pathname = usePathname() ?? '';
  const [settings, setSettings] = useState<TrackerSettings | null>(null);
  const [consent, setConsent] = useState<'accepted' | 'declined' | null>(() => (
    typeof window === 'undefined'
      ? null
      : (localStorage.getItem(consentKey) as 'accepted' | 'declined' | null)
  ));
  const queue = useRef<QueueEvent[]>([]);
  const sessionId = useRef('');
  const visitorId = useRef('');
  const attributionId = useRef('');
  const utm = useRef<Record<string, string>>({});
  const viewedSections = useRef(new Set<string>());
  const sectionStartedAt = useRef(new Map<string, number>());
  const scrollMilestones = useRef(new Set<number>());
  const formStarted = useRef(new Set<string>());
  const publicPage = !pathname.startsWith('/admin') && !pathname.startsWith('/invitacion') && !pathname.startsWith('/invitados') && !pathname.startsWith('/entrada');

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
    const enqueue = (eventName: AnalyticsName, detail: Record<string, unknown> = {}) => {
      queue.current.push({
        eventId: crypto.randomUUID(), anonymousVisitorId: visitorId.current, sessionId: sessionId.current, attributionId: attributionId.current,
        eventName, pagePath: location.pathname, pageTitle: document.title.slice(0, 240), referrer: document.referrer.slice(0, 500),
        ...utm.current, deviceType: deviceType(), browserFamily: browserFamily(), operatingSystem: operatingSystem(),
        viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, language: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        occurredAt: new Date().toISOString(), pageVersion, ...detail,
      });
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
      const elementId = target.dataset.analyticsId || 'unidentified';
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
    const submit = (event: SubmitEvent) => { const form = event.target instanceof HTMLFormElement ? event.target : null; if (form?.dataset.analyticsForm) enqueue('form_submit', { elementId: form.dataset.analyticsForm, sectionId: form.closest<HTMLElement>('[data-analytics-section]')?.dataset.analyticsSection }); };
    const custom = (event: Event) => { const detail = (event as CustomEvent).detail as { eventName: AnalyticsName; sectionId?: string; elementId?: string; entityId?: string }; if (detail?.eventName) enqueue(detail.eventName, detail); };
    const visibility = () => { if (document.visibilityState === 'hidden') { for (const [sectionId, startedAt] of sectionStartedAt.current) enqueue('section_engagement', { sectionId, durationMs: Math.round(performance.now() - startedAt) }); sectionStartedAt.current.clear(); flush(); } };
    document.addEventListener('click', click, true); window.addEventListener('scroll', scroll, { passive: true }); document.addEventListener('focusin', focus); document.addEventListener('submit', submit); window.addEventListener('mym:analytics', custom); document.addEventListener('visibilitychange', visibility);
    return () => { window.clearInterval(timer); sectionObserver.disconnect(); document.removeEventListener('click', click, true); window.removeEventListener('scroll', scroll); document.removeEventListener('focusin', focus); document.removeEventListener('submit', submit); window.removeEventListener('mym:analytics', custom); document.removeEventListener('visibilitychange', visibility); flush(); };
  }, [consent, pathname, publicPage, settings]);

  if (!publicPage || !settings?.enabled || consent || !settings.consentRequired) return null;
  return <aside className="fixed inset-x-3 bottom-3 z-[120] mx-auto max-w-2xl rounded-2xl border border-white/15 bg-zinc-950/95 p-4 text-white shadow-2xl backdrop-blur">
    <p className="text-sm font-semibold">Privacidad y analítica</p><p className="mt-1 text-xs leading-5 text-zinc-300">Usamos analítica propia para entender qué secciones resultan útiles. No capturamos valores de formularios ni datos sensibles.</p>
    <div className="mt-3 flex justify-end gap-2"><button className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold" onClick={() => { localStorage.setItem(consentKey, 'declined'); setConsent('declined'); }}>No permitir</button><button className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black" onClick={() => { localStorage.setItem(consentKey, 'accepted'); setConsent('accepted'); }}>Permitir analítica</button></div>
  </aside>;
}
