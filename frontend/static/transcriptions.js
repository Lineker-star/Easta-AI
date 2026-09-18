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


const uploadForm = document.getElementById("upload-form");
const uploadError = document.getElementById("upload-error");
const audioFilesInput = document.getElementById("audio-files-input");
const chooseFilesButton = document.getElementById("choose-files-button");
const chosenFilesSummary = document.getElementById("chosen-files-summary");
const startJobButton = document.getElementById("start-job-button");

const jobDetailPanel = document.getElementById("job-detail-panel");
const jobIdLabel = document.getElementById("job-id-label");
const jobStatusBadge = document.getElementById("job-status-badge");
const jobProgressLabel = document.getElementById("job-progress-label");
const downloadTxtLink = document.getElementById("download-txt-link");
const downloadZipLink = document.getElementById("download-zip-link");
const jobItemsBody = document.getElementById("job-items-body");

const jobList = document.getElementById("job-list");

let activeJobId = window.INITIAL_JOB_ID;
let pollTimer = null;


function formatDateTime(value) {
    return new Date(value).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}


function statusLabel(status) {
    const labels = {
        queued: "Queued",
        processing: "Processing",
        done: "Done",
        failed: "Failed"
    };
    return labels[status] || status;
}


const STATUS_CLASSES = ["status-queued", "status-processing", "status-done", "status-failed"];


function createStatusBadge(status) {
    const badge = document.createElement("span");
    badge.className = `status-badge status-${status}`;
    badge.textContent = statusLabel(status);
    return badge;
}


function applyStatusBadge(el, status) {
    el.classList.remove(...STATUS_CLASSES);
    el.classList.add("status-badge", `status-${status}`);
    el.textContent = statusLabel(status);
}


chooseFilesButton.addEventListener("click", () => audioFilesInput.click());

audioFilesInput.addEventListener("change", () => {
    const files = audioFilesInput.files;

    if (files.length === 0) {
        chosenFilesSummary.textContent = "";
        startJobButton.disabled = true;
        return;
    }

    const names = Array.from(files).map((file) => file.name).join(", ");
    chosenFilesSummary.textContent =
        files.length === 1 ? names : `${files.length} files selected: ${names}`;
    startJobButton.disabled = false;
});


uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    uploadError.textContent = "";

    const files = audioFilesInput.files;

    if (files.length === 0) {
        return;
    }

    const originalLabel = startJobButton.textContent;
    startJobButton.disabled = true;
    startJobButton.textContent = "Uploading…";

    try {
        const formData = new FormData();
        Array.from(files).forEach((file) => formData.append("files", file));

        const response = await apiRequest("/api/transcription-jobs", {
            method: "POST",
            body: formData
        });

        const data = await readJsonResponse(response);

        audioFilesInput.value = "";
        chosenFilesSummary.textContent = "";

        if (data.truncated) {
            uploadError.textContent =
                `Only the first ${data.total_files} files were queued (per-job limit).`;
        }

        activeJobId = data.job_id;
        window.history.pushState({}, "", `/transcriptions/${activeJobId}`);

        await refreshJobDetail();
        await refreshJobList();

    } catch (error) {
        uploadError.textContent = error.message;

    } finally {
        startJobButton.disabled = false;
        startJobButton.textContent = originalLabel;
    }
});


function renderJobItems(items) {
    jobItemsBody.innerHTML = "";

    items.forEach((item) => {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        nameCell.textContent = item.filename;

        const statusCell = document.createElement("td");
        statusCell.appendChild(createStatusBadge(item.status));

        const actionCell = document.createElement("td");

        if (item.status === "done" && item.has_transcript) {
            const viewButton = document.createElement("button");
            viewButton.type = "button";
            viewButton.className = "message-action-button";
            viewButton.textContent = "View";
            viewButton.addEventListener("click", () => toggleTranscript(row, item));
            actionCell.appendChild(viewButton);
        } else if (item.status === "failed") {
            const errorLabel = document.createElement("span");
            errorLabel.className = "error-message";
            errorLabel.textContent = item.error || "Failed";
            actionCell.appendChild(errorLabel);
        }

        row.appendChild(nameCell);
        row.appendChild(statusCell);
        row.appendChild(actionCell);
        jobItemsBody.appendChild(row);
    });
}


