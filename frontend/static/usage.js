// Phase 25: see account.js's identical apiRequest() for the full
// reasoning -- a bounded wait with a friendly timeout message instead
// of a request (and whatever button triggered it) hanging forever.
function apiRequest(path, options = {}, timeoutMs = 20000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(
        `${window.BACKEND_URL}${path}`,
        {
            ...options,
            credentials: "include",
            signal: controller.signal,
            headers: {
                ...options.headers
            }
        }
    )
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


function formatUsd(value) {
    return `$${value.toFixed(4)}`;
}


function formatNumber(value) {
    return new Intl.NumberFormat().format(value);
}


function renderModelBreakdown(byModel, totalCost) {
    const container = document.getElementById("model-breakdown");
    container.innerHTML = "";

    if (byModel.length === 0) {
        container.innerHTML =
            '<p class="usage-empty">No usage recorded yet — ' +
            "send a few messages and check back here.</p>";
        return;
    }

    const maxCost = Math.max(...byModel.map((row) => row.cost_usd), 0.0001);

    for (const row of byModel) {
        const wrapper = document.createElement("div");
        wrapper.className = "model-bar-row";

        const name = document.createElement("div");
        name.className = "model-name";
        name.textContent = row.model;

        const track = document.createElement("div");
        track.className = "model-bar-track";

        const fill = document.createElement("div");
        fill.className = "model-bar-fill";
        fill.style.width =
            `${Math.max(4, (row.cost_usd / maxCost) * 100)}%`;

        track.appendChild(fill);

        const cost = document.createElement("div");
        cost.className = "model-bar-cost";
        cost.textContent = formatUsd(row.cost_usd);

        wrapper.appendChild(name);
        wrapper.appendChild(track);
        wrapper.appendChild(cost);

        container.appendChild(wrapper);
    }
}


function renderUsageTable(logs) {
    const body = document.getElementById("usage-table-body");
    body.innerHTML = "";

    if (logs.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.className = "usage-empty";
        cell.textContent = "No calls logged yet.";
        row.appendChild(cell);
        body.appendChild(row);
        return;
    }

    for (const log of logs) {
        const row = document.createElement("tr");

        const modelCell = document.createElement("td");
        modelCell.textContent = log.model;

        const promptCell = document.createElement("td");
        promptCell.textContent = formatNumber(log.prompt_tokens);

        const completionCell = document.createElement("td");
        completionCell.textContent = formatNumber(log.completion_tokens);

        const costCell = document.createElement("td");
        costCell.textContent = formatUsd(log.cost_usd);

        const whenCell = document.createElement("td");
        whenCell.textContent = new Date(log.created_at)
            .toLocaleString();

        row.appendChild(modelCell);
        row.appendChild(promptCell);
        row.appendChild(completionCell);
        row.appendChild(costCell);
        row.appendChild(whenCell);

        body.appendChild(row);
    }
}


/* Reads the currently-active theme's resolved token values (light or
 * dark — data-theme is already stamped on <html> before this script
 * runs, by the inline snippet in <head>) so the chart's colors stay in
 * sync with the CSS palette in styles.css without duplicating hex
 * values here. */
function themeColor(variableName) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(variableName)
        .trim();
}


function hexToRgba(hex, alpha) {
    const value = (hex || "").replace("#", "");

    if (value.length !== 6) {
        return `rgba(196, 105, 62, ${alpha})`; // fallback: light-mode accent
    }

    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


function renderSpendChart(byDay) {
    const canvas = document.getElementById("spend-chart");

    if (typeof Chart === "undefined") {
        return;
    }

    const accentColor = themeColor("--color-accent");
    const textColor = themeColor("--color-text-muted");
    const gridColor = themeColor("--color-border");

    new Chart(canvas, {
        type: "line",
        data: {
            labels: byDay.map((row) => row.day),
            datasets: [
                {
                    label: "Daily spend (USD)",
                    data: byDay.map((row) => row.cost_usd),
                    borderColor: accentColor,
                    backgroundColor: hexToRgba(accentColor, 0.15),
                    tension: 0.3,
                    fill: true,
                    pointRadius: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: textColor,
                        callback: (value) => `$${value}`
                    },
                    grid: { color: gridColor }
                }
            }
        }
    });
}


