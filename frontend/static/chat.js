const META_DELIM = "\u241F";

const newChatForm = document.getElementById("new-chat-form");
const conversationList = document.getElementById("conversation-list");
const messageForm = document.getElementById("message-form");
const input = document.getElementById("message");
const sendButton = document.getElementById("send-button");
const messagesContainer = document.getElementById("chat-messages");
const currentUser = document.getElementById("current-user");
const logoutButton = document.getElementById("logout-button");
const sidebar = document.getElementById("sidebar");
const openButton = document.getElementById("sidebar-toggle");
const closeButton = document.getElementById("sidebar-close");
const composerMoreButton = document.getElementById("composer-more-button");
const composerExtraControls = document.getElementById("composer-extra-controls");
const attachButton = document.getElementById("attach-button");
const fileInput = document.getElementById("file-input");
const attachmentRow = document.getElementById("attachment-row");
const languageSelect = document.getElementById("language-select");
const researchToggle = document.getElementById("research-toggle");
const imageStyleSelect = document.getElementById("image-style-select");
const canvasToggleButton = document.getElementById("canvas-toggle-button");
const canvasPanel = document.getElementById("canvas-panel");
const canvasKindBadge = document.getElementById("canvas-kind-badge");
const canvasTitle = document.getElementById("canvas-title");
const canvasCopyButton = document.getElementById("canvas-copy-button");
const canvasDownloadLink = document.getElementById("canvas-download-link");
const canvasCloseButton = document.getElementById("canvas-close-button");
const canvasBody = document.getElementById("canvas-body");
const micButton = document.getElementById("mic-button");
const themeToggleButton = document.getElementById("theme-toggle-button");
const themeToggleIcon = document.getElementById("theme-toggle-icon");
const themeToggleLabel = document.getElementById("theme-toggle-label");

let activeConversationId = window.INITIAL_CONVERSATION_ID;
let currentCanvas = null;
let pendingAttachments = [];

/* Feature flags from the backend (see GET /api/features) — used to hide
 * controls that would otherwise error with nothing configured, per the
 * "degrade gracefully" rule: a feature flag off, or no server fallback
 * available, means the control simply doesn't appear. */
let serverFeatures = {
    research_mode: true,
    generation: true,
    server_stt: false,
    server_tts: false
};

/* Reply-language code -> BCP-47 locale, for SpeechRecognition.lang and
 * for matching a speechSynthesis voice to the current reply language. */
const LANGUAGE_LOCALE_MAP = {
    en: "en-US",
    fr: "fr-FR",
    es: "es-ES",
    de: "de-DE",
    zh: "zh-CN",
    ru: "ru-RU",
    pt: "pt-PT",
    ja: "ja-JP",
    ko: "ko-KR",
    it: "it-IT",
    nl: "nl-NL"
};

/* Reply-language override sent with each message (see LANGUAGE_OPTIONS
 * in backend/app.py). Also drives the interface chrome's language for
 * the languages i18n.js ships translations for (English/French/Spanish
 * today) — other choices keep English chrome but still change the
 * reply language, since that instruction is enforced server-side. */
let languagePreference = "auto";

try {
    languagePreference = window.localStorage.getItem("easta_language") || "auto";
} catch {
    // localStorage can be unavailable (private mode, blocked storage) —
    // fall back to "auto" for this session.
}

/* Research mode toggle (composer): runs multiple search queries, reads
 * the actual top pages, and cites sources under the reply — see
 * run_research() in backend/app.py. */
let researchMode = false;

try {
    researchMode = window.localStorage.getItem("easta_research_mode") === "true";
} catch {
    // localStorage unavailable — default to off for this session.
}

researchToggle.setAttribute("aria-pressed", String(researchMode));

researchToggle.addEventListener("click", () => {
    researchMode = !researchMode;
    researchToggle.setAttribute("aria-pressed", String(researchMode));

    try {
        window.localStorage.setItem("easta_research_mode", String(researchMode));
    } catch {
        // Not persisted this session, but the in-memory toggle still works.
    }
});


/* Image style control (composer): a composer-level alternative to the
 * model's own generate_image aspect_ratio argument — see
 * build_image_style_message() in backend/app.py. Hidden entirely when
 * generation is disabled server-side (see loadFeatures() in
 * bootstrap()). */
let imageAspectRatio = "auto";

try {
    imageAspectRatio = window.localStorage.getItem("easta_image_aspect_ratio") || "auto";
} catch {
    // localStorage unavailable — default to "auto" for this session.
}

imageStyleSelect.value = imageAspectRatio;

imageStyleSelect.addEventListener("change", () => {
    imageAspectRatio = imageStyleSelect.value;

    try {
        window.localStorage.setItem("easta_image_aspect_ratio", imageAspectRatio);
    } catch {
        // Not persisted this session, but the in-memory value still applies.
    }
});


/* Composer "more options" popover (narrow screens only -- see the
 * @media (max-width: 560px) rule in styles.css). Attach/research/
 * image-style/mic keep their existing ids and listeners wherever this
 * moves them in the layout, so no other behavior changes. */

function closeComposerExtraControls() {
    composerExtraControls.classList.remove("open");
    composerMoreButton.setAttribute("aria-expanded", "false");
}


composerMoreButton.addEventListener("click", () => {
    const isOpen = composerExtraControls.classList.toggle("open");
    composerMoreButton.setAttribute("aria-expanded", String(isOpen));
});


composerExtraControls.addEventListener("click", (event) => {
    if (event.target.closest("button")) {
        closeComposerExtraControls();
    }
});


composerExtraControls.addEventListener("change", () => {
    closeComposerExtraControls();
});


document.addEventListener("click", (event) => {
    if (
        composerExtraControls.classList.contains("open") &&
        !composerExtraControls.contains(event.target) &&
        event.target !== composerMoreButton
    ) {
        closeComposerExtraControls();
    }
});


