const { test, expect } = require("@playwright/test");
const { randomTestUser, registerNewUser } = require("../helpers/auth");

test.describe("Conversation delete", () => {
    test("deleting a conversation removes it from the sidebar", async ({ page }) => {
        const user = randomTestUser();
        await registerNewUser(page, user);

        // Rename the auto-created first conversation to something
        // distinctive, so it can't be confused with the second one
        // (both would otherwise default to the same "New Chat" title).
        const keepTitle = `Keep me ${Date.now()}`;
        const firstRow = page.locator(".conversation-row").first();
        await firstRow.locator(".conversation-menu-button").click();
        await firstRow
            .locator(".conversation-menu-item", { hasText: "Rename conversation" })
            .click();
        const renameInput = firstRow.locator(".conversation-rename-input");
        await renameInput.fill(keepTitle);
        await renameInput.press("Enter");
        await expect(
            page.locator(".conversation-row .conversation-link", { hasText: keepTitle })
        ).toBeVisible({ timeout: 15_000 });

        // Start a second conversation -- now there are two rows.
        await page.click('#new-chat-form button[type="submit"]');
        await expect(page.locator(".conversation-row")).toHaveCount(2);

        // Delete the second (still-default-titled, currently active)
        // conversation, not the one just renamed.
        const conversationToDelete = page
            .locator(".conversation-row")
            .filter({ hasNotText: keepTitle })
            .first();

        await conversationToDelete.locator(".conversation-menu-button").click();
        await conversationToDelete
            .locator(".conversation-menu-item", { hasText: "Delete conversation" })
            .click();

        await expect(
            conversationToDelete.locator(".conversation-confirm-message")
        ).toBeVisible();

        await conversationToDelete.locator(".conversation-confirm-delete").click();

        // Back down to one conversation, and it's the one that was
        // deliberately kept.
        await expect(page.locator(".conversation-row")).toHaveCount(1, {
            timeout: 15_000,
        });
        await expect(
            page.locator(".conversation-row .conversation-link").first()
        ).toHaveText(keepTitle);
    });
});