async function initializeUsageDashboard() {
    try {
        const summaryResponse = await apiRequest(
            "/api/usage/summary"
        );
        const summary = await readJsonResponse(summaryResponse);

        document.getElementById("stat-total-cost").textContent =
            formatUsd(summary.total_cost_usd);

        document.getElementById("stat-total-calls").textContent =
            formatNumber(summary.total_calls);

        document.getElementById("stat-prompt-tokens").textContent =
            formatNumber(summary.total_prompt_tokens);

        document.getElementById("stat-completion-tokens").textContent =
            formatNumber(summary.total_completion_tokens);

        renderModelBreakdown(summary.by_model, summary.total_cost_usd);
        renderSpendChart(summary.by_day);

        const logsResponse = await apiRequest(
            "/api/usage/logs?limit=50"
        );
        const logsData = await readJsonResponse(logsResponse);

        renderUsageTable(logsData.logs);

    } catch (error) {
        console.error(error);
    }
}


function renderOrganizationUsage(usage) {
    document.getElementById("org-stat-total-cost").textContent =
        formatUsd(usage.total_cost);

    document.getElementById("org-stat-total-calls").textContent =
        formatNumber(usage.total_calls);

    const body = document.getElementById("org-usage-table-body");
    body.innerHTML = "";

    if (usage.members.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 3;
        cell.className = "usage-empty";
        cell.textContent = "No members yet.";
        row.appendChild(cell);
        body.appendChild(row);
        return;
    }

    for (const member of usage.members) {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        nameCell.textContent = member.username;

        const costCell = document.createElement("td");
        costCell.textContent = formatUsd(member.total_cost);

        const callsCell = document.createElement("td");
        callsCell.textContent = formatNumber(member.call_count);

        row.appendChild(nameCell);
        row.appendChild(costCell);
        row.appendChild(callsCell);
        body.appendChild(row);
    }
}


async function loadOrganizationUsage(orgId) {
    try {
        const response = await apiRequest(`/api/organizations/${orgId}/usage`);
        const data = await readJsonResponse(response);
        renderOrganizationUsage(data);
    } catch (error) {
        console.error(error);
    }
}


// Combined cost dashboard for orgs the user OWNS -- hidden entirely if
// they own none (most users), following the same hide-rather-than-show-
// empty pattern as the Google sign-in button / mic button elsewhere.
async function initializeOrganizationUsage() {
    const panel = document.getElementById("org-usage-panel");
    const select = document.getElementById("org-usage-select");

    try {
        const response = await apiRequest("/api/organizations");
        const data = await readJsonResponse(response);

        const ownedOrgs = data.organizations.filter(
            (org) => org.role === "owner"
        );

        if (ownedOrgs.length === 0) {
            return;
        }

        panel.hidden = false;
        select.innerHTML = "";

        ownedOrgs.forEach((org) => {
            const option = document.createElement("option");
            option.value = org.id;
            option.textContent = org.name;
            select.appendChild(option);
        });

        const requestedOrgId =
            new URLSearchParams(window.location.search).get("org");
        const requestedOrg = ownedOrgs.find(
            (org) => String(org.id) === requestedOrgId
        );
        select.value = requestedOrg ? requestedOrg.id : ownedOrgs[0].id;

        select.addEventListener(
            "change",
            () => loadOrganizationUsage(select.value)
        );

        await loadOrganizationUsage(select.value);

    } catch (error) {
        console.error(error);
    }
}


initializeUsageDashboard();
initializeOrganizationUsage();
