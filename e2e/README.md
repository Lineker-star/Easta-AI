# EASTA end-to-end tests (Playwright)

Playwright over Cypress here: real multi-browser support (Cypress'
non-Chromium support is comparatively limited) and no separate paid
dashboard needed for CI reporting.

This suite drives a real, already-running EASTA stack through a real
browser — it does **not** start Postgres/the backend/the frontend
itself, and it does **not** mock the LLM. Several tests (sending a
message, attaching a file, generating a PDF) wait on a real streamed
OpenRouter reply, which is what makes them worth having but also the
source of most flakiness here — see "Known flakiness" below.

⚠️ **Run this against a disposable/staging stack, never production.**
Several tests register throwaway accounts, and the full journey and
conversation-delete specs delete conversations. `randomTestUser()`
(`helpers/auth.js`) generates a fresh username/email per run so
repeated runs against the same disposable database don't collide, but
nothing here is scoped to avoid touching real user data if you point
it at production by mistake.

## Prerequisites

1. **A disposable Postgres database**, migrated with
   `database/schema.sql` — the same `psql ... -f database/schema.sql`
   command the main README's "Run locally" / "Deploy" sections use,
   just pointed at a throwaway database rather than your real one.
2. **The backend running** against that database (`uvicorn app:app`
   from `backend/`, or however you normally run it), with a real
   `OPENROUTER_API_KEY` — the message/attachment/PDF-generation tests
   need a real model reply, not a mock.
3. **The frontend running** (`python app.py` from `frontend/`, or
   however you normally run it) pointed at that backend.
4. **`EASTA_E2E_MOCK_GOOGLE_OAUTH=true`** in the backend's environment
   — only needed for `tests/google-signin.spec.js`; every other spec
   works without it. See "Google Sign-In" below before turning this
   on anywhere.

This is the same three-process setup as the main README's "Run
locally" section (Postgres, `uvicorn` for the backend, `flask run` /
`python app.py` for the frontend) — if you can already develop against
it locally, you already have everything this suite needs except
`EASTA_E2E_MOCK_GOOGLE_OAUTH`.

## Setup

```bash
cd e2e
cp .env.example .env
# edit .env: E2E_BASE_URL (the frontend) and E2E_BACKEND_URL (the
# backend) -- defaults already match a standard local "Run locally" setup.

npm install
npx playwright install --with-deps chromium
```

## Running

```bash
npm test            # headless, once
npm run test:headed # headed, so you can watch it
npm run test:ui     # Playwright's interactive UI mode -- best for
                     # writing/debugging a new test
npm run report       # opens the HTML report from the last run
```

Run a single file or test by name:

```bash
npx playwright test tests/login.spec.js
npx playwright test -g "wrong password"
```

The suite runs single-worker, not in parallel (`playwright.config.js`)
— several tests create/delete accounts and conversations against a
shared database, and running them concurrently would race.

## What's covered

- **`full-journey.spec.js`** — one continuous session: register → log
  out → log back in → send a message and get a streamed reply → attach
  a file → generate a PDF (downloaded and verified as a real PDF, not
  just "a link appeared") → rename the conversation → delete it.
- **`register.spec.js`** — successful registration, a client-side
  password-mismatch rejection, and a duplicate-username rejection.
- **`login.spec.js`** — log out/back in, a wrong password, and that
  `/chat` redirects to `/login` when logged out.
- **`chat-message.spec.js`** — sending a message produces a real,
  non-empty streamed reply.
- **`attachment.spec.js`** — attaching a `.txt` file shows a chip,
  sending clears it, and a reply still streams in normally.
- **`generate-document.spec.js`** — asking for a PDF opens the canvas
  panel and produces a real downloadable PDF (checked via its `%PDF-`
  magic-byte header, not just that a download link rendered).
- **`conversation-rename.spec.js`** / **`conversation-delete.spec.js`**
  — the sidebar's "⋯" menu → Rename / Delete flow.
- **`google-signin.spec.js`** — see below.

Each targeted spec starts from a fresh registered user, so it can run
on its own (`npx playwright test tests/login.spec.js`) without
depending on another spec having run first.

## Google Sign-In

There's no way to drive a real Google consent screen from an
automated browser here — no live test Google account's credentials to
hold, and Google actively blocks scripted sign-ins with its own bot
detection. Skipping this coverage entirely was explicitly ruled out,
so `google-signin.spec.js` instead exercises a backend test-only
route, `GET /api/e2e/mock-google-callback` (see `backend/app.py`,
right after the real `GET /api/auth/google/callback`).

That route skips only the actual network round trip to Google (the
token exchange and profile fetch) — everything downstream (account
creation, linking an existing account by verified email, session-
cookie setting, redirect to `/chat`) is the exact same code the real
callback runs, so this is a real test of that logic, not a stub that
just claims success.

It 404s unless the backend has:

```env
EASTA_E2E_MOCK_GOOGLE_OAUTH=true
```

**Never set this in production.** With it on, anyone who can reach the
backend can sign in as any email address with zero verification — it
exists purely so this suite can exercise the post-Google-auth code
path without real Google credentials. Only enable it in a disposable/
staging environment stood up specifically to run this suite, and leave
it unset (the default) everywhere else, including your local `.env` if
you don't intend to run this one spec.

Not covered, and out of scope for a browser-level suite: that the mock
route correctly 404s when the flag is unset — that's a backend-startup
concern that would need the server restarted mid-run to exercise.

## Known flakiness

- **Message/attachment/PDF-generation tests depend on a real LLM
  call** through OpenRouter — a slow provider response, a transient
  OpenRouter error, or (for the PDF test) the model choosing not to
  call the `generate_document` tool despite an explicit prompt can all
  fail a run that has nothing wrong with the app itself. These prompts
  are phrased to match `_GENERATION_KEYWORDS` in `backend/app.py` to
  make routing as reliable as possible, and timeouts are generous
  (`playwright.config.js`), but this suite can't fully eliminate LLM
  non-determinism. A failure here is worth a second look before
  assuming the app regressed.
- **Shared disposable database**: running the full suite twice in a
  row against the same database is fine (usernames/emails are
  randomized per run), but don't run it against a database anything
  else is actively using at the same time.

## CI / pre-deploy

See the main `README.md`'s "Deploy via Sevalla" → "Update the live
application" section — this suite is meant to run before every deploy,
against a staging environment if you have one, or locally against a
disposable database at minimum.