document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && composerExtraControls.classList.contains("open")) {
        closeComposerExtraControls();
    }
});


/* --- dark / light theme ----------------------------------------------
 * The actual theme choice (localStorage "easta_theme" vs. OS
 * prefers-color-scheme) is already resolved and stamped as
 * data-theme on <html> before first paint by the inline snippet in
 * frontend/templates/_theme_init.html — this just wires up the
 * sidebar toggle to flip it and keeps the toggle's own icon/label in
 * sync with both the current theme and the current UI language. */

function getCurrentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark"
        ? "dark"
        : "light";
}


function applyThemeToggleUI() {
    const theme = getCurrentTheme();
    themeToggleIcon.textContent = theme === "dark" ? "☀️" : "🌙";
    themeToggleLabel.textContent = theme === "dark"
        ? t("theme_toggle_light")
        : t("theme_toggle_dark");
}


function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);

    try {
        window.localStorage.setItem("easta_theme", theme);
    } catch {
        // Not persisted this session, but the in-memory toggle still works.
    }

    applyThemeToggleUI();
}


themeToggleButton.addEventListener("click", () => {
    setTheme(getCurrentTheme() === "dark" ? "light" : "dark");
});


if (window.marked) {
    window.marked.setOptions({ breaks: true, gfm: true });
}

input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        messageForm.requestSubmit();
    }
});

input.addEventListener("input", resizeMessageInput);


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


function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}


function clearMessages() {
    messagesContainer.innerHTML = "";
}


function showEmptyState() {
    clearMessages();

    const emptyState = document.createElement("div");
    emptyState.className = "empty-chat";

    const heading = document.createElement("h2");
    heading.textContent = t("empty_title");

    const description = document.createElement("p");
    description.textContent = t("empty_description");

    emptyState.appendChild(heading);
    emptyState.appendChild(description);

    messagesContainer.appendChild(emptyState);
}


function removeEmptyState() {
    const emptyChat = messagesContainer.querySelector(".empty-chat");

    if (emptyChat) {
        emptyChat.remove();
    }
}


/* --- markdown rendering ------------------------------------------------ */

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
        attachCopyButton(codeBlock);
    });
}


function attachCopyButton(codeBlock) {
    const pre = codeBlock.parentElement;

    if (!pre || pre.querySelector(".code-block-header")) {
        return;
    }

    const languageMatch = codeBlock.className.match(/language-(\w+)/);
    const language = languageMatch ? languageMatch[1] : "text";

    const header = document.createElement("div");
    header.className = "code-block-header";

    const label = document.createElement("span");
    label.textContent = language;

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "copy-code-button";
    copyButton.textContent = "Copy";

    copyButton.addEventListener("click", () => {
        navigator.clipboard
            .writeText(codeBlock.textContent)
            .then(() => {
                copyButton.textContent = "Copied!";
                setTimeout(() => {
                    copyButton.textContent = "Copy";
                }, 1500);
            })
            .catch(() => {});
    });

    header.appendChild(label);
    header.appendChild(copyButton);
    pre.prepend(header);
}


function toolLabel(meta) {
    if (meta.tool === "web_search") {
        const query = (meta.args && meta.args.query) || "";
        return `🔍 Searched the web for "${query}"`;
    }

    if (meta.tool === "execute_python") {
        return "⚙️ Ran a Python snippet";
    }

    return `🛠️ Used ${meta.tool}`;
}


function researchLabel(meta) {
    if (meta.type === "research_queries") {
        return `🔎 Researching: ${meta.queries.join(" · ")}`;
    }

    if (meta.type === "research_reading") {
        const count = meta.count || 0;
        return `📄 Reading ${count} source${count === 1 ? "" : "s"}…`;
    }

    return null;
}


function renderSourceList(contentArea, sources) {
    if (!sources || sources.length === 0) {
        return;
    }

    const wrap = document.createElement("div");
    wrap.className = "source-list";

    const heading = document.createElement("div");
    heading.className = "source-list-heading";
    heading.textContent = "Sources";
    wrap.appendChild(heading);

    sources.forEach((source) => {
        const link = document.createElement("a");
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "source-list-item";
        link.textContent = `${source.index}. ${source.title}`;
        wrap.appendChild(link);
    });

    contentArea.appendChild(wrap);
}


/* --- canvas / design panel ------------------------------------------------ */

const CANVAS_KIND_LABELS = {
    document: "Document",
    code: "Code",
    image: "Image"
};


function showCanvasPanel() {
    canvasPanel.hidden = false;
    canvasToggleButton.setAttribute("aria-pressed", "true");
}


function hideCanvasPanel() {
    canvasPanel.hidden = true;
    canvasToggleButton.setAttribute("aria-pressed", "false");
}


function updateCanvasToggleVisibility() {
    canvasToggleButton.hidden = !currentCanvas;
}


function absoluteBackendUrl(path) {
    if (!path) {
        return path;
    }
    return `${window.BACKEND_URL}${path}`;
}


/* --- file cards (create_document tool output) ------------------------- */

const FILE_FORMAT_ICONS = {
    pdf: "📄",
    docx: "📝",
    pptx: "📽️"
};


