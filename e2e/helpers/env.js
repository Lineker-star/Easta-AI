// Single source of truth for where the already-running app lives.
// This suite does NOT start the app itself -- see README.md's
// "Prerequisites" (Postgres + the FastAPI backend + the Flask
// frontend, the same three processes as the main README's "Run
// locally" section). Point these at a disposable/staging stack, never
// at production.
require("dotenv").config();

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5000";
const BACKEND_URL = process.env.E2E_BACKEND_URL || "http://localhost:8000";

module.exports = { BASE_URL, BACKEND_URL };
