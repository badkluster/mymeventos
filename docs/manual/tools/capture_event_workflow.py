"""Capture every visible event workspace tab and the integral closure screen."""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from capture_manual import ASSETS, BASE_URL, CHROME, MANUAL, MASK_SCRIPT, compact, labels, sanitize_text


EVENT_TABS = [
    "Resumen",
    "Ficha",
    "Cliente",
    "Comercial",
    "Menú",
    "Servicios",
    "Contrato",
    "Proveedores",
    "Staff",
    "Tareas",
    "Cronograma",
    "Invitación digital",
    "Pagos",
    "Actividad",
]


def settle(page, timeout: int = 12000) -> None:
    try:
        page.wait_for_load_state("networkidle", timeout=timeout)
    except PlaywrightTimeoutError:
        pass
    page.wait_for_timeout(700)
    page.add_style_tag(content="nextjs-portal { display: none !important; }")


def login(page) -> None:
    page.goto(f"{BASE_URL}/admin/login", wait_until="networkidle")
    page.locator('input[name="username"], input[type="email"], input[autocomplete="username"]').first.fill(
        os.environ["MANUAL_ADMIN_USERNAME"]
    )
    page.locator('input[type="password"]').first.fill(os.environ["MANUAL_ADMIN_PASSWORD"])
    page.get_by_role("button", name="Ingresar al backoffice", exact=True).click()
    page.wait_for_url(re.compile(r"/admin/dashboard$"), timeout=30000)


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
        "fields": labels(body, "label"),
        "buttons": labels(body, "button")[:120],
        "visible_text": sanitize_text(compact(body.inner_text()))[:18000],
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
        page.set_default_navigation_timeout(15000)
        login(page)

        page.goto(f"{BASE_URL}/admin/events", wait_until="domcontentloaded")
        settle(page)
        page.get_by_role("button", name="Ver evento", exact=True).first.click()
        settle(page)
        event_route = page.url.replace(BASE_URL, "")

        for offset, tab in enumerate(EVENT_TABS, start=53):
            page.goto(f"{BASE_URL}{event_route}", wait_until="domcontentloaded")
            settle(page)
            tab_button = page.get_by_role("button", name=tab, exact=True)
            if tab_button.count():
                tab_button.click()
                settle(page, 8000)
            filename = f"{offset:02d}-evento-{tab.lower().replace(' ', '-').replace('ó', 'o').replace('ú', 'u').replace('í', 'i')}.png"
            results.append(record(page, f"Evento — {tab}", filename))
            (MANUAL / "event-workflow-inventory.json").write_text(
                json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"{offset:02d}: {tab}", flush=True)

        page.goto(f"{BASE_URL}/admin/events", wait_until="domcontentloaded")
        settle(page)
        closure = page.get_by_role("button", name="Cierre integral", exact=True)
        if closure.count():
            closure.first.click()
            settle(page)
            results.append(record(page, "Cierre integral", "67-cierre-integral.png"))

        (MANUAL / "event-workflow-inventory.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        browser.close()
    print(json.dumps({"captured": len(results)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