function formatFileSize(bytes) {
    if (!bytes || bytes < 1024) {
        return `${bytes || 0} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


function renderFileCard(contentArea, fileEvent) {
    const card = document.createElement("a");
    card.className = "file-card";
    card.href = absoluteBackendUrl(fileEvent.download_url);
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    const icon = document.createElement("div");
    icon.className = "file-card-icon";
    icon.textContent = FILE_FORMAT_ICONS[fileEvent.format] || "📄";

    const info = document.createElement("div");
    info.className = "file-card-info";

    const name = document.createElement("div");
    name.className = "file-card-name";
    name.textContent = fileEvent.title;

    const meta = document.createElement("div");
    meta.className = "file-card-meta";
    meta.textContent =
        `${(fileEvent.format || "").toUpperCase()} · ${formatFileSize(fileEvent.size_bytes)}`;

    info.appendChild(name);
    info.appendChild(meta);

    const downloadIcon = document.createElement("div");
    downloadIcon.className = "file-card-download";
    downloadIcon.textContent = "⬇";
    downloadIcon.setAttribute("aria-hidden", "true");

    card.appendChild(icon);
    card.appendChild(info);
    card.appendChild(downloadIcon);

    contentArea.appendChild(card);
}


/* --- inline image results (generate_image tool output) -------------------- */

function renderImageResult(contentArea, imageEvent) {
    const wrap = document.createElement("div");
    wrap.className = "image-result";

    const image = document.createElement("img");
    image.className = "image-result-img";
    image.src = absoluteBackendUrl(imageEvent.download_url);
    image.alt = imageEvent.prompt || "Generated image";

    const actions = document.createElement("div");
    actions.className = "image-result-actions";

    const downloadLink = document.createElement("a");
    downloadLink.className = "message-action-button";
    downloadLink.href = absoluteBackendUrl(imageEvent.download_url);
    downloadLink.target = "_blank";
    downloadLink.rel = "noopener noreferrer";
    downloadLink.textContent = "⬇ Download";

    const regenerateButton = document.createElement("button");
    regenerateButton.type = "button";
    regenerateButton.className = "message-action-button";
    regenerateButton.textContent = "🔄 Regenerate";
    regenerateButton.addEventListener("click", () => {
        regenerateImage(wrap, image, downloadLink, regenerateButton, imageEvent);
    });

    actions.appendChild(downloadLink);
    actions.appendChild(regenerateButton);

    wrap.appendChild(image);
    wrap.appendChild(actions);
    contentArea.appendChild(wrap);
}


async function regenerateImage(wrap, image, downloadLink, button, imageEvent) {
    button.disabled = true;

    const originalText = button.textContent;
    button.textContent = "🔄 Regenerating…";
    wrap.classList.add("image-result-loading");

    try {
        const response = await apiRequest("/api/regenerate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt: imageEvent.prompt,
                aspect_ratio: imageEvent.aspect_ratio,
                conversation_id: activeConversationId
            })
        });

        const data = await readJsonResponse(response);

        imageEvent.id = data.id;
        imageEvent.download_url = data.download_url;

        const newUrl = absoluteBackendUrl(data.download_url);
        image.src = newUrl;
        downloadLink.href = newUrl;

    } catch (error) {
        console.error(error);
        window.alert(error.message || "Could not regenerate the image.");

    } finally {
        button.disabled = false;
        button.textContent = originalText;
        wrap.classList.remove("image-result-loading");
    }
}


function renderCanvas(artifact) {
    currentCanvas = artifact;
    updateCanvasToggleVisibility();

    if (!artifact) {
        canvasBody.innerHTML = "";
        const empty = document.createElement("p");
        empty.className = "canvas-empty";
        empty.textContent = "Nothing on the canvas yet.";
        canvasBody.appendChild(empty);
        canvasCopyButton.hidden = true;
        canvasDownloadLink.hidden = true;
        return;
    }

    canvasKindBadge.textContent = CANVAS_KIND_LABELS[artifact.kind] || artifact.kind;
    canvasTitle.textContent = artifact.title || "Canvas";
    canvasBody.innerHTML = "";

    if (artifact.kind === "code") {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.className = `language-${artifact.language || "text"}`;
        code.textContent = artifact.content || "";
        pre.appendChild(code);
        canvasBody.appendChild(pre);

        if (window.hljs) {
            window.hljs.highlightElement(code);
        }

        canvasCopyButton.hidden = false;
        canvasDownloadLink.hidden = true;

    } else if (artifact.kind === "document") {
        const bubble = document.createElement("div");
        bubble.className = "assistant-message";
        renderMarkdownInto(bubble, artifact.content || "");
        canvasBody.appendChild(bubble);

        canvasCopyButton.hidden = false;
        canvasDownloadLink.hidden = !artifact.download_url;
        if (artifact.download_url) {
            canvasDownloadLink.href = absoluteBackendUrl(artifact.download_url);
        }

    } else if (artifact.kind === "image") {
        if (artifact.download_url) {
            const image = document.createElement("img");
            image.src = absoluteBackendUrl(artifact.download_url);
            image.alt = artifact.title || "Generated image";
            canvasBody.appendChild(image);
        }

        canvasCopyButton.hidden = true;
        canvasDownloadLink.hidden = !artifact.download_url;
        if (artifact.download_url) {
            canvasDownloadLink.href = absoluteBackendUrl(artifact.download_url);
        }
    }
}


async function loadCanvas(conversationId) {
    try {
        const response = await apiRequest(
            `/api/conversations/${conversationId}/canvas`
        );
        const data = await readJsonResponse(response);
        renderCanvas(data.canvas);
    } catch (error) {
        console.error(error);
        renderCanvas(null);
    }
}


canvasToggleButton.addEventListener("click", () => {
    if (canvasPanel.hidden) {
        showCanvasPanel();
    } else {
        hideCanvasPanel();
    }
});


canvasCloseButton.addEventListener("click", () => {
    hideCanvasPanel();
});


canvasCopyButton.addEventListener("click", () => {
    if (!currentCanvas) {
        return;
    }

    navigator.clipboard.writeText(currentCanvas.content || "").catch(() => {});
    canvasCopyButton.textContent = "Copied";
    setTimeout(() => { canvasCopyButton.textContent = "Copy"; }, 1200);
});


/* --- message rendering (static, from history) --------------------------- */

function createUserMessage(content, messageId, imageDataUrls = []) {
    const row = document.createElement("div");
    row.className = "message-row user-row";

    if (messageId) {
        row.dataset.messageId = messageId;
    }

    const group = document.createElement("div");
    group.className = "message-group";

    if (imageDataUrls.length > 0) {
        const imageRow = document.createElement("div");
        imageRow.className = "message-image-row";

        imageDataUrls.forEach((url) => {
            const image = document.createElement("img");
            image.className = "message-image";
            image.src = url;
            image.alt = "Attached image";
            imageRow.appendChild(image);
        });

        group.appendChild(imageRow);
    }

    const bubble = document.createElement("div");
    bubble.className = "message user-message";
    bubble.textContent = content;

    group.appendChild(bubble);

    if (messageId) {
        const actions = document.createElement("div");
        actions.className = "message-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "message-action-button";
        editButton.textContent = "✎ Edit";
        editButton.addEventListener("click", () => {
            startEditingMessage(row, group, bubble, messageId, content);
        });

        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.className = "message-action-button";
        copyButton.textContent = "Copy";
        copyButton.addEventListener("click", () => {
            navigator.clipboard.writeText(content).catch(() => {});
            copyButton.textContent = "Copied";
            setTimeout(() => { copyButton.textContent = "Copy"; }, 1200);
        });

        actions.appendChild(editButton);
        actions.appendChild(copyButton);
        group.appendChild(actions);
    }

    row.appendChild(group);
    messagesContainer.appendChild(row);

    return { row, group, bubble };
}


function createAssistantMessage(content = "", options = {}) {
    const row = document.createElement("div");
    row.className = "message-row assistant-row";

    const group = document.createElement("div");
    group.className = "message-group";

    const contentArea = document.createElement("div");
    contentArea.className = "assistant-content";

    const bubble = document.createElement("div");
    bubble.className = "message assistant-message";

    if (content) {
        renderMarkdownInto(bubble, content);
    }

    contentArea.appendChild(bubble);
    group.appendChild(contentArea);

    const actions = document.createElement("div");
    actions.className = "message-actions";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "message-action-button";
    copyButton.textContent = "Copy";
    copyButton.addEventListener("click", () => {
        navigator.clipboard.writeText(bubble.textContent).catch(() => {});
        copyButton.textContent = "Copied";
        setTimeout(() => { copyButton.textContent = "Copy"; }, 1200);
    });
    actions.appendChild(copyButton);

    if (voiceOutputAvailable()) {
        const speakButton = document.createElement("button");
        speakButton.type = "button";
        speakButton.className = "message-action-button";
        speakButton.textContent = "🔊 Read aloud";
        speakButton.addEventListener("click", () => {
            toggleReadAloud(speakButton, bubble.textContent);
        });
        actions.appendChild(speakButton);
    }

    if (options.allowRegenerate) {
        const regenerateButton = document.createElement("button");
        regenerateButton.type = "button";
        regenerateButton.className = "message-action-button";
        regenerateButton.textContent = "⟳ Regenerate";
        regenerateButton.addEventListener("click", regenerateLastReply);
        actions.appendChild(regenerateButton);
    }

    group.appendChild(actions);

    row.appendChild(group);
    messagesContainer.appendChild(row);

    return { row, group, bubble, contentArea };
}


function createStreamingAssistantMessage() {
    const row = document.createElement("div");
    row.className = "message-row assistant-row";

    const group = document.createElement("div");
    group.className = "message-group";

    const contentArea = document.createElement("div");
    contentArea.className = "assistant-content";

    const status = document.createElement("div");
    status.className = "assistant-status";
    status.textContent = t("thinking");

    const bubble = document.createElement("div");
    bubble.className = "message assistant-message";

    contentArea.appendChild(status);
    contentArea.appendChild(bubble);
    group.appendChild(contentArea);
    row.appendChild(group);

    messagesContainer.appendChild(row);

    return { row, group, bubble, status, contentArea };
}


function showPageError(message) {
    clearMessages();

    const row = document.createElement("div");
    row.className = "message-row assistant-row";

    const error = document.createElement("div");
    error.className = "message error-message";
    error.textContent = message;

    row.appendChild(error);
    messagesContainer.appendChild(row);
}


function renderMessages(messages) {
    if (messages.length === 0) {
        showEmptyState();
        return;
    }

    clearMessages();

    messages.forEach((message, index) => {
        if (message.role === "user") {
            const imageUrls = (message.attachments || [])
                .filter((attachment) => attachment.type === "image")
                .map((attachment) => attachment.data_url);

            createUserMessage(message.content, message.id, imageUrls);
        } else {
            const isLast = index === messages.length - 1;
            createAssistantMessage(message.content, {
                allowRegenerate: isLast
            });
        }
    });

    scrollToBottom();
}


function renderConversations(conversations) {
    conversationList.innerHTML = "";

    for (const conversation of conversations) {
        const link = document.createElement("a");

        link.href = `/chat/${conversation.id}`;
        link.className = "conversation-link";
        link.textContent = conversation.label;

        if (conversation.id === activeConversationId) {
            link.classList.add("active");
        }

        link.addEventListener("click", async (event) => {
            event.preventDefault();
            await openConversation(conversation.id, true);

            if (window.innerWidth <= 700) {
                sidebar.classList.add("sidebar-hidden");
            }
        });

        conversationList.appendChild(link);
    }
}


function resizeMessageInput() {
    const maximumHeight = 160;

    input.style.height = "auto";

    const newHeight = Math.min(input.scrollHeight, maximumHeight);
    input.style.height = `${newHeight}px`;

    input.style.overflowY =
        input.scrollHeight > maximumHeight ? "auto" : "hidden";
}


/* --- attachments --------------------------------------------------------- */
/* pendingAttachments holds one of:
 *   { type: "text", name, content }   -- .txt/.md/... and extracted PDF/DOCX
 *   { type: "image", name, mimeType, dataUrl }
 *   { type: "loading", name }         -- a PDF/DOCX upload in flight
 */

const MAX_IMAGE_BYTES = 8_000_000; // matches MAX_IMAGE_DATA_URL_CHARS server-side
const MAX_DOCUMENT_BYTES = 15_000_000; // matches MAX_UPLOAD_BYTES server-side
const MAX_IMAGES_PER_MESSAGE = 4;

const DOCX_MIME_TYPE =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME_TYPE =
    "application/vnd.openxmlformats-officedocument.presentationml.presentation";


function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}


function attachmentIcon(attachment) {
    const lowerName = (attachment.name || "").toLowerCase();

    if (lowerName.endsWith(".pdf")) {
        return "📄";
    }

    if (lowerName.endsWith(".docx")) {
        return "📝";
    }

    if (lowerName.endsWith(".pptx")) {
        return "📽️";
    }

    return "📎";
}


function renderAttachments() {
    attachmentRow.innerHTML = "";

    pendingAttachments.forEach((attachment, index) => {
        const chip = document.createElement("div");
        chip.className = "attachment-chip";

        if (attachment.type === "loading") {
            chip.classList.add("attachment-chip-loading");

            const label = document.createElement("span");
            label.textContent = `⏳ Extracting "${attachment.name}"…`;
            chip.appendChild(label);

            attachmentRow.appendChild(chip);
            return;
        }

        if (attachment.type === "image") {
            chip.classList.add("attachment-chip-image");

            const thumb = document.createElement("img");
            thumb.src = attachment.dataUrl;
            thumb.alt = attachment.name;
            chip.appendChild(thumb);
        } else {
            const label = document.createElement("span");
            label.textContent = `${attachmentIcon(attachment)} ${attachment.name}`;
            chip.appendChild(label);
        }

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.textContent = "×";
        removeButton.setAttribute("aria-label", "Remove attachment");
        removeButton.addEventListener("click", () => {
            pendingAttachments.splice(index, 1);
            renderAttachments();
        });

        chip.appendChild(removeButton);
        attachmentRow.appendChild(chip);
    });
}


function countPendingImages() {
    return pendingAttachments.filter((a) => a.type === "image").length;
}


async function attachImageFile(file) {
    if (countPendingImages() >= MAX_IMAGES_PER_MESSAGE) {
        window.alert(
            `You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message.`
        );
        return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
        window.alert("Please attach an image smaller than 8 MB.");
        return;
    }

    try {
        const dataUrl = await readFileAsDataURL(file);

        pendingAttachments.push({
            type: "image",
            name: file.name || "image",
            mimeType: file.type,
            dataUrl
        });

        renderAttachments();

    } catch (error) {
        console.error(error);
        window.alert("That image couldn't be read.");
    }
}


async function attachDocumentFile(file) {
    if (file.size > MAX_DOCUMENT_BYTES) {
        window.alert("Please attach a file smaller than 15 MB.");
        return;
    }

    const loadingEntry = { type: "loading", name: file.name };
    pendingAttachments.push(loadingEntry);
    renderAttachments();

    try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await apiRequest("/api/extract-text", {
            method: "POST",
            body: formData
        });

        const data = await readJsonResponse(response);
        const index = pendingAttachments.indexOf(loadingEntry);

        if (index !== -1) {
            pendingAttachments[index] = {
                type: "text",
                name: data.filename || file.name,
                content: data.text
            };
        }

    } catch (error) {
        console.error(error);
        window.alert(error.message || "That file couldn't be read.");

        const index = pendingAttachments.indexOf(loadingEntry);
        if (index !== -1) {
            pendingAttachments.splice(index, 1);
        }

    } finally {
        renderAttachments();
    }
}


function attachTextFile(file) {
    if (file.size > 500_000) {
        window.alert("Please attach a file smaller than 500 KB.");
        return Promise.resolve();
    }

    return file.text()
        .then((text) => {
            pendingAttachments.push({
                type: "text",
                name: file.name,
                content: text.slice(0, 6000)
            });
            renderAttachments();
        })
        .catch((error) => {
            console.error(error);
            window.alert("That file couldn't be read as text.");
        });
}


async function handleAttachedFile(file) {
    const lowerName = (file.name || "").toLowerCase();

    if (file.type.startsWith("image/")) {
        await attachImageFile(file);
    } else if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
        await attachDocumentFile(file);
    } else if (file.type === DOCX_MIME_TYPE || lowerName.endsWith(".docx")) {
        await attachDocumentFile(file);
    } else if (file.type === PPTX_MIME_TYPE || lowerName.endsWith(".pptx")) {
        await attachDocumentFile(file);
    } else {
        await attachTextFile(file);
    }
}


attachButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = "";

    if (!file) {
        return;
    }

    await handleAttachedFile(file);
});


input.addEventListener("paste", async (event) => {
    const items = event.clipboardData && event.clipboardData.items;

    if (!items) {
        return;
    }

    const imageItem = Array.from(items).find(
        (item) => item.kind === "file" && item.type.startsWith("image/")
    );

    if (!imageItem) {
        return;
    }

    event.preventDefault();

    const file = imageItem.getAsFile();

    if (file) {
        await attachImageFile(file);
    }
});


function buildOutgoingMessage(userText, attachments) {
    const textAttachments = attachments.filter((a) => a.type === "text");

    if (textAttachments.length === 0) {
        return userText;
    }

    const parts = [userText || "Please review the attached file(s)."];

    for (const attachment of textAttachments) {
        parts.push(
            `\n\n[Attached file: ${attachment.name}]\n` +
            "```\n" + attachment.content + "\n```"
        );
    }

    return parts.join("");
}


function buildOutgoingImages(attachments) {
    return attachments
        .filter((a) => a.type === "image")
        .map((a) => ({
            name: a.name,
            mime_type: a.mimeType,
            data_url: a.dataUrl
        }));
}


/* --- voice: speech-to-text (composer mic button) --------------------------
 * Prefers the browser's native SpeechRecognition — free, no round trip,
 * works offline in some browsers — and only falls back to the server
 * (POST /api/transcribe, Whisper via OpenRouter) when that's unavailable,
 * e.g. Firefox ships no SpeechRecognition implementation at all. If
 * neither is available the mic button stays hidden (see updateMicButtonVisibility). */

let speechRecognizer = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

function supportsBrowserSTT() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}


function setRecordingState(recording) {
    isRecording = recording;
    micButton.classList.toggle("recording", recording);
}


function updateMicButtonVisibility() {
    micButton.hidden = !(supportsBrowserSTT() || serverFeatures.server_stt);
}


function startBrowserRecognition() {
    const SpeechRecognitionCtor =
        window.SpeechRecognition || window.webkitSpeechRecognition;
    speechRecognizer = new SpeechRecognitionCtor();
    speechRecognizer.continuous = false;
    speechRecognizer.interimResults = true;

    const locale = LANGUAGE_LOCALE_MAP[languagePreference];
    if (locale) {
        speechRecognizer.lang = locale;
    }

    let finalText = "";

    speechRecognizer.onresult = (event) => {
        let interim = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalText += transcript;
            } else {
                interim += transcript;
            }
        }

        input.value = (finalText + interim).trim();
        resizeMessageInput();
    };

    speechRecognizer.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        setRecordingState(false);
    };

    speechRecognizer.onend = () => {
        setRecordingState(false);
    };

    speechRecognizer.start();
    setRecordingState(true);
}


async function transcribeViaServer(blob) {
    micButton.disabled = true;

    try {
        const extension = (blob.type.split("/")[1] || "webm").split(";")[0];
        const formData = new FormData();
        formData.append("file", blob, `recording.${extension}`);

        if (activeConversationId) {
            formData.append("conversation_id", String(activeConversationId));
        }

        const response = await apiRequest("/api/transcribe", {
            method: "POST",
            body: formData
        });
        const data = await readJsonResponse(response);

        input.value = ((input.value ? `${input.value} ` : "") + (data.text || "")).trim();
        resizeMessageInput();

    } catch (error) {
        console.error(error);
        window.alert(error.message || "Transcription failed.");
    } finally {
        micButton.disabled = false;
    }
}


async function startServerRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach((track) => track.stop());
            const blob = new Blob(recordedChunks, {
                type: mediaRecorder.mimeType || "audio/webm"
            });
            await transcribeViaServer(blob);
        };

        mediaRecorder.start();
        setRecordingState(true);

    } catch (error) {
        console.error(error);
        window.alert("Microphone access was denied or unavailable.");
    }
}


function stopServerRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    setRecordingState(false);
}


micButton.addEventListener("click", async () => {
    if (isRecording) {
        if (speechRecognizer) {
            speechRecognizer.stop();
        } else {
            stopServerRecording();
        }
        return;
    }

    if (supportsBrowserSTT()) {
        startBrowserRecognition();
    } else if (serverFeatures.server_stt) {
        await startServerRecording();
    }
});


/* --- voice: text-to-speech (per-message "Read aloud") ---------------------
 * Same fallback order as STT: the browser's speechSynthesis is free and
 * instant, but voice availability/quality varies a lot by OS/browser —
 * server TTS (POST /api/speak, OpenRouter) only kicks in when the browser
 * has no voice that matches the current reply language. */

let activeSpeech = null; // { button, utterance? , audio? }

function voiceOutputAvailable() {
    return !!(window.speechSynthesis || serverFeatures.server_tts);
}


function stopReadAloud() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }

    if (activeSpeech && activeSpeech.audio) {
        activeSpeech.audio.pause();
    }

    if (activeSpeech && activeSpeech.button) {
        activeSpeech.button.textContent = "🔊 Read aloud";
        activeSpeech.button.classList.remove("speaking");
    }

    activeSpeech = null;
}


function pickBrowserVoice(localePrefix) {
    if (!window.speechSynthesis) {
        return null;
    }

    const voices = window.speechSynthesis.getVoices();

    if (!voices.length) {
        return null;
    }

    if (!localePrefix) {
        return voices[0];
    }

    return voices.find(
        (voice) => voice.lang && voice.lang.toLowerCase().startsWith(localePrefix)
    ) || null;
}


function speakWithBrowser(text, locale, voice, button) {
    const utterance = new SpeechSynthesisUtterance(text);

    if (locale) {
        utterance.lang = locale;
    }
    if (voice) {
        utterance.voice = voice;
    }

    utterance.onend = () => {
        if (activeSpeech && activeSpeech.button === button) {
            stopReadAloud();
        }
    };
    utterance.onerror = () => {
        if (activeSpeech && activeSpeech.button === button) {
            stopReadAloud();
        }
    };

    activeSpeech = { button, utterance };
    button.textContent = "⏸ Stop";
    button.classList.add("speaking");
    window.speechSynthesis.speak(utterance);
}


async function speakWithServer(text, button) {
    button.disabled = true;

    try {
        const response = await apiRequest("/api/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, language: languagePreference })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || "Voice synthesis failed.");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        audio.onended = () => {
            URL.revokeObjectURL(url);
            if (activeSpeech && activeSpeech.button === button) {
                stopReadAloud();
            }
        };

        activeSpeech = { button, audio };
        button.textContent = "⏸ Stop";
        button.classList.add("speaking");
        await audio.play();

    } catch (error) {
        console.error(error);
        window.alert(error.message || "Text-to-speech failed.");
    } finally {
        button.disabled = false;
    }
}


async function toggleReadAloud(button, text) {
    if (activeSpeech && activeSpeech.button === button) {
        stopReadAloud();
        return;
    }

    stopReadAloud();

    const plainText = (text || "").trim();

    if (!plainText) {
        return;
    }

    const locale = LANGUAGE_LOCALE_MAP[languagePreference] || null;
    const localePrefix = locale ? locale.split("-")[0] : null;

    if (window.speechSynthesis) {
        const voice = pickBrowserVoice(localePrefix);

        if (voice || !localePrefix) {
            speakWithBrowser(plainText, locale, voice, button);
            return;
        }
    }

    if (serverFeatures.server_tts) {
        await speakWithServer(plainText, button);
        return;
    }

    window.alert(
        "No text-to-speech voice is available for this language in your browser."
    );
}


/* --- streaming ------------------------------------------------------------ */

async function consumeStreamResponse(response, { onMeta, onToken }) {
    if (response.status === 401) {
        window.location.href = "/login";
        throw new Error("Please log in again.");
    }

    if (!response.ok) {
        const errorMessage = await response.text();
        throw new Error(errorMessage || "The request failed.");
    }

    if (!response.body) {
        throw new Error("Streaming is not supported by this browser.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const result = await reader.read();

        if (result.done) {
            break;
        }

        buffer += decoder.decode(result.value, { stream: true });

        while (true) {
            const start = buffer.indexOf(META_DELIM);

            if (start === -1) {
                if (buffer) {
                    onToken(buffer);
                    buffer = "";
                }
                break;
            }

            if (start > 0) {
                onToken(buffer.slice(0, start));
            }

            const end = buffer.indexOf(META_DELIM, start + 1);

            if (end === -1) {
                buffer = buffer.slice(start);
                break;
            }

            const jsonText = buffer.slice(start + 1, end);

            try {
                onMeta(JSON.parse(jsonText));
            } catch (error) {
                console.error("Failed to parse stream meta", error);
            }

            buffer = buffer.slice(end + 1);
        }
    }
}


async function streamAssistantReply(fetchResponsePromise) {
    removeEmptyState();

    const assistantMessage = createStreamingAssistantMessage();
    const { bubble, status, contentArea } = assistantMessage;

    let contentSoFar = "";
    let firstChunk = true;

    input.disabled = true;
    sendButton.disabled = true;
    scrollToBottom();

    try {
        const response = await fetchResponsePromise;

        await consumeStreamResponse(response, {
            onMeta: (meta) => {
                if (meta.type === "tool_use") {
                    const pill = document.createElement("div");
                    pill.className = "tool-use-pill";
                    pill.textContent = toolLabel(meta);
                    contentArea.insertBefore(pill, bubble);
                    scrollToBottom();
                    return;
                }

                if (meta.type === "research_queries" || meta.type === "research_reading") {
                    const pill = document.createElement("div");
                    pill.className = "tool-use-pill";
                    pill.textContent = researchLabel(meta);
                    contentArea.insertBefore(pill, bubble);
                    scrollToBottom();
                    return;
                }

                if (meta.type === "sources") {
                    renderSourceList(contentArea, meta.sources);
                    scrollToBottom();
                    return;
                }

                if (meta.type === "canvas") {
                    renderCanvas(meta);
                    showCanvasPanel();

                    const pill = document.createElement("div");
                    pill.className = "tool-use-pill";
                    pill.textContent =
                        `📋 Updated the canvas: ${meta.title || CANVAS_KIND_LABELS[meta.kind] || "artifact"}`;
                    contentArea.insertBefore(pill, bubble);
                    scrollToBottom();
                    return;
                }

                if (meta.type === "file_card") {
                    renderFileCard(contentArea, meta);
                    scrollToBottom();
                    return;
                }

                if (meta.type === "image_result") {
                    renderImageResult(contentArea, meta);
                    scrollToBottom();
                }
            },
            onToken: (text) => {
                if (firstChunk) {
                    status.remove();
                    firstChunk = false;
                }

                contentSoFar += text;
                renderMarkdownInto(bubble, contentSoFar);
                scrollToBottom();
            }
        });

        if (firstChunk) {
            status.remove();
        }

    } catch (error) {
        console.error(error);

        if (status.isConnected) {
            status.remove();
        }

        bubble.textContent =
            error.message || "EASTA could not generate a response.";
        bubble.classList.add("error-message");

    } finally {
        input.disabled = false;
        sendButton.disabled = false;
        input.focus();
    }

    // Sync with the server's canonical record (real message ids,
    // updated conversation title/summary state, etc).
    try {
        await refreshConversationView();
    } catch (error) {
        console.error(error);
    }
}


/* --- edit / regenerate ---------------------------------------------------- */

function startEditingMessage(row, group, bubble, messageId, originalContent) {
    const actionsEl = group.querySelector(".message-actions");
    bubble.remove();
    if (actionsEl) actionsEl.remove();

    const textarea = document.createElement("textarea");
    textarea.className = "edit-textarea";
    textarea.value = originalContent;
    textarea.rows = Math.min(10, Math.max(2, originalContent.split("\n").length));

    const editActions = document.createElement("div");
    editActions.className = "edit-actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "btn btn-ghost";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", async () => {
        await refreshConversationView();
    });

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "btn btn-primary";
    saveButton.textContent = "Save & submit";
    saveButton.addEventListener("click", async () => {
        const newContent = textarea.value.trim();

        if (!newContent) {
            return;
        }

        editActions.remove();
        textarea.remove();

        const restoredBubble = document.createElement("div");
        restoredBubble.className = "message user-message";
        restoredBubble.textContent = newContent;
        group.insertBefore(restoredBubble, group.firstChild);

        // Everything after this message in the DOM is now stale.
        let nextRow = row.nextElementSibling;
        while (nextRow) {
            const toRemove = nextRow;
            nextRow = nextRow.nextElementSibling;
            toRemove.remove();
        }

        await streamAssistantReply(
            apiRequest(
                `/api/conversations/${activeConversationId}/messages/${messageId}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        message: newContent,
                        language: languagePreference,
                        research: researchMode,
                        image_aspect_ratio: imageAspectRatio
                    })
                }
            )
        );
    });

    editActions.appendChild(cancelButton);
    editActions.appendChild(saveButton);

    group.insertBefore(textarea, group.firstChild);
    group.appendChild(editActions);
    textarea.focus();
}


