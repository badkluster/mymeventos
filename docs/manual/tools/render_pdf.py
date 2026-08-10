"""Render the official manual HTML to a print-ready A4 PDF."""

from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[3]
MANUAL = ROOT / "docs" / "manual"
HTML = MANUAL / "Manual_Usuario_M&M_Eventos.html"
PDF = MANUAL / "Manual_Usuario_M&M_Eventos.pdf"
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=str(CHROME))
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        page.goto(HTML.as_uri(), wait_until="networkidle")
        page.emulate_media(media="print")
        page.wait_for_function("Array.from(document.images).every(img => img.complete && img.naturalWidth > 0)")
        page.pdf(
            path=str(PDF),
            format="A4",
            print_background=True,
            prefer_css_page_size=True,
            display_header_footer=True,
            header_template='''<div style="width:100%;padding:0 15mm;font-family:Arial,sans-serif;font-size:7.5px;color:#777;display:flex;justify-content:space-between;"><span>M&amp;M Eventos</span><span>Manual de Usuario Oficial</span></div>''',
            footer_template='''<div style="width:100%;padding:0 15mm;font-family:Arial,sans-serif;font-size:7.5px;color:#777;display:flex;justify-content:space-between;"><span>Versión 1.0 · 10/08/2026</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>''',
        )
        browser.close()
    print(PDF)


if __name__ == "__main__":
    main()
