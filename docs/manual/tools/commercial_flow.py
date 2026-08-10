"""Create and document one synthetic commercial flow through the real UI.

This intentionally uses only authenticated product actions. It does not access
the database directly and never triggers an external payment provider.
"""

from __future__ import annotations

import json
import os
import re
import sys

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from capture_manual import ASSETS, BASE_URL, CHROME, MANUAL, compact, labels, sanitize_text


CONTACT_NAME = "Manual QA"
CONTACT_SURNAME = "Operador"
FULL_NAME = f"{CONTACT_NAME} {CONTACT_SURNAME}"
EMAIL = "manual.qa.20260810@example.invalid"
PHONE = "2210000000"
EVENT_DATE = "2026-10-15"

COMMERCIAL_MASK_SCRIPT = r"""
() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    let value = node.nodeValue || '';
    value = value.replace(/Natalia\s+Arguello/gi, 'Usuario administrador');
    value = value.replace(/info\.mymsalones@gmail\.com/gi, 'usuario@ejemplo.com');
    value = value.replace(/Hola,\s*Natalia/gi, 'Hola, Usuario');
    node.nodeValue = value;
  }
  for (const input of document.querySelectorAll('input[type=password]')) input.value = '';
}
"""


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
    page.wait_for_timeout(800)
    page.add_style_tag(content="nextjs-portal { display: none !important; }")


