"""Capture secondary workspaces and tabs that are reachable from main modules."""

from __future__ import annotations

import json
import os
import re
import sys

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from capture_manual import ASSETS, BASE_URL, CHROME, MANUAL, MASK_SCRIPT, compact, labels, sanitize_text


DIRECT_PAGES = [
    ("produccion-plan", "/admin/production/6a732306e5799c0f0f219303", "Producción — plan del evento"),
    ("produccion-consolidada", "/admin/production/consolidated", "Producción consolidada"),
    ("produccion-reglas", "/admin/production/rules", "Producción — reglas"),
    ("produccion-catalogo", "/admin/production/catalog", "Producción — catálogo"),
    ("gastos-proveedor", "/admin/expenses/by-supplier", "Gastos por proveedor"),
    ("rentabilidad", "/admin/expenses/profitability", "Rentabilidad"),
    ("invitaciones-plantillas", "/admin/digital-invitations/templates", "Plantillas de invitaciones"),
    ("invitaciones-ejemplos", "/admin/digital-invitations/examples", "Ejemplos de invitaciones"),
    ("entradas-ventas", "/admin/digital-tickets/orders", "Entradas — ventas"),
    ("analitica-mapa-calor", "/admin/analytics/heatmap", "Analítica — mapa de calor"),
    ("analitica-configuracion", "/admin/analytics/settings", "Analítica — configuración"),
    ("reporte-leads", "/admin/reports/leads", "Reporte de leads"),
    ("reporte-presupuestos", "/admin/reports/quotes", "Reporte de presupuestos"),
    ("reporte-eventos", "/admin/reports/events", "Reporte de eventos"),
    ("reporte-contratos", "/admin/reports/contracts", "Reporte de contratos"),
    ("reporte-pagos", "/admin/reports/payments", "Reporte de pagos"),
    ("reporte-control-pagos", "/admin/reports/payment-control", "Control mensual de pagos"),
    ("reporte-gastos", "/admin/reports/expenses", "Reporte de gastos"),
    ("marketing-campanas", "/admin/marketing/campaigns", "Marketing — campañas"),
    ("marketing-plantillas", "/admin/marketing/templates", "Marketing — plantillas"),
    ("marketing-audiencias", "/admin/marketing/audiences", "Marketing — audiencias"),
    ("marketing-historial", "/admin/marketing/history", "Marketing — historial"),
    ("marketing-configuracion", "/admin/marketing/settings", "Marketing — configuración"),
    ("perfil", "/admin/profile", "Mi perfil"),
    ("configuracion", "/admin/settings", "Configuración"),
]

CLICK_PAGES = [
    ("presupuestos-listado", "/admin/quotes", "Presupuestos", "Presupuestos — listado"),
    ("entradas-panel-publicacion", "/admin/digital-tickets", "Panel", "Entradas — panel de publicación"),
    ("scanner-validacion", "/admin/ticket-scanner", "Escanear para esta publicación", "Escáner y validación"),
    ("asistencia-historial", "/admin/attendance", "Historial", "Asistencia — historial"),
    ("asistencia-incidencias", "/admin/attendance", "Incidencias", "Asistencia — incidencias"),
    ("asistencia-correcciones", "/admin/attendance", "Correcciones", "Asistencia — correcciones"),
    ("asistencia-configuracion", "/admin/attendance", "Configuración", "Asistencia — configuración"),
    ("sueldos-asistencias", "/admin/payroll", "Asistencias", "Liquidación — asistencias"),
    ("sueldos-liquidaciones", "/admin/payroll", "Liquidaciones", "Liquidación — liquidaciones"),
    ("sueldos-lotes", "/admin/payroll", "Lotes de liquidación", "Liquidación — lotes"),
    ("sueldos-ajustes", "/admin/payroll", "Adelantos y ajustes", "Liquidación — adelantos y ajustes"),
    ("sueldos-empleados", "/admin/payroll", "Configuración de empleados", "Liquidación — empleados"),
    ("sueldos-conceptos", "/admin/payroll", "Conceptos", "Liquidación — conceptos"),
    ("sueldos-historial", "/admin/payroll", "Historial y auditoría", "Liquidación — auditoría"),
    ("landing-promociones", "/admin/landing", "Promociones", "Landing — promociones"),
    ("landing-galeria", "/admin/landing", "Galería", "Landing — galería"),
    ("landing-faq", "/admin/landing", "FAQ", "Landing — preguntas frecuentes"),
    ("landing-testimonios", "/admin/landing", "Testimonios", "Landing — testimonios"),
    ("landing-servicios", "/admin/landing", "Servicios", "Landing — servicios"),
    ("landing-tipos-evento", "/admin/landing", "Tipos de evento", "Landing — tipos de evento"),
    ("landing-como-trabajamos", "/admin/landing", "Cómo trabajamos", "Landing — cómo trabajamos"),
]


