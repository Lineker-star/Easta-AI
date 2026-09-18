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

const memoryError = document.getElementById("memory-error");
const memoryList = document.getElementById("memory-list");
const clearMemoryButton = document.getElementById("clear-memory-button");

const organizationsError = document.getElementById("organizations-error");
const organizationsList = document.getElementById("organizations-list");
const newOrganizationForm = document.getElementById("new-organization-form");
const organizationNameInput = document.getElementById("organization-name");

let currentUserId = null;


function capitalize(text) {
    if (!text) {
        return text;
    }
    return text.charAt(0).toUpperCase() + text.slice(1);
}


async function loadAccount() {
    const response = await apiRequest("/api/account");
    const data = await readJsonResponse(response);

    currentUserId = data.id;
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


function renderMemory(items) {
    memoryList.innerHTML = "";
    clearMemoryButton.hidden = items.length === 0;

    if (items.length === 0) {
        const empty = document.createElement("p");
        empty.className = "usage-empty";
        empty.textContent = "Nothing remembered yet.";
        memoryList.appendChild(empty);
        return;
    }

    const table = document.createElement("table");
    table.className = "usage-table";

    const thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Remembered</th><th>Since</th><th></th></tr>";
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    items.forEach((item) => {
        const row = document.createElement("tr");

        const contentCell = document.createElement("td");
        contentCell.textContent = item.content;

        const createdCell = document.createElement("td");
        createdCell.textContent = formatDateTime(item.created_at);

        const actionCell = document.createElement("td");
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "message-action-button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", () => deleteMemoryItem(item.id));
        actionCell.appendChild(deleteButton);

        row.appendChild(contentCell);
        row.appendChild(createdCell);
        row.appendChild(actionCell);
        tbody.appendChild(row);
    });

    table.appendChild(tbody);

    const scrollWrap = document.createElement("div");
    scrollWrap.className = "table-scroll";
    scrollWrap.appendChild(table);
    memoryList.appendChild(scrollWrap);
}


async function loadMemory() {
    const response = await apiRequest("/api/account/memory");
    const data = await readJsonResponse(response);
    renderMemory(data.memory);
}


async function deleteMemoryItem(memoryId) {
    memoryError.textContent = "";

    try {
        const response = await apiRequest(`/api/account/memory/${memoryId}`, {
            method: "DELETE"
        });
        await readJsonResponse(response);
        await loadMemory();
    } catch (error) {
        memoryError.textContent = error.message;
    }
}


clearMemoryButton.addEventListener("click", async () => {
    if (!window.confirm("Clear everything EASTA has remembered about you? This can't be undone.")) {
        return;
    }

    memoryError.textContent = "";

    try {
        const response = await apiRequest("/api/account/memory", {
            method: "DELETE"
        });
        await readJsonResponse(response);
        await loadMemory();
    } catch (error) {
        memoryError.textContent = error.message;
    }
});


function buildInviteLinkRow(org, isOwner) {
    const row = document.createElement("div");
    row.className = "api-key-reveal-row org-invite-row";

    const code = document.createElement("code");
    code.textContent = org.invite_url;
    row.appendChild(code);

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "btn btn-secondary";
    copyButton.textContent = "Copy link";
    copyButton.addEventListener("click", () => {
        navigator.clipboard.writeText(org.invite_url).catch(() => {});
        copyButton.textContent = "Copied";
        setTimeout(() => { copyButton.textContent = "Copy link"; }, 1200);
    });
    row.appendChild(copyButton);

    if (isOwner) {
        const regenButton = document.createElement("button");
        regenButton.type = "button";
        regenButton.className = "btn btn-secondary";
        regenButton.textContent = "Regenerate";
        regenButton.addEventListener(
            "click",
            () => regenerateInvite(org.id, regenButton)
        );
        row.appendChild(regenButton);
    }

    return row;
}


async function regenerateInvite(orgId, button) {
    if (!window.confirm(
        "Regenerate this invite link? The old link will stop working immediately."
    )) {
        return;
    }

    organizationsError.textContent = "";
    button.disabled = true;

    try {
        const response = await apiRequest(
            `/api/organizations/${orgId}/invite/regenerate`,
            { method: "POST" }
        );
        await readJsonResponse(response);
        await loadOrganizations();
    } catch (error) {
        organizationsError.textContent = error.message;
        button.disabled = false;
    }
}


function buildMembersTable(orgId, members, isOwner) {
    const table = document.createElement("table");
    table.className = "usage-table";

    const thead = document.createElement("thead");
    thead.innerHTML =
        "<tr><th>Member</th><th>Role</th><th>Joined</th><th></th></tr>";
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    members.forEach((member) => {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        nameCell.textContent = `${member.username} (${member.email})`;

        const roleCell = document.createElement("td");
        roleCell.textContent = capitalize(member.role);

        const joinedCell = document.createElement("td");
        joinedCell.textContent = formatDateTime(member.joined_at);

        const actionCell = document.createElement("td");
        if (isOwner && member.user_id !== currentUserId) {
            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className = "message-action-button";
            removeButton.textContent = "Remove";
            removeButton.addEventListener(
                "click",
                () => removeMember(orgId, member.user_id)
            );
            actionCell.appendChild(removeButton);
        }

        row.appendChild(nameCell);
        row.appendChild(roleCell);
        row.appendChild(joinedCell);
        row.appendChild(actionCell);
        tbody.appendChild(row);
    });

    table.appendChild(tbody);

    const scrollWrap = document.createElement("div");
    scrollWrap.className = "table-scroll";
    scrollWrap.appendChild(table);
    return scrollWrap;
}


