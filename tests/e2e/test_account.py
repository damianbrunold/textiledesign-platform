"""Registration, verification, login and logout in a real browser (the
server-side rules are covered by test_security.py)."""
import re

from playwright.sync_api import expect

from helpers import make_user


def _solve_captcha(page):
    text = page.locator("label[for=x]").inner_text()
    a, b = map(int, re.search(r"(\d+)\s*\+\s*(\d+)", text).groups())
    page.fill("#x", str(a + b))


def test_register_verify_login(page):
    page.goto("/auth/register")
    page.fill("#label", "Carla Weber")
    page.fill("#email", "carla@example.com")
    page.fill("#password", "warp-and-weft-42")
    page.fill("#confirm_password", "warp-and-weft-42")
    _solve_captcha(page)
    page.click("button[type=submit]")

    # SHOW_VERIFICATION_CODE puts the link from the mail on the page.
    link = page.locator(".dev-notice a")
    expect(link).to_be_visible()
    link.click()

    page.goto("/auth/login")
    page.fill("#email", "carla@example.com")
    page.fill("#password", "warp-and-weft-42")
    with page.expect_navigation():
        page.click("button[type=submit]")
    expect(page).to_have_url("/carla-weber")


def test_wrong_password_is_rejected(page):
    make_user("alice")
    page.goto("/auth/login")
    page.fill("#email", "alice@example.com")
    page.fill("#password", "not-the-password")
    page.click("button[type=submit]")
    expect(page).to_have_url(re.compile(r"/auth/login"))
    expect(page.get_by_text("Login data are not correct")).to_be_visible()


def test_logout(alice_page):
    alice_page.goto("/profile")
    with alice_page.expect_navigation():
        alice_page.locator("form[action='/auth/logout'] button").click()
    alice_page.goto("/profile")
    expect(alice_page).to_have_url(re.compile(r"/auth/login"))