def login(page) -> None:
    page.goto(f"{BASE_URL}/admin/login", wait_until="networkidle")
    page.locator('input[name="username"], input[type="email"], input[autocomplete="username"]').first.fill(os.environ["MANUAL_ADMIN_USERNAME"])
    page.locator('input[type="password"]').first.fill(os.environ["MANUAL_ADMIN_PASSWORD"])
    page.get_by_role("button", name="Ingresar al backoffice", exact=True).click()
    page.wait_for_url(re.compile(r"/admin/dashboard$"), timeout=30000)


def settle(page, timeout: int = 15000) -> None:
    try:
        page.wait_for_load_state("networkidle", timeout=timeout)
    except PlaywrightTimeoutError:
        pass
    page.wait_for_timeout(700)
    page.add_style_tag(content="nextjs-portal { display: none !important; }")


def record(page, slug: str, title: str, number: int) -> dict:
    page.evaluate(MASK_SCRIPT)
    page.evaluate("window.scrollTo(0, 0)")
    filename = f"{number:02d}-{slug}.png"
    page.screenshot(path=str(ASSETS / filename), full_page=False)
    body = page.locator("body")
    return {
        "slug": slug,
        "title": title,
        "route": page.url.replace(BASE_URL, ""),
        "screenshot": filename,
        "headings": labels(body, "h1, h2, h3")[:80],
        "fields": labels(body, "label")[:100],
        "buttons": labels(body, "button")[:150],
        "visible_text": sanitize_text(compact(body.inner_text()))[:20000],
    }


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=str(CHROME))
        context = browser.new_context(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
        page = context.new_page()
        page.set_default_timeout(10000)
        page.set_default_navigation_timeout(18000)
        login(page)
        number = 74
        for slug, route, title in DIRECT_PAGES:
            try:
                page.goto(f"{BASE_URL}{route}", wait_until="domcontentloaded")
                settle(page)
                results.append(record(page, slug, title, number))
                status = "OK"
            except Exception as exc:
                results.append({"slug": slug, "title": title, "route": route, "error": type(exc).__name__})
                status = "ERROR"
            print(f"{number:02d}: {title} — {status}", flush=True)
            number += 1
            (MANUAL / "secondary-inventory.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

        for slug, route, action, title in CLICK_PAGES:
            try:
                page.goto(f"{BASE_URL}{route}", wait_until="domcontentloaded")
                settle(page)
                control = page.get_by_role("button", name=action, exact=True)
                if not control.count():
                    control = page.get_by_role("link", name=action, exact=True)
                control.first.click()
                settle(page)
                results.append(record(page, slug, title, number))
                status = "OK"
            except Exception as exc:
                results.append({"slug": slug, "title": title, "route": route, "error": type(exc).__name__})
                status = "ERROR"
            print(f"{number:02d}: {title} — {status}", flush=True)
            number += 1
            (MANUAL / "secondary-inventory.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

        browser.close()
    print(json.dumps({"captured": sum(1 for item in results if "screenshot" in item), "total": len(results)}))


if __name__ == "__main__":
    main()
