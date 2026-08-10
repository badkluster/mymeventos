"""Read-only UI exploration helper for the M&M Eventos user manual.

The helper intentionally prints only visible UI text and never prints credentials,
tokens, cookies, or environment values.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / "docs" / "manual" / "assets"
STATE = ROOT / "docs" / "manual" / ".auth-state.json"
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
BASE_URL = "http://localhost:3000"


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for env_file in (ROOT / ".env", ROOT / "apps" / "api" / ".env"):
        if not env_file.exists():
            continue
        for raw_line in env_file.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            clean_value = value.strip().strip('"').strip("'")
            if clean_value and not values.get(key.strip()):
                values[key.strip()] = clean_value
    return values


def compact(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def describe_page(page) -> dict:
    links = []
    for link in page.locator("a").all():
        try:
            label = compact(link.inner_text())
            href = link.get_attribute("href") or ""
            if label or href:
                links.append({"text": label, "href": href})
        except Exception:
            continue
    buttons = []
    for button in page.locator("button").all():
        try:
            label = compact(button.inner_text()) or button.get_attribute("aria-label") or ""
            if label:
                buttons.append(label)
        except Exception:
            continue
    headings = []
    for heading in page.locator("h1, h2, h3").all():
        try:
            label = compact(heading.inner_text())
            if label:
                headings.append(label)
        except Exception:
            continue
    return {
        "url": page.url,
        "title": page.title(),
        "headings": headings,
        "buttons": buttons,
        "links": links,
        "text": compact(page.locator("body").inner_text())[:16000],
    }


def sign_in(page, env: dict[str, str]) -> None:
    username = os.environ.get("MANUAL_ADMIN_USERNAME")
    password = os.environ.get("MANUAL_ADMIN_PASSWORD")
    if not username or not password:
        matcher = ROOT / "docs" / "manual" / "tools" / "match_local_admin.cjs"
        match_process = subprocess.run(
            ["node", str(matcher)],
            cwd=str(ROOT / "apps" / "api"),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=30,
            check=False,
        )
        try:
            match = json.loads(match_process.stdout)
        except json.JSONDecodeError:
            match = {"matched": False}
        username = match.get("identifier")
        password = env.get(match.get("passwordSource", ""))
    if not username or not password:
        raise RuntimeError("No local admin credentials are configured.")
    page.goto(f"{BASE_URL}/admin", wait_until="networkidle")
    if "/login" not in page.url and page.locator("input[type=password]").count() == 0:
        return
    user_input = page.locator(
        'input[name="username"], input[name="email"], input[type="email"], input[autocomplete="username"]'
    ).first
    password_input = page.locator('input[type="password"]').first
    user_input.fill(username)
    password_input.fill(password)
    submit = page.get_by_role("button", name=re.compile(r"ingresar|iniciar|acceder", re.I)).first
    submit.click()
    page.wait_for_url(re.compile(r"/admin/(?:dashboard)?$"), timeout=30000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    target = sys.argv[1] if len(sys.argv) > 1 else "landing"
    ASSETS.mkdir(parents=True, exist_ok=True)
    env = load_env()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=str(CHROME))
        context_args = {"viewport": {"width": 1440, "height": 960}, "device_scale_factor": 1}
        if STATE.exists():
            context_args["storage_state"] = str(STATE)
        context = browser.new_context(**context_args)
        page = context.new_page()
        console_errors: list[str] = []
        page_errors: list[str] = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda exc: page_errors.append(str(exc)))

        if target == "landing":
            page.goto(BASE_URL, wait_until="networkidle")
            page.screenshot(path=str(ASSETS / "00-landing.png"), full_page=True)
        elif target == "login":
            page.goto(f"{BASE_URL}/admin", wait_until="networkidle")
            page.screenshot(path=str(ASSETS / "01-login.png"), full_page=True)
        elif target == "admin":
            sign_in(page, env)
            context.storage_state(path=str(STATE))
            page.screenshot(path=str(ASSETS / "02-panel-principal.png"), full_page=True)
        elif target == "sidebar":
            sign_in(page, env)
            context.storage_state(path=str(STATE))
            for label in ("Reportes y análisis", "Configuración y herramientas"):
                button = page.get_by_role("button", name=label)
                if button.count():
                    button.click()
                    page.wait_for_timeout(300)
            page.screenshot(path=str(ASSETS / "03-menu-completo.png"), full_page=True)
        else:
            sign_in(page, env)
            context.storage_state(path=str(STATE))
            page.goto(f"{BASE_URL}{target}", wait_until="networkidle")
            page.wait_for_timeout(500)
        result = describe_page(page)
        result["console_error_count"] = len(console_errors)
        result["page_error_count"] = len(page_errors)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    main()
