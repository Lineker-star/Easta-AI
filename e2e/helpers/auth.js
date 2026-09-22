const { expect } = require("@playwright/test");

// A fresh, collision-free identity per test run -- this suite runs
// against a real (disposable) database, so reusing a fixed username
// across runs would 409 on the second run onward. Timestamp + a random
// suffix is enough entropy for a test database that gets thrown away
// regularly; it is not trying to be cryptographically unique.
function randomTestUser() {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    return {
        username: `e2e_${unique}`,
        email: `e2e_${unique}@example.test`,
        password: "E2E-test-password-1!",
    };
}

// Fills and submits the register form, and waits for the redirect to
// /chat that a successful registration produces (see register.js).
async function registerNewUser(page, user) {
    await page.goto("/register");

    await page.fill("#username", user.username);
    await page.fill("#email", user.email);
    await page.fill("#password", user.password);
    await page.fill("#confirm-password", user.password);

    await page.click('#register-form button[type="submit"]');

    await page.waitForURL(/\/chat(\/\d+)?$/);
}

// Fills and submits the login form for an already-registered user.
async function loginUser(page, user) {
    await page.goto("/login");

    await page.fill("#username", user.username);
    await page.fill("#password", user.password);

    await page.click('#login-form button[type="submit"]');

    await page.waitForURL(/\/chat(\/\d+)?$/);
}

// Common post-login assertion: the sidebar header should show the
// logged-in username once loadSession() resolves (see chat.js).
async function expectLoggedInAs(page, username) {
    await expect(page.locator("#current-user")).toContainText(username, {
        timeout: 15_000,
    });
}

module.exports = { randomTestUser, registerNewUser, loginUser, expectLoggedInAs };
