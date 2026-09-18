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


const scopeSelect = document.getElementById("document-scope-select");
const documentsError = document.getElementById("documents-error");
const documentsList = document.getElementById("documents-list");
const newDocumentForm = document.getElementById("new-document-form");
const documentTitleInput = document.getElementById("document-title");
const documentContentInput = document.getElementById("document-content");


// Personal docs live at /api/documents; an org's shared ones at
// /api/organizations/{id}/documents -- same shape, different base path,
// so every call below just resolves the right prefix once per action
// rather than branching everywhere.
function basePathForScope() {
    const scope = scopeSelect.value;
    return scope === "personal"
        ? "/api/documents"
        : `/api/organizations/${scope}/documents`;
}


function formatBytes(length) {
    if (length < 1000) {
        return `${length} chars`;
    }
    return `${(length / 1000).toFixed(1)}k chars`;
}


function formatDateTime(value) {
    return new Date(value).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}


function renderDocuments(documents) {
    documentsList.innerHTML = "";

    if (documents.length === 0) {
        const empty = document.createElement("p");
        empty.className = "usage-empty";
        empty.textContent = "No documents in this knowledge base yet.";
        documentsList.appendChild(empty);
        return;
    }

    documents.forEach((doc) => {
        const card = document.createElement("div");
        card.className = "document-card";

        const info = document.createElement("div");

        const title = document.createElement("div");
        title.className = "document-card-title";
        title.textContent = doc.title;
        info.appendChild(title);

        const meta = document.createElement("div");
        meta.className = "document-card-meta";
        meta.textContent =
            `${formatBytes(doc.length)} · Added ${formatDateTime(doc.created_at)}`;
        info.appendChild(meta);

        card.appendChild(info);

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "message-action-button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", () => deleteDocument(doc.id));
        card.appendChild(deleteButton);

        documentsList.appendChild(card);
    });
}


async function loadDocuments() {
    documentsError.textContent = "";

    try {
        const response = await apiRequest(basePathForScope());
        const data = await readJsonResponse(response);
        renderDocuments(data.documents);
    } catch (error) {
        documentsError.textContent = error.message;
    }
}


async function deleteDocument(documentId) {
    if (!window.confirm("Delete this document? This can't be undone.")) {
        return;
    }

    documentsError.textContent = "";

    try {
        const response = await apiRequest(`${basePathForScope()}/${documentId}`, {
            method: "DELETE"
        });
        await readJsonResponse(response);
        await loadDocuments();
    } catch (error) {
        documentsError.textContent = error.message;
    }
}


newDocumentForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    documentsError.textContent = "";

    const submitButton = newDocumentForm.querySelector('button[type="submit"]');
    const originalLabel = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Adding…";

    try {
        const response = await apiRequest(basePathForScope(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: documentTitleInput.value.trim(),
                content: documentContentInput.value.trim()
            })
        });

        await readJsonResponse(response);
        newDocumentForm.reset();
        await loadDocuments();

    } catch (error) {
        documentsError.textContent = error.message;

    } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalLabel;
    }
});


scopeSelect.addEventListener("change", loadDocuments);


async function initializeDocumentsPage() {
    try {
        const response = await apiRequest("/api/organizations");
        const data = await readJsonResponse(response);

        data.organizations.forEach((org) => {
            const option = document.createElement("option");
            option.value = org.id;
            option.textContent = org.name;
            scopeSelect.appendChild(option);
        });

        if (
            window.INITIAL_ORG_ID &&
            data.organizations.some((org) => String(org.id) === String(window.INITIAL_ORG_ID))
        ) {
            scopeSelect.value = String(window.INITIAL_ORG_ID);
        }
    } catch (error) {
        console.error(error);
    }

    await loadDocuments();
}


initializeDocumentsPage();
