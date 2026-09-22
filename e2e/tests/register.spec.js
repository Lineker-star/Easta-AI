const { test, expect } = require("@playwright/test");
const { randomTestUser, expectLoggedInAs } = require("../helpers/auth");

test.describe("Registration", () => {
    test("a new user can register and lands on /chat logged in", async ({ page }) => {
        const user = randomTestUser();

        await page.goto("/register");

        await page.fill("#username", user.username);
        await page.fill("#email", user.email);
        await page.fill("#password", user.password);
        await page.fill("#confirm-password", user.password);

        await page.click('#register-form button[type="submit"]');

        await page.waitForURL(/\/chat(\/\d+)?$/);
        await expectLoggedInAs(page, user.username);
    });

    test("mismatched passwords are rejected client-side, no request sent", async ({ page }) => {
        const user = randomTestUser();

        await page.goto("/register");

        await page.fill("#username", user.username);
        await page.fill("#email", user.email);
        await page.fill("#password", user.password);
        await page.fill("#confirm-password", "a-completely-different-password");

        await page.click('#register-form button[type="submit"]');

        await expect(page.locator("#register-error")).toHaveText(
            "Passwords do not match."
        );
        // Still on /register -- the mismatch is caught before any
        // network request, per register.js.
        await expect(page).toHaveURL(/\/register$/);
    });

    test("registering the same username twice is rejected", async ({ page }) => {
        const user = randomTestUser();

        await page.goto("/register");
        await page.fill("#username", user.username);
        await page.fill("#email", user.email);
        await page.fill("#password", user.password);
        await page.fill("#confirm-password", user.password);
        await page.click('#register-form button[type="submit"]');
        await page.waitForURL(/\/chat(\/\d+)?$/);

        // Log out, then attempt to register the exact same username
        // again with a different email.
        await page.click("#logout-button");
        await page.waitForURL(/\/login$/);

        await page.goto("/register");
        await page.fill("#username", user.username);
        await page.fill("#email", `second-${user.email}`);
        await page.fill("#password", user.password);
        await page.fill("#confirm-password", user.password);
        await page.click('#register-form button[type="submit"]');

        await expect(page.locator("#register-error")).not.toHaveText("");
        await expect(page).toHaveURL(/\/register$/);
    });
});