def capture(page, title: str, filename: str, results: list[dict]) -> None:
    page.evaluate(COMMERCIAL_MASK_SCRIPT)
    page.evaluate("window.scrollTo(0, 0)")
    page.screenshot(path=str(ASSETS / filename), full_page=False)
    scope = page.locator('[role="dialog"]').last
    if not scope.count() or not scope.is_visible():
        scope = page.locator("body")
    results.append({
        "title": title,
        "route": page.url.replace(BASE_URL, ""),
        "screenshot": filename,
        "headings": labels(scope, "h1, h2, h3, [role=heading]")[:80],
        "fields": labels(scope, "label")[:120],
        "buttons": labels(scope, "button")[:140],
        "visible_text": sanitize_text(compact(scope.inner_text()))[:20000],
    })
    (MANUAL / "commercial-flow-inventory.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def choose_option_containing(select, phrase: str) -> None:
    options = select.locator("option").all()
    for option in options:
        label = compact(option.inner_text())
        if phrase.lower() in label.lower():
            select.select_option(value=option.get_attribute("value"))
            return
    raise RuntimeError(f"No option contains: {phrase}")


def click_confirmation_if_present(page, pattern: str) -> None:
    dialog = page.locator('[role="dialog"]').last
    if not dialog.count() or not dialog.is_visible():
        return
    button = dialog.get_by_role("button", name=re.compile(pattern, re.I))
    if button.count():
        button.last.click()
        settle(page)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    results: list[dict] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=str(CHROME))
        context = browser.new_context(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
        page = context.new_page()
        page.set_default_timeout(12000)
        page.set_default_navigation_timeout(20000)
        login(page)

        # 1. Lead.
        page.goto(f"{BASE_URL}/admin/leads", wait_until="domcontentloaded")
        settle(page)
        page.get_by_role("button", name="Nuevo lead", exact=True).click()
        dialog = page.locator('[role="dialog"]').last
        dialog.get_by_label("Nombre", exact=True).fill(CONTACT_NAME)
        dialog.get_by_label("Apellido", exact=True).fill(CONTACT_SURNAME)
        dialog.get_by_label("Teléfono", exact=True).fill(PHONE)
        dialog.get_by_label("Email", exact=True).fill(EMAIL)
        dialog.get_by_label("Origen", exact=False).select_option(label="Manual")
        dialog.get_by_label("Tipo de evento", exact=True).fill("Cumpleaños")
        dialog.get_by_label("Fecha estimativa del evento", exact=True).fill(EVENT_DATE)
        dialog.get_by_label("Cantidad de personas", exact=True).fill("80")
        dialog.get_by_label("Salones de interés", exact=False).select_option(label="San Carlos")
        dialog.get_by_label("Mensaje", exact=True).fill("Registro sintético creado para documentar el Manual de Usuario oficial.")
        dialog.get_by_label("Notas internas", exact=True).fill("[MANUAL_USUARIO_QA_20260810] Datos ficticios; no contactar.")
        capture(page, "Flujo comercial — lead completo antes de guardar", "120-flujo-lead-formulario.png", results)
        dialog.get_by_role("button", name="Guardar lead", exact=True).click()
        dialog.wait_for(state="hidden", timeout=20000)
        settle(page)
        page.get_by_role("button", name="Ver detalle", exact=True).first.click()
        settle(page)
        if FULL_NAME not in page.locator("body").inner_text():
            raise RuntimeError("The newly created lead was not found at the top of the list.")
        lead_route = page.url.replace(BASE_URL, "")
        capture(page, "Flujo comercial — lead creado", "121-flujo-lead-creado.png", results)

        # 2. Quote linked to the lead.
        page.goto(f"{BASE_URL}/admin/quotes", wait_until="domcontentloaded")
        settle(page)
        page.get_by_role("button", name="Nuevo presupuesto", exact=True).click()
        dialog = page.locator('[role="dialog"]').last
        dialog.get_by_role("button", name="Buscar", exact=True).click()
        lead_select = dialog.get_by_label("Leads", exact=False)
        choose_option_containing(lead_select, FULL_NAME)
        dialog.get_by_label("San Carlos", exact=True).check()
        package_select = dialog.get_by_label("Paquete", exact=False)
        package_select.select_option(label="Banquete Premium")
        dialog.get_by_label("Agasajado/a", exact=True).fill("Persona de prueba")
        dialog.get_by_label("Color de mantelería", exact=True).fill("Blanco")
        dialog.get_by_label("Vegetarianos", exact=True).fill("2")
        dialog.get_by_label("Celíacos", exact=True).fill("1")
        settle(page, 8000)
        capture(page, "Flujo comercial — presupuesto completo", "122-flujo-presupuesto-formulario.png", results)
        dialog.get_by_role("button", name="Crear presupuesto", exact=True).click()
        dialog.wait_for(state="hidden", timeout=25000)
        settle(page)

        page.get_by_role("button", name="Presupuestos", exact=True).click()
        settle(page)
        row = page.locator("tr").filter(has_text=FULL_NAME).first
        if not row.count():
            raise RuntimeError("The newly created quote was not visible in the quote list.")
        row.get_by_role("button", name="Ver detalle", exact=True).click()
        settle(page)
        quote_route = page.url.replace(BASE_URL, "")
        capture(page, "Flujo comercial — presupuesto creado", "123-flujo-presupuesto-creado.png", results)

        # 3. Accept and convert to an event.
        page.get_by_role("button", name="Aceptar y crear evento", exact=True).click()
        settle(page)
        if page.locator('[role="dialog"]').count() and page.locator('[role="dialog"]').last.is_visible():
            capture(page, "Flujo comercial — confirmar conversión", "124-flujo-conversion-confirmacion.png", results)
            click_confirmation_if_present(page, r"Aceptar|Confirmar|Crear evento")
        if not re.search(r"/admin/events/[a-f0-9]{24}$", page.url):
            view_event = page.get_by_role("button", name="Ver evento", exact=True)
            if not view_event.count():
                view_event = page.get_by_role("link", name="Ver evento", exact=True)
            view_event.first.click()
            settle(page)
        event_route = page.url.replace(BASE_URL, "")
        capture(page, "Flujo comercial — evento creado", "125-flujo-evento-creado.png", results)

        # 4. Complete the client data required for a contract.
        page.get_by_role("button", name="Cliente", exact=True).click()
        settle(page, 8000)
        page.get_by_role("button", name="Ver cliente", exact=True).click()
        settle(page)
        page.get_by_role("button", name="Editar datos", exact=True).click()
        dialog = page.locator('[role="dialog"]').last
        dialog.get_by_label("Documento / DNI", exact=True).fill("99999999")
        dialog.get_by_label("Ocupación", exact=True).fill("Registro QA")
        dialog.get_by_label("Domicilio", exact=True).fill("Calle de Prueba 123, La Plata")
        dialog.get_by_label("Notas", exact=True).fill("Datos ficticios utilizados exclusivamente para el manual.")
        dialog.get_by_role("button", name="Guardar datos", exact=True).click()
        dialog.wait_for(state="hidden", timeout=20000)
        settle(page)
        capture(page, "Flujo comercial — cliente completado", "126-flujo-cliente-completo.png", results)

        # 5. Generate and approve the contract.
        page.goto(f"{BASE_URL}{event_route}", wait_until="domcontentloaded")
        settle(page)
        page.get_by_role("button", name="Contrato", exact=True).click()
        settle(page, 8000)
        capture(page, "Flujo comercial — checklist del contrato", "127-flujo-contrato-checklist.png", results)
        generate = page.get_by_role("button", name=re.compile(r"Generar contrato", re.I))
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
        capture(page, "Flujo comercial — contrato generado", "128-flujo-contrato-generado.png", results)
        approve = page.get_by_role("button", name="Aprobar", exact=True)
        if approve.count():
            approve.first.click()
            settle(page)
            click_confirmation_if_present(page, r"Aprobar|Confirmar")
        page.goto(f"{BASE_URL}{contract_route}", wait_until="domcontentloaded")
        settle(page)
        capture(page, "Flujo comercial — contrato aprobado", "129-flujo-contrato-aprobado.png", results)

        # 6. Register a synthetic deposit. No payment provider is invoked.
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
        capture(page, "Flujo comercial — registrar seña", "130-flujo-pago-formulario.png", results)
        page.get_by_role("button", name="Registrar pago", exact=True).click()
        settle(page)
        capture(page, "Flujo comercial — resultado final", "131-flujo-resultado-final.png", results)

        browser.close()

    print(json.dumps({
        "completed": True,
        "lead_route": lead_route,
        "quote_route": quote_route,
        "event_route": event_route,
        "contract_route": contract_route,
        "captures": len(results),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
