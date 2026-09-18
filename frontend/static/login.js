const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginButton = loginForm.querySelector(
    'button[type="submit"]'
);
const authDivider = document.getElementById("auth-divider");
const googleSigninButton = document.getElementById("google-signin-button");


// A failed Google sign-in redirects back here with ?error=... (see
// GET /api/auth/google/callback in backend/app.py) -- there's no JSON
// response to read on a full-page redirect, so the message travels as
// a query param instead.
const oauthError = new URLSearchParams(window.location.search).get("error");
if (oauthError) {
    loginError.textContent = oauthError;
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


loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    loginError.textContent = "";
    loginButton.disabled = true;

    const username = document
        .getElementById("username")
        .value
        .trim();

    const password = document
        .getElementById("password")
        .value;

    try {
        const response = await fetch(
            `${window.BACKEND_URL}/api/login`,
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username,
                    password
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.detail || "Login failed."
            );
        }

        window.location.href = "/chat";

    } catch (error) {
        loginError.textContent = error.message;

    } finally {
        loginButton.disabled = false;
    }
});