async function regenerateLastReply() {
    await streamAssistantReply(
        apiRequest(
            `/api/conversations/${activeConversationId}/regenerate`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    language: languagePreference,
                    research: researchMode,
                    image_aspect_ratio: imageAspectRatio
                })
            }
        )
    );
}


/* --- conversation loading -------------------------------------------------- */

async function loadSession() {
    const response = await apiRequest("/api/session");
    const data = await readJsonResponse(response);

    if (!data.logged_in) {
        window.location.href = "/login";
        return false;
    }

    currentUser.textContent = t("logged_in_as", {
        username: data.user.username
    });
    return true;
}


async function loadFeatures() {
    try {
        const response = await apiRequest("/api/features");
        const data = await readJsonResponse(response);
        serverFeatures = { ...serverFeatures, ...data };
    } catch (error) {
        console.error("Failed to load feature flags", error);
        // Leave serverFeatures at its conservative defaults (server
        // fallbacks off) — voice/research controls still degrade
        // gracefully to whatever the browser alone can do.
    }
}


async function loadConversations() {
    const response = await apiRequest("/api/conversations");
    const data = await readJsonResponse(response);
    return data.conversations;
}


async function createConversation() {
    const response = await apiRequest("/api/conversations", {
        method: "POST"
    });
    const data = await readJsonResponse(response);
    return data.conversation;
}


