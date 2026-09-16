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

const apiKeysError = document.getElementById("api-keys-error");
const apiKeysList = document.getElementById("api-keys-list");
const newApiKeyForm = document.getElementById("new-api-key-form");
const apiKeyNameInput = document.getElementById("api-key-name");
const newApiKeyReveal = document.getElementById("new-api-key-reveal");
const newApiKeyValue = document.getElementById("new-api-key-value");
const copyNewApiKeyButton = document.getElementById("copy-new-api-key");


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
    const originalLabel = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Saving…";

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
        submitButton.textContent = originalLabel;
    }
});


passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    passwordError.textContent = "";
    passwordSuccess.textContent = "";

    const submitButton = passwordForm.querySelector('button[type="submit"]');
    const originalLabel = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Saving…";

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
        submitButton.textContent = originalLabel;
    }
});


function formatDateTime(value) {
    return new Date(value).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}


function renderApiKeys(keys) {
    apiKeysList.innerHTML = "";

    if (keys.length === 0) {
        const empty = document.createElement("p");
        empty.className = "usage-empty";
        empty.textContent = "No API keys yet.";
        apiKeysList.appendChild(empty);
        return;
    }

    const table = document.createElement("table");
    table.className = "usage-table";

    const thead = document.createElement("thead");
    thead.innerHTML =
        "<tr><th>Name</th><th>Created</th><th>Last used</th><th></th></tr>";
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    keys.forEach((key) => {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        nameCell.textContent = key.name;

        const createdCell = document.createElement("td");
        createdCell.textContent = formatDateTime(key.created_at);

        const lastUsedCell = document.createElement("td");
        lastUsedCell.textContent = key.last_used_at
            ? formatDateTime(key.last_used_at)
            : "Never";

        const actionCell = document.createElement("td");

        if (key.revoked_at) {
            const revokedLabel = document.createElement("span");
            revokedLabel.className = "api-key-revoked-label";
            revokedLabel.textContent = "Revoked";
            actionCell.appendChild(revokedLabel);
        } else {
            const revokeButton = document.createElement("button");
            revokeButton.type = "button";
            revokeButton.className = "message-action-button";
            revokeButton.textContent = "Revoke";
            revokeButton.addEventListener("click", () => revokeApiKey(key.id));
            actionCell.appendChild(revokeButton);
        }

        row.appendChild(nameCell);
        row.appendChild(createdCell);
        row.appendChild(lastUsedCell);
        row.appendChild(actionCell);
        tbody.appendChild(row);
    });

    table.appendChild(tbody);

    const scrollWrap = document.createElement("div");
    scrollWrap.className = "table-scroll";
    scrollWrap.appendChild(table);
    apiKeysList.appendChild(scrollWrap);
}


async function loadApiKeys() {
    const response = await apiRequest("/api/account/api-keys");
    const data = await readJsonResponse(response);
    renderApiKeys(data.api_keys);
}


async function revokeApiKey(keyId) {
    if (!window.confirm("Revoke this API key? Anything using it will stop working immediately.")) {
        return;
    }

    apiKeysError.textContent = "";

    try {
        const response = await apiRequest(`/api/account/api-keys/${keyId}`, {
            method: "DELETE"
        });
        await readJsonResponse(response);
        await loadApiKeys();
    } catch (error) {
        apiKeysError.textContent = error.message;
    }
}


newApiKeyForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    apiKeysError.textContent = "";
    newApiKeyReveal.hidden = true;

    const submitButton = newApiKeyForm.querySelector('button[type="submit"]');
    const originalLabel = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Generating…";

    try {
        const response = await apiRequest("/api/account/api-keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: apiKeyNameInput.value.trim() })
        });

        const data = await readJsonResponse(response);

        newApiKeyValue.textContent = data.key;
        newApiKeyReveal.hidden = false;
        newApiKeyForm.reset();

        await loadApiKeys();

    } catch (error) {
        apiKeysError.textContent = error.message;

    } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalLabel;
    }
});


copyNewApiKeyButton.addEventListener("click", () => {
    navigator.clipboard.writeText(newApiKeyValue.textContent).catch(() => {});
    copyNewApiKeyButton.textContent = "Copied";
    setTimeout(() => { copyNewApiKeyButton.textContent = "Copy"; }, 1200);
});


async function initializeAccountPage() {
    try {
        await loadAccount();
    } catch (error) {
        console.error(error);
        profileError.textContent = error.message || "Could not load your account.";
    }

    try {
        await loadApiKeys();
    } catch (error) {
        console.error(error);
        apiKeysError.textContent = error.message || "Could not load your API keys.";
    }
}


initializeAccountPage();
