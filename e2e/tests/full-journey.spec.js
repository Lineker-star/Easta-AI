const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { randomTestUser, expectLoggedInAs } = require("../helpers/auth");

const FIXTURE_PATH = path.join(__dirname, "..", "fixtures", "sample-attachment.txt");

// One continuous session covering register -> login -> message + a
// streamed reply -> attach a file -> generate a PDF -> rename a
// conversation -> delete a conversation, in that order, in a single
// test. Each step's own behavior also has a smaller, focused spec
// elsewhere in this directory (register.spec.js, login.spec.js, ...)
// that isolates it and covers edge cases this flow doesn't -- this
// file exists to catch anything that only breaks when the steps run
// back-to-back against real, accumulating state (the same user, the
// same conversation list growing/shrinking), which isolated specs
// starting fresh every time can't catch.
//
// Google Sign-In is deliberately NOT part of this flow: it's a
// separate entry path into the app (an alternative to the password
// register/login this flow already exercises for the same account),
// not a step that chains onto an in-progress password-authenticated
// session -- see google-signin.spec.js for that coverage instead.
test.describe("Full journey", () => {
    test("register, chat, attach, generate, rename, delete", async ({ page }) => {
        const user = randomTestUser();

        // --- register -------------------------------------------------
        await page.goto("/register");
        await page.fill("#username", user.username);
        await page.fill("#email", user.email);
        await page.fill("#password", user.password);
        await page.fill("#confirm-password", user.password);
        await page.click('#register-form button[type="submit"]');
        await page.waitForURL(/\/chat(\/\d+)?$/);
        await expectLoggedInAs(page, user.username);

        // --- log out, then log back in ---------------------------------
        await page.click("#logout-button");
        await page.waitForURL(/\/login$/);

        await page.fill("#username", user.username);
        await page.fill("#password", user.password);
        await page.click('#login-form button[type="submit"]');
        await page.waitForURL(/\/chat(\/\d+)?$/);
        await expectLoggedInAs(page, user.username);

        // --- send a message and get a streamed reply --------------------
        await page.fill("#message", "Reply with exactly one short sentence for an E2E test.");
        await page.click("#send-button");

        await expect(
            page.locator(".message-row.user-row .message.user-message").last()
        ).toContainText("Reply with exactly one short sentence");

        const firstAssistantBubble = page
            .locator(".message-row.assistant-row")
            .last()
            .locator(".message.assistant-message");
        await expect(firstAssistantBubble).not.toHaveText("", { timeout: 45_000 });

        // --- attach a file and send another message ----------------------
        await page.setInputFiles("#file-input", FIXTURE_PATH);
        await expect(page.locator("#attachment-row .attachment-chip")).toContainText(
            "sample-attachment.txt"
        );

        await page.fill("#message", "Here is a file for the full-journey E2E test.");
        await page.click("#send-button");

        await expect(page.locator("#attachment-row")).toBeEmpty();
        await expect(
            page.locator(".message-row.user-row .message.user-message").last()
        ).toContainText("Here is a file for the full-journey E2E test.");

        const secondAssistantBubble = page
            .locator(".message-row.assistant-row")
            .last()
            .locator(".message.assistant-message");
        await expect(secondAssistantBubble).not.toHaveText("", { timeout: 45_000 });

        // --- generate a PDF -----------------------------------------------
        await page.fill(
            "#message",
            "Generate a PDF document containing exactly this text: " +
                "Hello from the EASTA full-journey E2E test."
        );
        await page.click("#send-button");

        const canvasPanel = page.locator("#canvas-panel");
        await expect(canvasPanel).toBeVisible({ timeout: 60_000 });

        const downloadLink = page.locator("#canvas-download-link");
        await expect(downloadLink).toBeVisible();

        const [download] = await Promise.all([
            page.waitForEvent("download"),
            downloadLink.click(),
        ]);
        const savedPath = await download.path();
        const header = fs.readFileSync(savedPath).subarray(0, 5).toString("ascii");
        expect(header).toBe("%PDF-");

        // --- rename the conversation ---------------------------------------
        const activeRow = page.locator(".conversation-row.active").first();
        await activeRow.locator(".conversation-menu-button").click();
        await activeRow
            .locator(".conversation-menu-item", { hasText: "Rename conversation" })
            .click();

        const newTitle = `Full journey ${Date.now()}`;
        const renameInput = activeRow.locator(".conversation-rename-input");
        await renameInput.fill(newTitle);
        await renameInput.press("Enter");

        await expect(
            page.locator(".conversation-row .conversation-link", { hasText: newTitle })
        ).toBeVisible({ timeout: 15_000 });

        // --- delete the conversation -----------------------------------------
        const rowToDelete = page.locator(".conversation-row", { hasText: newTitle });
        await rowToDelete.locator(".conversation-menu-button").click();
        await rowToDelete
            .locator(".conversation-menu-item", { hasText: "Delete conversation" })
            .click();
        await rowToDelete.locator(".conversation-confirm-delete").click();

        // Deleting the only/active conversation auto-creates a fresh
        // one (see deleteConversationAndRefresh() in chat.js) --
        // confirm the renamed one specifically is gone, not that the
        // sidebar is empty.
        await expect(
            page.locator(".conversation-row .conversation-link", { hasText: newTitle })
        ).toHaveCount(0, { timeout: 15_000 });
    });
});
