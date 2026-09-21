/* Public read-only shared-conversation view (frontend/templates/
 * shared.html). No session cookie / credentials: include here -- this
 * page is reachable by anyone with the link, logged in or not, so it
 * only ever talks to the one unauthenticated endpoint,
 * GET /api/shared/{token}. */

function renderMarkdownInto(bubble, rawText) {
    if (!window.marked || !window.DOMPurify) {
        bubble.textContent = rawText;
        return;
    }

    const html = window.marked.parse(rawText || "");
    bubble.innerHTML = window.DOMPurify.sanitize(html);

    bubble.querySelectorAll("pre code").forEach((codeBlock) => {
        if (window.hljs) {
            window.hljs.highlightElement(codeBlock);
        }
    });
}


function renderAttachments(container, attachments) {
    const images = (attachments || []).filter(
        (attachment) => attachment.type === "image" && attachment.data_url
    );

    if (images.length === 0) {
        return;
    }

    const row = document.createElement("div");
    row.className = "message-image-row";

    for (const image of images) {
        const img = document.createElement("img");
        img.className = "message-image";
        img.src = image.data_url;
        img.alt = image.name || "";
        row.appendChild(img);
    }

    container.appendChild(row);
}


function buildMessageRow(message) {
    const isUser = message.role === "user";

    const row = document.createElement("div");
    row.className = `message-row ${isUser ? "user-row" : "assistant-row"}`;

    const group = document.createElement("div");
    group.className = "message-group";

    if (isUser) {
        renderAttachments(group, message.attachments);
    }

    if (message.content) {
        const bubble = document.createElement("div");
        bubble.className = `message ${isUser ? "user-message" : "assistant-message"}`;

        if (isUser) {
            bubble.textContent = message.content;
        } else {
            renderMarkdownInto(bubble, message.content);
        }

        group.appendChild(bubble);
    }

    row.appendChild(group);

    return row;
}


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


async function loadSharedConversation() {
    const titleEl = document.getElementById("shared-title");
    const container = document.getElementById("shared-messages");

    try {
        const response = await fetchWithTimeout(
            `${window.BACKEND_URL}/api/shared/${window.SHARE_TOKEN}`
        );

        let data;
        try {
            data = await response.json();
        } catch {
            data = {};
        }

        if (!response.ok) {
            throw new Error(
                data.detail || "This link is invalid or no longer shared."
            );
        }

        titleEl.textContent = data.title;
        document.title = `${data.title} — EASTA (shared)`;

        container.innerHTML = "";

        if (data.messages.length === 0) {
            const empty = document.createElement("p");
            empty.className = "shared-loading";
            empty.textContent = "This conversation has no messages.";
            container.appendChild(empty);
            return;
        }

        for (const message of data.messages) {
            container.appendChild(buildMessageRow(message));
        }

    } catch (error) {
        titleEl.textContent = "Not available";
        container.innerHTML = "";

        const errorEl = document.createElement("p");
        errorEl.className = "shared-error";
        errorEl.textContent = error.message;
        container.appendChild(errorEl);
    }
}


loadSharedConversation();
