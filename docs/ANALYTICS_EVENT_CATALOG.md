# Catálogo de eventos Analytics

Eventos aceptados:

`session_start`, `page_view`, `section_view`, `section_engagement`, `scroll_depth`, `click`, `cta_click`, `whatsapp_click`, `phone_click`, `map_click`, `social_click`, `gallery_open`, `gallery_navigation`, `form_start`, `form_field_interaction`, `form_submit`, `form_success`, `form_error`, `promotion_view`, `promotion_click`, `salon_view` y `package_view`.

Propiedades admitidas están tipadas en el endpoint. Los identificadores de sección y CTA son estables; no se usa el texto visible como clave. Coordenadas de clic se guardan normalizadas entre 0 y 1.

## Conversiones hacia GA4 (dataLayer)

`apps/web/src/lib/analytics-conversions.ts#buildGa4Payload` arma el payload. `whatsapp_click`, `phone_click`, `form_start`, `form_submit` y `generate_lead` llevan siempre `venue_id` (`la_plata` | `villa_elisa` | `san_carlos`, o vacío si no se conoce), `venue_name`, `contact_channel` (`whatsapp` | `phone` | `form`) y `page_path` (sin query string). No se envían nombres, teléfonos ni emails.

- `whatsapp_click`: solo clics con destino real `wa.me` o `whatsapp.com`. Abrir el selector `/whatsapp` o el modal de salones no es una conversión. El salón sale de `data-analytics-entity`.
- `generate_lead`: solo después de que `POST /public/quick-quote` responde 201 (`form_success`).
- Los clics de contacto se registran aunque `collectClicks` esté apagado (sin coordenadas).

GTM v7 todavía dispara `whatsapp_click` por clic en enlace y no lee estos parámetros: ver los pasos manuales en `docs/seo/SEO_AUDIT_2026-10-29.md` §4.2.

