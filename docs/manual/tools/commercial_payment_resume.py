"""Finish the synthetic payment step after synchronizing the event status."""

from __future__ import annotations

import json
import os
import re
import sys

from playwright.sync_api import sync_playwright

from capture_manual import BASE_URL, CHROME, MANUAL
from commercial_flow import capture, login, settle


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    inventory_file = MANUAL / "commercial-flow-inventory.json"
    results = json.loads(inventory_file.read_text(encoding="utf-8"))
    event_route = next(item["route"] for item in reversed(results) if re.fullmatch(r"/admin/events/[a-f0-9]{24}", item["route"]))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=str(CHROME))
        context = browser.new_context(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
        page = context.new_page()
        page.set_default_timeout(12000)
        page.set_default_navigation_timeout(20000)
        login(page)
        page.goto(f"{BASE_URL}{event_route}", wait_until="domcontentloaded")
        settle(page)

        status_select = page.locator("select").first
        status_select.select_option(label="Seña pendiente")
        settle(page)
        capture(page, "Flujo comercial — estado listo para cobrar seña", "133-flujo-estado-sena-pendiente.png", results)

        page.get_by_role("button", name="Pagos", exact=True).click()
        settle(page, 8000)
        selects = page.locator("select")
        selects.nth(1).select_option(label="Seña")
        page.locator('input[placeholder="Importe recibido"]').fill("550000")
        selects.nth(3).select_option(label="Transferencia")
        page.locator('input[placeholder="Comprobante / referencia"]').fill("MANUAL-QA-20260810")
        page.locator('textarea[placeholder="Notas opcionales"]').fill("Seña sintética registrada para documentar el manual.")
        capture(page, "Flujo comercial — seña lista para registrar", "134-flujo-sena-lista.png", results)
        page.get_by_role("button", name="Registrar pago", exact=True).click()
        settle(page)
        capture(page, "Flujo comercial — resultado final con seña", "135-flujo-resultado-final-con-sena.png", results)
        final_text = page.locator("body").inner_text()
        browser.close()

    print(json.dumps({
        "payment_registered": "$ 550.000" in final_text and "No hay pagos registrados" not in final_text,
        "event_route": event_route,
        "captures": len(results),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
