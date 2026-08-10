"""Resume the synthetic commercial flow after the quote has been accepted."""

from __future__ import annotations

import json
import os
import re
import sys

from playwright.sync_api import sync_playwright

from capture_manual import BASE_URL, CHROME, MANUAL
from commercial_flow import capture, click_confirmation_if_present, login, settle


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    inventory_file = MANUAL / "commercial-flow-inventory.json"
    results = json.loads(inventory_file.read_text(encoding="utf-8"))
    quote_route = next(item["route"] for item in reversed(results) if "presupuesto creado" in item["title"].lower())

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=str(CHROME))
        context = browser.new_context(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
        page = context.new_page()
        page.set_default_timeout(12000)
        page.set_default_navigation_timeout(20000)
        login(page)

        page.goto(f"{BASE_URL}{quote_route}", wait_until="domcontentloaded")
        settle(page)
        page_text = page.locator("body").inner_text()
        if "Convertido" in page_text:
            if results and results[-1].get("title") == "Flujo comercial — presupuesto aceptado":
                results[-1]["title"] = "Flujo comercial — presupuesto convertido"
            capture(page, "Flujo comercial — presupuesto convertido", "124-flujo-presupuesto-convertido.png", results)
        else:
            capture(page, "Flujo comercial — presupuesto aceptado", "124-flujo-presupuesto-aceptado.png", results)
            create_event = page.get_by_role("button", name="Crear evento", exact=True)
            if not create_event.count():
                create_event = page.get_by_role("button", name="Aceptar y crear evento", exact=True)
            create_event.first.click()
            settle(page)
            if page.locator('[role="dialog"]').count() and page.locator('[role="dialog"]').last.is_visible():
                capture(page, "Flujo comercial — confirmar creación del evento", "125-flujo-conversion-confirmacion.png", results)
                click_confirmation_if_present(page, r"Crear evento|Aceptar|Confirmar")

        if not re.search(r"/admin/events/[a-f0-9]{24}$", page.url):
            view_event = page.get_by_role("button", name="Ver evento", exact=True)
            if not view_event.count():
                view_event = page.get_by_role("link", name="Ver evento", exact=True)
            view_event.first.click()
            settle(page)
        event_route = page.url.replace(BASE_URL, "")
        capture(page, "Flujo comercial — evento creado", "126-flujo-evento-creado.png", results)

        # Complete the converted customer's contractual data.
        page.get_by_role("button", name="Cliente", exact=True).click()
        settle(page, 8000)
        page.get_by_role("button", name="Ver cliente", exact=True).click()
        dialog = page.locator('[role="dialog"]').last
        dialog.wait_for(state="visible", timeout=12000)
        dialog.get_by_label("Documento / DNI", exact=True).fill("99999999")
        dialog.get_by_label("Ocupación", exact=True).fill("Registro QA")
        dialog.get_by_label("Domicilio", exact=True).fill("Calle de Prueba 123, La Plata")
        dialog.get_by_role("button", name="Guardar datos", exact=True).click()
        dialog.wait_for(state="hidden", timeout=20000)
        settle(page)
        capture(page, "Flujo comercial — cliente completado", "127-flujo-cliente-completo.png", results)

        page.goto(f"{BASE_URL}{event_route}", wait_until="domcontentloaded")
        settle(page)
        page.get_by_role("button", name="Contrato", exact=True).click()
        settle(page, 8000)
        capture(page, "Flujo comercial — checklist del contrato", "128-flujo-contrato-checklist.png", results)
        generate = page.get_by_role("button", name=re.compile(r"Crear contrato|Generar contrato", re.I))
        if generate.count():
            generate.first.click()
            settle(page)
            click_confirmation_if_present(page, r"Generar|Confirmar")
        view_contract = page.get_by_role("button", name="Ver contrato", exact=True)
        if not view_contract.count():
            view_contract = page.get_by_role("link", name="Ver contrato", exact=True)
        view_contract.first.click()
        settle(page)
        contract_route = page.url.replace(BASE_URL, "")
        capture(page, "Flujo comercial — contrato generado", "129-flujo-contrato-generado.png", results)

        approve = page.get_by_role("button", name="Aprobar", exact=True)
        if approve.count():
            approve.first.click()
            settle(page)
            click_confirmation_if_present(page, r"Aprobar|Confirmar")
        page.goto(f"{BASE_URL}{contract_route}", wait_until="domcontentloaded")
        settle(page)
        capture(page, "Flujo comercial — contrato aprobado", "130-flujo-contrato-aprobado.png", results)

        page.goto(f"{BASE_URL}{event_route}", wait_until="domcontentloaded")
        settle(page)
        page.get_by_role("button", name="Pagos", exact=True).click()
        settle(page, 8000)
        selects = page.locator("select")
        selects.nth(1).select_option(label="Seña")
        page.locator('input[placeholder="Importe recibido"]').fill("500000")
        selects.nth(3).select_option(label="Transferencia")
        page.locator('input[placeholder="Comprobante / referencia"]').fill("MANUAL-QA-20260810")
        page.locator('textarea[placeholder="Notas opcionales"]').fill("Seña sintética registrada para documentar el manual.")
        capture(page, "Flujo comercial — registrar seña", "131-flujo-pago-formulario.png", results)
        page.get_by_role("button", name="Registrar pago", exact=True).click()
        settle(page)
        capture(page, "Flujo comercial — resultado final", "132-flujo-resultado-final.png", results)

        browser.close()

    print(json.dumps({
        "completed": True,
        "quote_route": quote_route,
        "event_route": event_route,
        "contract_route": contract_route,
        "captures": len(results),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
