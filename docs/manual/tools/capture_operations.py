"""Capture operational event subtabs, closure readiness, and production detail."""

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


def settle(page, timeout: int = 20000) -> None:
    try:
        page.wait_for_load_state("networkidle", timeout=timeout)
    except PlaywrightTimeoutError:
        pass
    page.wait_for_timeout(900)
    page.add_style_tag(content="nextjs-portal { display: none !important; }")


def wait_past_loading(page, phrase: str, timeout: int = 35000) -> None:
    try:
        page.get_by_text(phrase, exact=False).wait_for(state="hidden", timeout=timeout)
    except PlaywrightTimeoutError:
        pass
    settle(page, 10000)


def capture(page, title: str, filename: str) -> dict:
    page.evaluate(MASK_SCRIPT)
    page.evaluate("window.scrollTo(0, 0)")
    page.screenshot(path=str(ASSETS / filename), full_page=False)
    body = page.locator("body")
    return {
        "title": title,
        "route": page.url.replace(BASE_URL, ""),
        "screenshot": filename,
        "headings": labels(body, "h1, h2, h3"),
        "fields": labels(body, "label")[:100],
        "buttons": labels(body, "button")[:140],
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
        page.set_default_navigation_timeout(20000)
        login(page)

        page.goto(f"{BASE_URL}/admin/events", wait_until="domcontentloaded")
        settle(page)
        page.get_by_role("button", name="Ver evento", exact=True).first.click()
        settle(page)
        event_route = page.url.replace(BASE_URL, "")

        for offset, (tab, filename_slug) in enumerate([
            ("Lista invitados y mesas", "invitados-mesas"),
            ("Logística", "logistica"),
            ("Vajilla y stock", "vajilla-stock"),
            ("Stock de productos", "stock-productos"),
        ], start=68):
            page.goto(f"{BASE_URL}{event_route}", wait_until="domcontentloaded")
            settle(page)
            page.get_by_role("button", name="Cronograma", exact=True).click()
            settle(page, 8000)
            control = page.get_by_role("button", name=tab, exact=True)
            if control.count():
                control.click()
                settle(page, 10000)
            results.append(capture(page, tab, f"{offset:02d}-{filename_slug}.png"))

        closure_route = f"{event_route}/closure"
        page.goto(f"{BASE_URL}{closure_route}", wait_until="domcontentloaded")
        wait_past_loading(page, "Cargando cierre del evento")
        results.append(capture(page, "Cierre integral", "72-cierre-integral-detalle.png"))

        page.goto(f"{BASE_URL}/admin/production", wait_until="domcontentloaded")
        settle(page)
        detail_link = page.locator('a[href^="/admin/production/"]').first
        if detail_link.count():
            detail_link.click()
            wait_past_loading(page, "Cargando")
            results.append(capture(page, "Producción — detalle", "73-produccion-detalle.png"))

        (MANUAL / "operations-inventory.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        browser.close()
    print(json.dumps({"captured": len(results)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
