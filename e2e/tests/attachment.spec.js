const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { randomTestUser, registerNewUser } = require("../helpers/auth");

const FIXTURE_PATH = path.join(__dirname, "..", "fixtures", "sample-attachment.txt");

test.describe("File attachment", () => {
    test("attaching a text file shows a chip, and sending clears it", async ({ page }) => {
        const user = randomTestUser();
        await registerNewUser(page, user);

        // #file-input is a real (CSS-hidden, not display:none) file
        // input -- Playwright can set files on it directly without
        // needing to click the visible "attach" button first, the
        // same way a real browser's native file picker would.
        await page.setInputFiles("#file-input", FIXTURE_PATH);

        const chip = page.locator("#attachment-row .attachment-chip");
        await expect(chip).toBeVisible();
        await expect(chip).toContainText("sample-attachment.txt");

        await page.fill("#message", "Here is a file for the E2E attachment test.");
        await page.click("#send-button");

        // The attachment row is cleared as part of sending (see the
        // message-form submit handler in chat.js) -- the chip should
        // be gone, not just re-rendered with the same content.
        await expect(page.locator("#attachment-row")).toBeEmpty();

        await expect(
            page.locator(".message-row.user-row .message.user-message").last()
        ).toContainText("Here is a file for the E2E attachment test.");

        // A reply still streams in normally with an attachment
        // present -- same "real, non-empty content arrived" check as
        // chat-message.spec.js.
        const assistantBubble = page
            .locator(".message-row.assistant-row")
            .last()
            .locator(".message.assistant-message");
        await expect(assistantBubble).not.toHaveText("", { timeout: 45_000 });
    });
});