async function loadMessages(conversationId) {
    const response = await apiRequest(
        `/api/conversations/${conversationId}/messages`
    );
    const data = await readJsonResponse(response);
    return data.messages;
}


async function refreshConversationView() {
    const [messages, conversations] = await Promise.all([
        loadMessages(activeConversationId),
        loadConversations()
    ]);

    renderMessages(messages);
    renderConversations(conversations);
}


async function openConversation(conversationId, updateBrowserHistory = false) {
    activeConversationId = conversationId;

    if (updateBrowserHistory) {
        window.history.pushState({}, "", `/chat/${conversationId}`);
    }

    const conversationMessages = await loadMessages(conversationId);
    renderMessages(conversationMessages);

    const conversations = await loadConversations();
    renderConversations(conversations);

    await loadCanvas(conversationId);
}


async function initializeChat() {
    try {
        const loggedIn = await loadSession();

        if (!loggedIn) {
            return;
        }

        let conversations = await loadConversations();

        if (conversations.length === 0) {
            const conversation = await createConversation();
            activeConversationId = conversation.id;
            conversations = await loadConversations();
        }

        const requestedConversationExists = conversations.some(
            (conversation) => conversation.id === activeConversationId
        );

        if (!activeConversationId || !requestedConversationExists) {
            activeConversationId = conversations[0].id;
        }

        window.history.replaceState({}, "", `/chat/${activeConversationId}`);

        renderConversations(conversations);

        const conversationMessages = await loadMessages(activeConversationId);
        renderMessages(conversationMessages);

        await loadCanvas(activeConversationId);

    } catch (error) {
        console.error(error);
        showPageError(error.message);
    }
}


newChatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
        const conversation = await createConversation();
        await openConversation(conversation.id, true);
    } catch (error) {
        console.error(error);
        showPageError(error.message);
    }
});


messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const userText = input.value.trim();

    if ((!userText && pendingAttachments.length === 0) || !activeConversationId) {
        return;
    }

    if (pendingAttachments.some((attachment) => attachment.type === "loading")) {
        window.alert("Please wait for the attachment to finish processing.");
        return;
    }

    removeEmptyState();

    const outgoingImages = buildOutgoingImages(pendingAttachments);
    const outgoingMessage = buildOutgoingMessage(userText, pendingAttachments);

    createUserMessage(
        userText,
        null,
        outgoingImages.map((image) => image.data_url)
    );

    input.value = "";
    pendingAttachments = [];
    renderAttachments();
    resizeMessageInput();
    scrollToBottom();

    await streamAssistantReply(
        apiRequest(
            `/api/conversations/${activeConversationId}/messages`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: outgoingMessage,
                    language: languagePreference,
                    images: outgoingImages,
                    research: researchMode,
                    image_aspect_ratio: imageAspectRatio
                })
            }
        )
    );
});


logoutButton.addEventListener("click", async () => {
    try {
        await apiRequest("/api/logout", { method: "POST" });
    } finally {
        window.location.href = "/login";
    }
});


