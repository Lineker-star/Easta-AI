// @ts-check
const { defineConfig, devices } = require("@playwright/test");

const { BASE_URL } = require("./helpers/env");

module.exports = defineConfig({
    testDir: "./tests",
    // The full-journey test deliberately runs every step in one
    // conversation/session in order -- keep it (and every other spec
    // here) single-worker so two specs never race to register the
    // same throwaway username against a shared disposable database.
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    // Generous: several steps here wait on a real streamed LLM reply
    // or a real generated-document tool call, not a mocked response --
    // see README.md's flakiness note.
    timeout: 60_000,
    expect: {
        timeout: 15_000,
    },
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: BASE_URL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
