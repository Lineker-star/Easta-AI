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


function renderSpendChart(byDay) {
    const canvas = document.getElementById("spend-chart");

    if (typeof Chart === "undefined") {
        return;
    }

    new Chart(canvas, {
        type: "line",
        data: {
            labels: byDay.map((row) => row.day),
            datasets: [
                {
                    label: "Daily spend (USD)",
                    data: byDay.map((row) => row.cost_usd),
                    borderColor: "#C4693E",
                    backgroundColor: "rgba(196, 105, 62, 0.15)",
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
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => `$${value}`
                    }
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


initializeUsageDashboard();