languageSelect.addEventListener("change", async () => {
    languagePreference = languageSelect.value;

    try {
        window.localStorage.setItem("easta_language", languagePreference);
    } catch {
        // localStorage can be unavailable — the preference still applies
        // for the rest of this session via the in-memory variable.
    }

    await loadTranslations(languagePreference);
    applyStaticTranslations();
    applyThemeToggleUI();

    if (!messagesContainer.querySelector(".message-row")) {
        showEmptyState();
    }
});


openButton.addEventListener("click", () => {
    sidebar.classList.toggle("sidebar-hidden");
});


closeButton.addEventListener("click", () => {
    sidebar.classList.add("sidebar-hidden");
});


window.addEventListener("popstate", async () => {
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const conversationId = Number(pathParts[1]);

    if (Number.isInteger(conversationId)) {
        try {
            await openConversation(conversationId, false);
        } catch (error) {
            console.error(error);
            showPageError(error.message);
        }
    }
});


async function bootstrap() {
    languageSelect.value = languagePreference;

    await loadTranslations(languagePreference);
    applyStaticTranslations();
    applyThemeToggleUI();

    await loadFeatures();
    researchToggle.hidden = !serverFeatures.research_mode;
    imageStyleSelect.hidden = !serverFeatures.generation;
    updateMicButtonVisibility();

    resizeMessageInput();
    await initializeChat();
}

bootstrap();
