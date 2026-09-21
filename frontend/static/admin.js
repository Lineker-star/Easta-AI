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


function formatDateTime(value) {
    return new Date(value).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}


function themeColor(variableName) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(variableName)
        .trim();
}


function renderSignupsChart(byDay) {
    const canvas = document.getElementById("admin-signups-chart");

    if (typeof Chart === "undefined") {
        return;
    }

    const accentColor = themeColor("--color-accent");
    const textColor = themeColor("--color-text-muted");
    const gridColor = themeColor("--color-border");

    new Chart(canvas, {
        type: "bar",
        data: {
            labels: byDay.map((row) => row.day),
            datasets: [
                {
                    label: "New signups",
                    data: byDay.map((row) => row.count),
                    backgroundColor: accentColor
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
                    ticks: { color: textColor, precision: 0 },
                    grid: { color: gridColor }
                }
            }
        }
    });
}


function renderUsersTable(users) {
    const body = document.getElementById("admin-users-table-body");
    body.innerHTML = "";

    if (users.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 7;
        cell.className = "usage-empty";
        cell.textContent = "No users yet.";
        row.appendChild(cell);
        body.appendChild(row);
        return;
    }

    for (const user of users) {
        const row = document.createElement("tr");

        const usernameCell = document.createElement("td");
        usernameCell.textContent = user.username;

        const emailCell = document.createElement("td");
        emailCell.textContent = user.email;

        const planCell = document.createElement("td");
        planCell.textContent = user.plan;

        const adminCell = document.createElement("td");
        adminCell.textContent = user.is_admin ? "Yes" : "";

        const conversationsCell = document.createElement("td");
        conversationsCell.textContent = formatNumber(user.conversation_count);

        const spendCell = document.createElement("td");
        spendCell.textContent = formatUsd(user.total_cost);

        const joinedCell = document.createElement("td");
        joinedCell.textContent = formatDateTime(user.created_at);

        row.appendChild(usernameCell);
        row.appendChild(emailCell);
        row.appendChild(planCell);
        row.appendChild(adminCell);
        row.appendChild(conversationsCell);
        row.appendChild(spendCell);
        row.appendChild(joinedCell);

        body.appendChild(row);
    }
}


async function initializeAdminPage() {
    try {
        const statsResponse = await apiRequest("/api/admin/stats");

        if (statsResponse.status === 403) {
            document.getElementById("admin-denied").hidden = false;
            return;
        }

        const stats = await readJsonResponse(statsResponse);

        document.getElementById("admin-content").hidden = false;

        document.getElementById("admin-stat-users").textContent =
            formatNumber(stats.total_users);
        document.getElementById("admin-stat-organizations").textContent =
            formatNumber(stats.total_organizations);
        document.getElementById("admin-stat-conversations").textContent =
            formatNumber(stats.total_conversations);
        document.getElementById("admin-stat-messages").textContent =
            formatNumber(stats.total_messages);
        document.getElementById("admin-stat-documents").textContent =
            formatNumber(stats.total_documents);
        document.getElementById("admin-stat-cost").textContent =
            formatUsd(stats.total_cost_usd);
        document.getElementById("admin-stat-calls").textContent =
            formatNumber(stats.total_calls);

        renderSignupsChart(stats.signups_by_day);

        const usersResponse = await apiRequest("/api/admin/users");
        const usersData = await readJsonResponse(usersResponse);
        renderUsersTable(usersData.users);

    } catch (error) {
        console.error(error);
    }
}


initializeAdminPage();
