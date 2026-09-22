const fs = require("node:fs");
const { test, expect } = require("@playwright/test");
const { randomTestUser, registerNewUser } = require("../helpers/auth");

test.describe("Document generation", () => {
    test("asking for a PDF opens the canvas with a real downloadable PDF", async ({ page }) => {
        const user = randomTestUser();
        await registerNewUser(page, user);

        // "pdf" and "generate" both match _GENERATION_KEYWORDS in
        // backend/app.py, which is what routes this turn to a
        // tool-capable model in the first place -- phrased this
        // explicitly (not just "make me something") to keep this
        // LLM-dependent test as reliable as a real model call can be.
        await page.fill(
            "#message",
            "Generate a PDF document containing exactly this text: " +
                "Hello from the EASTA Playwright E2E suite."
        );
        await page.click("#send-button");

        // The canvas panel auto-opens once the "canvas" stream event
        // arrives (see renderCanvas()/showCanvasPanel() in chat.js) --
        // generous timeout since this is a real tool-calling turn, not
        // a plain chat reply.
        const canvasPanel = page.locator("#canvas-panel");
        await expect(canvasPanel).toBeVisible({ timeout: 60_000 });
        await expect(page.locator("#canvas-kind-badge")).toHaveText("Document");

        const downloadLink = page.locator("#canvas-download-link");
        await expect(downloadLink).toBeVisible();
        await expect(downloadLink).not.toHaveAttribute("href", "");

        const [download] = await Promise.all([
            page.waitForEvent("download"),
            downloadLink.click(),
        ]);

        const savedPath = await download.path();
        expect(savedPath).toBeTruthy();

        // The strongest possible assertion here: this is a real PDF,
        // not just a link that happened to render -- every valid PDF
        // file starts with the literal bytes "%PDF-".
        const header = fs.readFileSync(savedPath).subarray(0, 5).toString("ascii");
        expect(header).toBe("%PDF-");
    });
});
