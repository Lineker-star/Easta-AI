const { test, expect } = require("@playwright/test");
const { randomTestUser, registerNewUser } = require("../helpers/auth");

test.describe("Conversation rename", () => {
    test("renaming a conversation updates its sidebar label", async ({ page }) => {
        const user = randomTestUser();
        await registerNewUser(page, user);

        // A brand-new account gets one conversation auto-created by
        // initializeChat() -- see chat.js.
        const row = page.locator(".conversation-row").first();
        await expect(row).toBeVisible();

        await row.locator(".conversation-menu-button").click();
        await row.locator(".conversation-menu-item", { hasText: "Rename conversation" }).click();

        const renameInput = row.locator(".conversation-rename-input");
        await expect(renameInput).toBeVisible();

        const newTitle = `E2E renamed ${Date.now()}`;
        await renameInput.fill(newTitle);
        await renameInput.press("Enter");

        // renderConversations() rebuilds the whole list after the
        // PATCH resolves -- re-query rather than reuse `row`.
        await expect(
            page.locator(".conversation-row .conversation-link").first()
        ).toHaveText(newTitle, { timeout: 15_000 });
    });
});
