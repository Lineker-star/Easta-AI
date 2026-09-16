function apiRequest(path, options = {}) {
    return fetch(
        `${window.BACKEND_URL}${path}`,
        {
            ...options,
            credentials: "include",
            headers: {
                ...options.headers
            }
        }
    );
}


async function readJsonResponse(response) {
    let data;

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (response.status === 401) {
        window.location.href = "/login";
        throw new Error("Please log in again.");
    }

    if (!response.ok) {
        throw new Error(data.detail || "The request failed.");
    }

    return data;
}


const profileForm = document.getElementById("profile-form");
const profileError = document.getElementById("profile-error");
const profileSuccess = document.getElementById("profile-success");
const usernameInput = document.getElementById("account-username");
const emailInput = document.getElementById("account-email");
const memberSince = document.getElementById("account-member-since");

const passwordForm = document.getElementById("password-form");
const passwordError = document.getElementById("password-error");
const passwordSuccess = document.getElementById("password-success");
const currentPasswordInput = document.getElementById("current-password");
const newPasswordInput = document.getElementById("new-password");
const confirmNewPasswordInput = document.getElementById("confirm-new-password");

const currentPlanBadge = document.getElementById("current-plan-badge");


function capitalize(text) {
    if (!text) {
        return text;
    }
    return text.charAt(0).toUpperCase() + text.slice(1);
}


async function loadAccount() {
    const response = await apiRequest("/api/account");
    const data = await readJsonResponse(response);

    usernameInput.value = data.username;
    emailInput.value = data.email;
    memberSince.textContent = new Date(data.created_at)
        .toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric"
        });
    currentPlanBadge.textContent = capitalize(data.plan);
}


profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    profileError.textContent = "";
    profileSuccess.textContent = "";

    const submitButton = profileForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
        const response = await apiRequest("/api/account", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: usernameInput.value.trim(),
                email: emailInput.value.trim()
            })
        });

        const data = await readJsonResponse(response);

        usernameInput.value = data.user.username;
        emailInput.value = data.user.email;
        currentPlanBadge.textContent = capitalize(data.user.plan);
        profileSuccess.textContent = "Profile updated.";

    } catch (error) {
        profileError.textContent = error.message;

    } finally {
        submitButton.disabled = false;
    }
});


passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    passwordError.textContent = "";
    passwordSuccess.textContent = "";

    const submitButton = passwordForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
        const response = await apiRequest("/api/account/password", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                current_password: currentPasswordInput.value,
                new_password: newPasswordInput.value,
                confirm_new_password: confirmNewPasswordInput.value
            })
        });

        await readJsonResponse(response);

        passwordForm.reset();
        passwordSuccess.textContent = "Password changed.";

    } catch (error) {
        passwordError.textContent = error.message;

    } finally {
        submitButton.disabled = false;
    }
});


async function initializeAccountPage() {
    try {
        await loadAccount();
    } catch (error) {
        console.error(error);
        profileError.textContent = error.message || "Could not load your account.";
    }
}


initializeAccountPage();
