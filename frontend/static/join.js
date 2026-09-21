const joinButton = document.getElementById("join-button");
const joinDescription = document.getElementById("join-description");
const joinError = document.getElementById("join-error");
const joinSuccess = document.getElementById("join-success");


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


joinButton.addEventListener("click", async () => {
    joinError.textContent = "";
    joinSuccess.textContent = "";
    joinButton.disabled = true;
    const originalLabel = joinButton.textContent;
    joinButton.textContent = "Joining…";

    try {
        const response = await fetchWithTimeout(
            `${window.BACKEND_URL}/api/organizations/join/${encodeURIComponent(window.INVITE_TOKEN)}`,
            {
                method: "POST",
                credentials: "include"
            }
        );

        if (response.status === 401) {
            // Not logged in -- send them to log in first, then bounce
            // right back here to finish joining. Same "next" pattern
            // login.js/register.js use for any other protected page.
            const next = `/join/${encodeURIComponent(window.INVITE_TOKEN)}`;
            window.location.href = `/login?next=${encodeURIComponent(next)}`;
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Could not join this organization.");
        }

        joinDescription.textContent =
            `You've joined ${data.organization.name}.`;
        joinSuccess.textContent = "Welcome to the team.";
        joinButton.hidden = true;

        setTimeout(() => {
            window.location.href = "/account";
        }, 1500);

    } catch (error) {
        joinError.textContent = error.message;
        joinButton.disabled = false;
        joinButton.textContent = originalLabel;
    }
});