async function toggleTranscript(row, item) {
    const existing = row.nextElementSibling;

    if (existing && existing.classList.contains("transcript-detail-row")) {
        existing.remove();
        return;
    }

    try {
        const response = await apiRequest(
            `/api/transcription-jobs/${activeJobId}/items/${item.id}`
        );
        const data = await readJsonResponse(response);

        const detailRow = document.createElement("tr");
        detailRow.className = "transcript-detail-row";

        const detailCell = document.createElement("td");
        detailCell.colSpan = 3;

        const pre = document.createElement("pre");
        pre.className = "transcript-preview";
        pre.textContent = data.transcript_text || "";

        detailCell.appendChild(pre);
        detailRow.appendChild(detailCell);
        row.after(detailRow);

    } catch (error) {
        console.error(error);
    }
}


async function refreshJobDetail() {
    if (!activeJobId) {
        jobDetailPanel.hidden = true;
        return;
    }

    try {
        const response = await apiRequest(`/api/transcription-jobs/${activeJobId}`);
        const data = await readJsonResponse(response);

        jobDetailPanel.hidden = false;
        jobIdLabel.textContent = data.job.id;
        applyStatusBadge(jobStatusBadge, data.job.status);
        jobProgressLabel.textContent =
            `${data.job.completed_files} / ${data.job.total_files} files processed`;

        const hasDoneItems = data.items.some((item) => item.status === "done");
        downloadTxtLink.hidden = !hasDoneItems;
        downloadZipLink.hidden = !hasDoneItems;

        if (hasDoneItems) {
            downloadTxtLink.href =
                `${window.BACKEND_URL}/api/transcription-jobs/${activeJobId}/download?format=txt`;
            downloadZipLink.href =
                `${window.BACKEND_URL}/api/transcription-jobs/${activeJobId}/download?format=zip`;
        }

        renderJobItems(data.items);

        const finished = data.job.status === "done" || data.job.status === "failed";

        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }

        if (!finished) {
            pollTimer = setTimeout(refreshJobDetail, 3000);
        }

    } catch (error) {
        console.error(error);
    }
}


async function refreshJobList() {
    try {
        const response = await apiRequest("/api/transcription-jobs");
        const data = await readJsonResponse(response);

        jobList.innerHTML = "";

        if (data.jobs.length === 0) {
            const empty = document.createElement("p");
            empty.className = "usage-empty";
            empty.textContent = "No transcription jobs yet.";
            jobList.appendChild(empty);
            return;
        }

        const table = document.createElement("table");
        table.className = "usage-table";

        const thead = document.createElement("thead");
        thead.innerHTML =
            "<tr><th>Job</th><th>Status</th><th>Progress</th><th>Created</th></tr>";
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        data.jobs.forEach((job) => {
            const row = document.createElement("tr");

            const idCell = document.createElement("td");
            const link = document.createElement("a");
            link.href = `/transcriptions/${job.id}`;
            link.textContent = `#${job.id}`;
            link.addEventListener("click", (event) => {
                event.preventDefault();
                activeJobId = job.id;
                window.history.pushState({}, "", `/transcriptions/${job.id}`);
                refreshJobDetail();
            });
            idCell.appendChild(link);

            const statusCell = document.createElement("td");
            statusCell.appendChild(createStatusBadge(job.status));

            const progressCell = document.createElement("td");
            progressCell.textContent = `${job.completed_files} / ${job.total_files}`;

            const createdCell = document.createElement("td");
            createdCell.textContent = formatDateTime(job.created_at);

            row.appendChild(idCell);
            row.appendChild(statusCell);
            row.appendChild(progressCell);
            row.appendChild(createdCell);
            tbody.appendChild(row);
        });

        table.appendChild(tbody);

        const scrollWrap = document.createElement("div");
        scrollWrap.className = "table-scroll";
        scrollWrap.appendChild(table);
        jobList.appendChild(scrollWrap);

    } catch (error) {
        console.error(error);
    }
}


async function initializeTranscriptionsPage() {
    await refreshJobDetail();
    await refreshJobList();
}


initializeTranscriptionsPage();
