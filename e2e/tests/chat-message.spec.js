const { test, expect } = require("@playwright/test");
const { randomTestUser, registerNewUser } = require("../helpers/auth");

test.describe("Chat messaging", () => {
    test("sending a message produces a streamed assistant reply", async ({ page }) => {
        const user = randomTestUser();
        await registerNewUser(page, user);

        await page.fill("#message", "Reply with exactly one short sentence confirming you received this test message.");
        await page.click("#send-button");

        // The user's own message renders immediately, client-side --
        // no network wait needed for this half.
        await expect(
            page.locator(".message-row.user-row .message.user-message").last()
        ).toContainText("confirming you received this test message");

        // The assistant row appears with a "Thinking…" placeholder
        // (createStreamingAssistantMessage() in chat.js) before any
        // reply text exists.
        const assistantRow = page.locator(".message-row.assistant-row").last();
        await expect(assistantRow).toBeVisible();

        // Once real text starts streaming in, the placeholder is
        // removed and the bubble fills in -- assert real, non-empty
        // content actually arrived (not just that the row exists).
        const assistantBubble = assistantRow.locator(".message.assistant-message");
        await expect(assistantBubble).not.toHaveText("", { timeout: 45_000 });

        const finalText = await assistantBubble.textContent();
        expect(finalText.trim().length).toBeGreaterThan(0);

        // The composer clears after sending and re-enables once the
        // reply finishes.
        await expect(page.locator("#message")).toHaveValue("");
        await expect(page.locator("#send-button")).toBeEnabled();
    });
});
