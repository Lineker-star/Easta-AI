const { test, expect } = require("@playwright/test");
const { BACKEND_URL } = require("../helpers/env");

// Google Sign-In can't be driven through a real Google consent screen
// in an automated suite (no way to hold a live test Google account's
// credentials here, and Google actively blocks scripted logins with
// its own bot detection). Instead, this exercises a backend test-only
// route, GET /api/e2e/mock-google-callback (see backend/app.py), which
// skips the actual round trip to Google but reuses the exact same
// account-creation/linking and session-setting code as the real
// GET /api/auth/google/callback -- so everything downstream of "we
// have a verified Google profile" is exercised for real.
//
// That route 404s unless the backend has EASTA_E2E_MOCK_GOOGLE_OAUTH=true
// set -- see e2e/README.md. It must never be set in a production
// environment, so this suite (and this file in particular) should only
// ever run against a disposable/staging stack, never prod.
//
// Not covered here (out of scope for a browser-level suite): that the
// mock route correctly 404s when the flag is unset -- that's a
// backend-startup-time concern that would require restarting the
// server mid-run to exercise, not something a Playwright test can
// reasonably flip.

function randomMockGoogleEmail() {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    return `e2e-google-${unique}@example.test`;
}

test.describe("Google Sign-In (mocked)", () => {
    test("a new Google profile creates an account and lands on /chat logged in", async ({ page }) => {
        const email = randomMockGoogleEmail();
        const name = "E2E Google User";

        // A real navigation (not a fetch): the backend sets the
        // session cookie and 307-redirects to FRONTEND_URL/chat,
        // exactly like the real OAuth callback does -- Playwright
        // follows that redirect chain the same way a real browser
        // would.
        await page.goto(
            `${BACKEND_URL}/api/e2e/mock-google-callback?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`
        );

        await page.waitForURL(/\/chat(\/\d+)?$/);

        // The account was created from the Google profile's display
        // name (see generate_unique_username() in backend/app.py) --
        // assert the sidebar shows *some* logged-in username rather
        // than asserting an exact generated value, since
        // generate_unique_username()'s sanitization/suffixing logic
        // is backend implementation detail this test shouldn't have
        // to mirror.
        await expect(page.locator("#current-user")).toContainText("Logged in as", {
            timeout: 15_000,
        });
    });

    test("signing in again with the same Google profile reuses the same account", async ({ page }) => {
        const email = randomMockGoogleEmail();

        await page.goto(
            `${BACKEND_URL}/api/e2e/mock-google-callback?email=${encodeURIComponent(email)}`
        );
        await page.waitForURL(/\/chat(\/\d+)?$/);

        const firstUsername = (await page.locator("#current-user").textContent()).trim();

        await page.click("#logout-button");
        await page.waitForURL(/\/login$/);

        // Same email again -- get_user_by_google_id() should find the
        // account created above rather than creating a second one.
        await page.goto(
            `${BACKEND_URL}/api/e2e/mock-google-callback?email=${encodeURIComponent(email)}`
        );
        await page.waitForURL(/\/chat(\/\d+)?$/);

        const secondUsername = (await page.locator("#current-user").textContent()).trim();
        expect(secondUsername).toBe(firstUsername);
    });
});
