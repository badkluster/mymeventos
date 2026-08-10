"""Capture permission controls, account menu, scanner, and ticket detail."""

from __future__ import annotations

import json
import os
import re
import sys

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from capture_manual import ASSETS, BASE_URL, CHROME, MANUAL, MASK_SCRIPT, compact, labels, sanitize_text


def login(page) -> None:
    page.goto(f"{BASE_URL}/admin/login", wait_until="networkidle")
    page.locator('input[name="username"], input[type="email"], input[autocomplete="username"]').first.fill(os.environ["MANUAL_ADMIN_USERNAME"])
    page.locator('input[type="password"]').first.fill(os.environ["MANUAL_ADMIN_PASSWORD"])
    page.get_by_role("button", name="Ingresar al backoffice", exact=True).click()
    page.wait_for_url(re.compile(r"/admin/dashboard$"), timeout=30000)


def settle(page) -> None:
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except PlaywrightTimeoutError:
        pass
    page.wait_for_timeout(700)
    page.add_style_tag(content="nextjs-portal { display: none !important; }")


def record(page, title: str, filename: str) -> dict:
    page.evaluate(MASK_SCRIPT)
    page.evaluate("window.scrollTo(0, 0)")
    page.screenshot(path=str(ASSETS / filename), full_page=False)
    body = page.locator("body")
    return {
        "title": title,
        "route": page.url.replace(BASE_URL, ""),
        "screenshot": filename,
        "headings": labels(body, "h1, h2, h3"),
        "fields": labels(body, "label")[:120],
        "buttons": labels(body, "button")[:160],
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
        page.set_default_timeout(12000)
        login(page)

        # Full account menu, including profile, settings, public site, and logout.
        account = page.locator("button").filter(has_text=re.compile(r"@"))
        if account.count():
            account.first.click()
            settle(page)
            results.append(record(page, "Menú de la cuenta", "136-menu-cuenta.png"))

        page.goto(f"{BASE_URL}/admin/users", wait_until="domcontentloaded")
        settle(page)
        page.get_by_role("button", name="Accesos y permisos", exact=True).first.click()
        settle(page)
        results.append(record(page, "Roles y permisos", "137-roles-permisos.png"))

        page.goto(f"{BASE_URL}/admin/ticket-scanner", wait_until="domcontentloaded")
        settle(page)
        scanner_button = page.get_by_role("button", name=re.compile(r"Escanear para esta publicación", re.I)).first
        scanner_button.click()
        settle(page)
        results.append(record(page, "Validación de entradas", "138-scanner-validacion.png"))

        page.goto(f"{BASE_URL}/admin/digital-tickets", wait_until="domcontentloaded")
        settle(page)
        page.get_by_role("button", name="Ver detalle", exact=True).first.click()
        settle(page)
        results.append(record(page, "Detalle de publicación de entradas", "139-entrada-publicacion-detalle.png"))

        page.goto(f"{BASE_URL}/entradas", wait_until="domcontentloaded")
        settle(page)
        results.append(record(page, "Catálogo público de entradas", "140-entradas-catalogo-publico.png"))

        (MANUAL / "misc-inventory.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        browser.close()
    print(json.dumps({"captured": len(results)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