async function removeMember(orgId, memberUserId) {
    if (!window.confirm("Remove this member from the organization?")) {
        return;
    }

    organizationsError.textContent = "";

    try {
        const response = await apiRequest(
            `/api/organizations/${orgId}/members/${memberUserId}`,
            { method: "DELETE" }
        );
        await readJsonResponse(response);
        await loadOrganizations();
    } catch (error) {
        organizationsError.textContent = error.message;
    }
}


async function leaveOrganization(orgId) {
    if (!window.confirm(
        "Leave this organization? You'll lose access to its shared " +
        "knowledge base and billing."
    )) {
        return;
    }

    organizationsError.textContent = "";

    try {
        const response = await apiRequest(
            `/api/organizations/${orgId}/leave`,
            { method: "POST" }
        );
        await readJsonResponse(response);
        await loadOrganizations();
    } catch (error) {
        organizationsError.textContent = error.message;
    }
}


async function buildOrganizationCard(org) {
    const card = document.createElement("div");
    card.className = "org-card";

    const header = document.createElement("div");
    header.className = "org-card-header";

    const title = document.createElement("h3");
    title.textContent = org.name;
    header.appendChild(title);

    const roleBadge = document.createElement("span");
    roleBadge.className = "plan-badge org-role-badge";
    roleBadge.textContent = capitalize(org.role);
    header.appendChild(roleBadge);

    card.appendChild(header);

    const isOwner = org.role === "owner";

    const links = document.createElement("div");
    links.className = "org-card-links";

    const docsLink = document.createElement("a");
    docsLink.href = `/documents?org=${org.id}`;
    docsLink.className = "btn btn-secondary";
    docsLink.textContent = "📚 Knowledge base";
    links.appendChild(docsLink);

    if (isOwner) {
        const usageLink = document.createElement("a");
        usageLink.href = `/usage?org=${org.id}`;
        usageLink.className = "btn btn-secondary";
        usageLink.textContent = "📊 Cost dashboard";
        links.appendChild(usageLink);
    }

    const leaveButton = document.createElement("button");
    leaveButton.type = "button";
    leaveButton.className = "btn btn-secondary";
    leaveButton.textContent = "Leave";
    leaveButton.addEventListener("click", () => leaveOrganization(org.id));
    links.appendChild(leaveButton);

    card.appendChild(links);

    try {
        const [detailResponse, membersResponse] = await Promise.all([
            apiRequest(`/api/organizations/${org.id}`),
            apiRequest(`/api/organizations/${org.id}/members`)
        ]);

        const detail = await readJsonResponse(detailResponse);
        const membersData = await readJsonResponse(membersResponse);

        card.appendChild(buildInviteLinkRow(detail.organization, isOwner));
        card.appendChild(
            buildMembersTable(org.id, membersData.members, isOwner)
        );
    } catch (error) {
        const errorNote = document.createElement("p");
        errorNote.className = "error-message";
        errorNote.textContent = error.message;
        card.appendChild(errorNote);
    }

    return card;
}


async function renderOrganizations(orgs) {
    organizationsList.innerHTML = "";

    if (orgs.length === 0) {
        const empty = document.createElement("p");
        empty.className = "usage-empty";
        empty.textContent = "You're not part of any organization yet.";
        organizationsList.appendChild(empty);
        return;
    }

    for (const org of orgs) {
        organizationsList.appendChild(await buildOrganizationCard(org));
    }
}


async function loadOrganizations() {
    const response = await apiRequest("/api/organizations");
    const data = await readJsonResponse(response);
    await renderOrganizations(data.organizations);
}


newOrganizationForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    organizationsError.textContent = "";

    const submitButton = newOrganizationForm.querySelector('button[type="submit"]');
    const originalLabel = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Creating…";

    try {
        const response = await apiRequest("/api/organizations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: organizationNameInput.value.trim() })
        });

        await readJsonResponse(response);
        newOrganizationForm.reset();
        await loadOrganizations();

    } catch (error) {
        organizationsError.textContent = error.message;

    } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalLabel;
    }
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

    try {
        await loadMemory();
    } catch (error) {
        console.error(error);
        memoryError.textContent = error.message || "Could not load remembered items.";
    }

    try {
        await loadOrganizations();
    } catch (error) {
        console.error(error);
        organizationsError.textContent =
            error.message || "Could not load organizations.";
    }
}


initializeAccountPage();
