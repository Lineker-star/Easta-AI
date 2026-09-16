/* Minimal i18n helper for interface chrome (buttons, placeholders, empty
 * states). Ships English, French, and Spanish; other reply-language
 * choices in the selector fall back to English chrome (see README ->
 * "What's new in this pass" for the follow-up list). This is separate
 * from the reply-language preference sent to the backend with each
 * message — see LANGUAGE_OPTIONS in backend/app.py — though the chat UI
 * currently drives both from the same selector for simplicity. */

const SUPPORTED_UI_LANGUAGES = ["en", "fr", "es"];

let activeTranslations = {};

async function loadTranslations(languageCode) {
    const code = SUPPORTED_UI_LANGUAGES.includes(languageCode)
        ? languageCode
        : "en";

    try {
        const response = await fetch(
            `${window.STATIC_BASE_URL || "/static/"}i18n/${code}.json`
        );

        if (!response.ok) {
            throw new Error(`Failed to load ${code}.json`);
        }

        activeTranslations = await response.json();
    } catch (error) {
        console.error("i18n: falling back to English chrome", error);
        activeTranslations = {};
    }
}


function t(key, vars = {}) {
    let text = activeTranslations[key] || key;

    for (const [name, value] of Object.entries(vars)) {
        text = text.replace(`{${name}}`, value);
    }

    return text;
}


function applyStaticTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
        el.textContent = t(el.getAttribute("data-i18n"));
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
        el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
    });

    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
        const text = t(el.getAttribute("data-i18n-title"));
        el.title = text;
        el.setAttribute("aria-label", text);
    });
}
