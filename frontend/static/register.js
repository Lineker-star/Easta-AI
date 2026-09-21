const registerForm = document.getElementById(
    "register-form"
);

const registerError = document.getElementById(
    "register-error"
);

const registerButton = registerForm.querySelector(
    'button[type="submit"]'
);

const authDivider = document.getElementById("auth-divider");
const googleSigninButton = document.getElementById("google-signin-button");


// See login.js's identical nextPath -- same "come back to the page
// that sent you here" behavior, e.g. an org invite link.
const nextPath = registerForm.dataset.next || "/chat";


// Phase 25: see login.js's identical helper.
function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, { ...options, signal: controller.signal })
        .catch((error) => {
            if (error.name === "AbortError") {
                throw new Error(
                    "Request timed out — check your connection and try again."
                );
            }
            throw error;
        })
        .finally(() => clearTimeout(timeoutId));
}


// Same hide-rather-than-show-broken pattern as the mic button /
// Research toggle: only reveal "Continue with Google" once the
// backend confirms it's actually configured.
fetch(`${window.BACKEND_URL}/api/features`)
    .then((response) => response.json())
    .then((features) => {
        if (features.google_signin) {
            authDivider.hidden = false;
            googleSigninButton.hidden = false;
        }
    })
    .catch(() => {});


registerForm.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        registerError.textContent = "";

        const username = document
            .getElementById("username")
            .value
            .trim();

        const email = document
            .getElementById("email")
            .value
            .trim();

        const password = document
            .getElementById("password")
            .value;

        const confirmPassword = document
            .getElementById("confirm-password")
            .value;

        if (password !== confirmPassword) {
            registerError.textContent =
                "Passwords do not match.";

            return;
        }

        registerButton.disabled = true;
        const originalLabel = registerButton.textContent;
        registerButton.textContent = "Creating account…";

        try {
            const response = await fetchWithTimeout(
                `${window.BACKEND_URL}/api/register`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        username,
                        email,
                        password,
                        confirm_password: confirmPassword
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail || "Registration failed."
                );
            }

            window.location.href = nextPath;

        } catch (error) {
            registerError.textContent = error.message;

        } finally {
            registerButton.disabled = false;
            registerButton.textContent = originalLabel;
        }
    }
);