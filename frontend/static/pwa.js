/* Registers the service worker and wires up "Install EASTA" buttons
 * wherever they exist on the current page (landing hero, chat sidebar
 * footer) -- safe to include on every page even where no install
 * button is present, since every lookup is optional-guarded.
 *
 * Desktop (Chrome/Edge) and Android Chrome support a real install
 * prompt via the beforeinstallprompt event, captured below. iOS
 * Safari does not support beforeinstallprompt at all -- there is no
 * programmatic install API there, only the manual Share -> "Add to
 * Home Screen" flow, so iOS visitors instead see a short instruction
 * instead of a button that would otherwise silently do nothing. */

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((error) => {
            console.error("EASTA: service worker registration failed", error);
        });
    });
}


function isIos() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}


function isStandalone() {
    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true
    );
}


let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    document.querySelectorAll("[data-install-button]").forEach((button) => {
        button.hidden = false;
    });
});


window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    document.querySelectorAll("[data-install-button]").forEach((button) => {
        button.hidden = true;
    });
});


async function triggerInstall(button) {
    if (deferredInstallPrompt) {
        button.hidden = true;
        deferredInstallPrompt.prompt();

        try {
            await deferredInstallPrompt.userChoice;
        } catch {
            // Ignore -- either choice just resolves the prompt.
        }

        deferredInstallPrompt = null;
        return;
    }

    if (isIos()) {
        window.alert(
            "To install EASTA: tap the Share button, then \"Add to Home Screen\"."
        );
    }
}


function initializeInstallButtons() {
    const buttons = document.querySelectorAll("[data-install-button]");

    if (isStandalone()) {
        // Already running as an installed app -- nothing to offer.
        return;
    }

    buttons.forEach((button) => {
        // iOS gets a button that shows instructions (no
        // beforeinstallprompt there); other browsers stay hidden
        // until beforeinstallprompt actually fires, confirming the
        // browser can install it.
        if (isIos()) {
            button.hidden = false;
        }

        button.addEventListener("click", () => triggerInstall(button));
    });
}


initializeInstallButtons();
