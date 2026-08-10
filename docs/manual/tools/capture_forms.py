"""Capture important forms and detail views from the real local UI."""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from capture_manual import ASSETS, BASE_URL, CHROME, MANUAL, MASK_SCRIPT, compact, labels, sanitize_text


SCENARIOS = [
    ("calendario-nuevo-item", "/admin/calendar", "Crear item"),
    ("lead-nuevo", "/admin/leads", "Nuevo lead"),
    ("cliente-nuevo", "/admin/customers", "Nuevo cliente"),
    ("presupuesto-nuevo", "/admin/quotes", "Nuevo presupuesto"),
    ("evento-nuevo", "/admin/events", "Nuevo evento"),
    ("invitacion-nueva", "/admin/digital-invitations", "Nueva invitación"),
    ("entrada-nueva-publicacion", "/admin/digital-tickets", "Nueva publicación"),
    ("gasto-nueva-categoria", "/admin/expenses", "Nueva categoría"),
    ("gasto-registrar", "/admin/expenses", "Registrar gasto"),
    ("produccion-generar", "/admin/production", "Generar producción"),
    ("sueldos-liquidacion-individual", "/admin/payroll", "Liquidación individual"),
    ("sueldos-nuevo-lote", "/admin/payroll", "Nuevo lote"),
    ("proveedor-nuevo", "/admin/suppliers", "Nuevo proveedor"),
    ("marketing-nueva-campana", "/admin/marketing", "Nueva campaña"),
    ("salon-nuevo", "/admin/salons", "Nuevo salón"),
    ("usuario-nuevo", "/admin/users", "Nuevo usuario"),
]

DETAIL_SCENARIOS = [
    ("lead-detalle", "/admin/leads", "Ver detalle"),
    ("cliente-detalle", "/admin/customers", "Ver cliente"),
    ("evento-detalle", "/admin/events", "Ver evento"),
    ("contrato-detalle", "/admin/contracts", "Ver contrato"),
    ("invitacion-editar", "/admin/digital-invitations", "Editar"),
    ("ingreso-detalle", "/admin/payments", "Ver pago"),
    ("proveedor-editar", "/admin/suppliers", "Editar"),
    ("salon-detalle", "/admin/salons", "Ver detalle"),
    ("salon-paquetes", "/admin/salons", "Configurar paquetes"),
    ("usuario-detalle", "/admin/users", "Ver detalle"),
    ("usuario-permisos", "/admin/users", "Accesos y permisos"),
]


def login(page) -> None:
    username = os.environ.get("MANUAL_ADMIN_USERNAME")
    password = os.environ.get("MANUAL_ADMIN_PASSWORD")
    if not username or not password:
        raise RuntimeError("Manual credentials are required in the process environment.")
    page.goto(f"{BASE_URL}/admin/login", wait_until="networkidle")
    page.locator('input[name="username"], input[type="email"], input[autocomplete="username"]').first.fill(username)
    page.locator('input[type="password"]').first.fill(password)
    page.get_by_role("button", name="Ingresar al backoffice", exact=True).click()
    page.wait_for_url(re.compile(r"/admin/dashboard$"), timeout=30000)


def settle(page) -> None:
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except PlaywrightTimeoutError:
        pass
    page.wait_for_timeout(800)
    page.add_style_tag(content="nextjs-portal { display: none !important; }")


def capture_scenario(page, slug: str, route: str, action: str, number: int) -> dict:
    page.goto(f"{BASE_URL}{route}", wait_until="domcontentloaded")
    settle(page)
    candidates = page.get_by_role("button", name=action, exact=True)
    if not candidates.count():
        candidates = page.get_by_role("link", name=action, exact=True)
    if not candidates.count():
        return {"slug": slug, "route": route, "action": action, "captured": False, "reason": "Control no encontrado"}
    candidates.first.click()
    settle(page)
    page.evaluate(MASK_SCRIPT)
    filename = f"{number:02d}-{slug}.png"
    page.screenshot(path=str(ASSETS / filename), full_page=False)
    dialog = page.locator('[role="dialog"]').last
    scope = dialog if dialog.count() and dialog.is_visible() else page.locator("body")
    text_value = sanitize_text(compact(scope.inner_text()))[:14000]
    fields = labels(scope, "label")
    placeholders = []
    for field in scope.locator("input, textarea, select").all()[:100]:
        try:
            placeholder = field.get_attribute("placeholder") or field.get_attribute("name") or ""
            if placeholder and placeholder not in placeholders:
                placeholders.append(placeholder)
        except Exception:
            continue
    return {
        "slug": slug,
        "route": route,
        "action": action,
        "captured": True,
        "result_route": page.url.replace(BASE_URL, ""),
        "screenshot": filename,
        "headings": labels(scope, "h1, h2, h3, [role=heading]"),
        "fields": fields,
        "placeholders": placeholders,
        "buttons": labels(scope, "button"),
        "visible_text": text_value,
    }


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ASSETS.mkdir(parents=True, exist_ok=True)
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=str(CHROME))
        context = browser.new_context(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
        page = context.new_page()
        page.set_default_timeout(10000)
        page.set_default_navigation_timeout(15000)
        login(page)
        for offset, scenario in enumerate(SCENARIOS + DETAIL_SCENARIOS, start=27):
            try:
                result = capture_scenario(page, *scenario, offset)
            except Exception as exc:
                result = {
                    "slug": scenario[0],
                    "route": scenario[1],
                    "action": scenario[2],
                    "captured": False,
                    "reason": type(exc).__name__,
                }
            results.append(result)
            (MANUAL / "forms-inventory.json").write_text(
                json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"{offset:02d}: {scenario[0]} - {'OK' if result['captured'] else 'NO ENCONTRADO'}", flush=True)
        browser.close()
    (MANUAL / "forms-inventory.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"captured": sum(1 for item in results if item["captured"]), "total": len(results)}))


if __name__ == "__main__":
    main()
