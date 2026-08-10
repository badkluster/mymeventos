"""Capture the real M&M Eventos UI for the official user manual.

This script navigates read-only screens, masks visible contact data in the page
DOM (without changing persisted data), and records a sanitized UI inventory.
Credentials are accepted only through process environment variables.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[3]
MANUAL = ROOT / "docs" / "manual"
ASSETS = MANUAL / "assets"
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
BASE_URL = "http://localhost:3000"

MODULES = [
    ("dashboard", "/admin/dashboard", "Panel principal"),
    ("calendario", "/admin/calendar", "Calendario"),
    ("leads", "/admin/leads", "Leads"),
    ("clientes", "/admin/customers", "Clientes"),
    ("presupuestos", "/admin/quotes", "Presupuestos"),
    ("eventos", "/admin/events", "Eventos"),
    ("contratos", "/admin/contracts", "Contratos"),
    ("invitaciones-digitales", "/admin/digital-invitations", "Invitaciones Digitales"),
    ("entradas-digitales", "/admin/digital-tickets", "Entradas Digitales"),
    ("escanear-entradas", "/admin/ticket-scanner", "Escanear Entradas"),
    ("ingresos", "/admin/payments", "Ingresos"),
    ("gastos", "/admin/expenses", "Gastos"),
    ("reportes", "/admin/reports", "Reportes"),
    ("produccion", "/admin/production", "Producción"),
    ("analitica", "/admin/analytics", "Analítica"),
    ("liquidacion-sueldos", "/admin/payroll", "Liquidación de Sueldos"),
    ("proveedores", "/admin/suppliers", "Proveedores"),
    ("marketing", "/admin/marketing", "Marketing"),
    ("notificaciones", "/admin/notifications", "Notificaciones"),
    ("salones", "/admin/salons", "Salones"),
    ("usuarios", "/admin/users", "Usuarios"),
    ("asistencia", "/admin/attendance", "Asistencia"),
    ("landing", "/admin/landing", "Landing"),
]


MASK_SCRIPT = r"""
() => {
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const internationalPhone = /\+54\s*(?:9\s*)?(?:\d[\s.-]*){9,11}/g;
  const localPhone = /\(?221\)?[\s.-]*\d{3,4}[\s.-]*\d{4}/g;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    let value = node.nodeValue || '';
    value = value.replace(email, 'usuario@ejemplo.com');
    value = value.replace(internationalPhone, '+54 9 221 000-0000');
    value = value.replace(localPhone, '(221) 000-0000');
    value = value.replace(/Natalia\s+Arguello/gi, 'Usuario administrador');
    value = value.replace(/Hola,\s*Natalia/gi, 'Hola, Usuario');
    node.nodeValue = value;
  }
  for (const input of document.querySelectorAll('input')) {
    if (input.type === 'password') input.value = '';
    if (input.type === 'email' && input.value) input.value = 'usuario@ejemplo.com';
    if (input.type === 'tel' && input.value) input.value = '(221) 000-0000';
  }
}
"""


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def sanitize_text(value: str) -> str:
    value = re.sub(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", "usuario@ejemplo.com", value, flags=re.I)
    value = re.sub(r"Natalia\s+Arguello", "Usuario administrador", value, flags=re.I)
    value = re.sub(r"Hola,\s*Natalia", "Hola, Usuario", value, flags=re.I)
    return value


def labels(page, selector: str, limit: int = 200) -> list[str]:
    output: list[str] = []
    for locator in page.locator(selector).all()[:limit]:
        try:
            value = compact(locator.inner_text()) or locator.get_attribute("aria-label") or ""
            value = sanitize_text(value)
            if value and value not in output and value != "Open Next.js Dev Tools":
                output.append(value)
        except Exception:
            continue
    return output


def login(page) -> None:
    username = os.environ.get("MANUAL_ADMIN_USERNAME")
    password = os.environ.get("MANUAL_ADMIN_PASSWORD")
    if not username or not password:
        raise RuntimeError("MANUAL_ADMIN_USERNAME and MANUAL_ADMIN_PASSWORD are required.")
    page.goto(f"{BASE_URL}/admin/login", wait_until="networkidle")
    page.locator('input[name="username"], input[type="email"], input[autocomplete="username"]').first.fill(username)
    page.locator('input[type="password"]').first.fill(password)
    page.get_by_role("button", name=re.compile(r"Ingresar al backoffice", re.I)).click()
    page.wait_for_url(re.compile(r"/admin/dashboard$"), timeout=30000)
    page.wait_for_load_state("networkidle")


def wait_for_ready(page) -> None:
    try:
        page.wait_for_load_state("networkidle", timeout=20000)
    except PlaywrightTimeoutError:
        pass
    page.wait_for_timeout(900)
    page.evaluate("window.scrollTo(0, 0)")
    page.add_style_tag(content="nextjs-portal { display: none !important; }")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ASSETS.mkdir(parents=True, exist_ok=True)
    inventory: list[dict] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=str(CHROME))
        context = browser.new_context(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
        page = context.new_page()
        network_issues: list[dict] = []
        page_errors: list[str] = []

        def record_response(response) -> None:
            if response.status >= 400 and response.url.startswith(BASE_URL):
                network_issues.append({"status": response.status, "url": response.url.split("?", 1)[0]})

        page.on("response", record_response)
        page.on("pageerror", lambda exc: page_errors.append(str(exc)))
        login(page)

        # Expanded menu: proves the full visible module inventory.
        for menu_label in ("Reportes y análisis", "Configuración y herramientas"):
            button = page.get_by_role("button", name=menu_label)
            if button.count():
                button.click()
        page.evaluate(MASK_SCRIPT)
        page.screenshot(path=str(ASSETS / "03-menu-completo.png"), full_page=False)

        for index, (slug, route, title) in enumerate(MODULES, start=4):
            before_issues = len(network_issues)
            before_errors = len(page_errors)
            page.goto(f"{BASE_URL}{route}", wait_until="domcontentloaded")
            wait_for_ready(page)
            page.evaluate(MASK_SCRIPT)
            filename = f"{index:02d}-{slug}.png"
            page.screenshot(path=str(ASSETS / filename), full_page=False)
            body_text = sanitize_text(compact(page.locator("body").inner_text()))
            inventory.append({
                "module": title,
                "route": route,
                "screenshot": filename,
                "url_after_navigation": page.url.replace(BASE_URL, ""),
                "headings": labels(page, "h1, h2, h3"),
                "buttons": labels(page, "button"),
                "links": labels(page, "main a, [role=main] a"),
                "fields": labels(page, "label"),
                "visible_text": body_text[:20000],
                "network_issues": network_issues[before_issues:],
                "page_errors": page_errors[before_errors:],
            })
            print(f"{index:02d}/{len(MODULES)+3}: {title}")

        browser.close()

    (MANUAL / "ui-inventory.json").write_text(
        json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    summary = {
        "modules": len(inventory),
        "screenshots": len(list(ASSETS.glob("*.png"))),
        "network_issue_count": sum(len(item["network_issues"]) for item in inventory),
        "page_error_count": sum(len(item["page_errors"]) for item in inventory),
    }
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
