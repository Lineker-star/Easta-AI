const { test, expect } = require("@playwright/test");
const {
    randomTestUser,
    registerNewUser,
    loginUser,
    expectLoggedInAs,
} = require("../helpers/auth");

test.describe("Login", () => {
    test("a registered user can log out and log back in", async ({ page }) => {
        const user = randomTestUser();

        await registerNewUser(page, user);
        await expectLoggedInAs(page, user.username);

        await page.click("#logout-button");
        await page.waitForURL(/\/login$/);

        await loginUser(page, user);
        await expectLoggedInAs(page, user.username);
    });

    test("a wrong password is rejected with a visible error", async ({ page }) => {
        const user = randomTestUser();

        await registerNewUser(page, user);
        await page.click("#logout-button");
        await page.waitForURL(/\/login$/);

        await page.goto("/login");
        await page.fill("#username", user.username);
        await page.fill("#password", "definitely-the-wrong-password");
        await page.click('#login-form button[type="submit"]');

        await expect(page.locator("#login-error")).not.toHaveText("");
        await expect(page).toHaveURL(/\/login$/);
    });

    test("visiting /chat while logged out redirects to /login", async ({ page }) => {
        await page.context().clearCookies();
        await page.goto("/chat");
        await page.waitForURL(/\/login$/);
    });
});
