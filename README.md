# EASTA

**Your AI assistant, built for Africa.**

A full-stack AI chat application with a Flask frontend, FastAPI
backend, PostgreSQL database, and OpenRouter as the LLM provider.
EASTA routes each message between a fast/free model and a stronger
frontier model depending on how complex the request looks, with
automatic fallback if a model errors out or is rate-limited.

The complete application is split into three main folders, with two
optional exercises included separately:

``` text
EASTA/
├── frontend/
├── backend/
├── database/
└── exercises/
    ├── 01-openrouter/
    └── 02-postgresql-multiuser/
```

This project started from the open-source
[MariyaGPT](https://github.com/MariyaSha/MariyaGPT) tutorial
template (MIT-licensed) and has been rebranded and extended into
**EASTA**.

## What's new in this pass

This update did a full redesign, and shipped a first,
intentionally-scoped version of the four feature areas requested.
Everything below runs end-to-end, but a few pieces are marked
**prototype-grade** — they work, but need hardening before real
production traffic. Pick these up in Cursor:

- **Redesign** — full new design system in `frontend/static/styles.css`
  (warm cream + terracotta, Claude-inspired), a new marketing
  **landing page** at `/`, and a redesigned login/register/chat UI.
- **Tool use** — the smart model can call `web_search` (DuckDuckGo
  HTML scrape) and `execute_python` (subprocess sandbox) mid-answer.
  See `TOOLS` / `execute_tool()` in `backend/app.py`.
  ⚠️ **Prototype-grade**: the scraper is fragile long-term (swap for
  Tavily/Serper/Bing for reliability), and the Python sandbox is a
  blocklist + subprocess, **not** real isolation — swap for
  E2B/Modal/a locked-down container before letting untrusted users
  near it.
- **RAG grounding** — add documents via `POST /api/documents`;
  answers are grounded via Postgres full-text search (no pgvector or
  embedding calls needed). Swap for pgvector + real embeddings later
  if you need semantic (not just keyword) matching.
- **Context summarization** — conversations longer than
  `EASTA_CONTEXT_RECENT_MESSAGES` (default 12) get their older turns
  folded into a running summary automatically after each reply.
- **UI polish** — Markdown + syntax-highlighted code rendering (with
  a copy button per block), edit-and-resubmit on any past message,
  regenerate on the last reply, a file-attach button (text files are
  read client-side and inlined into the message — no OCR/PDF parsing
  yet), and a **cost dashboard** at `/usage` backed by
  `usage_logs` / `/api/usage/*`.
- **Multilingual conversation** — `EASTA_SYSTEM_PROMPT` in
  `backend/app.py` names English, French, Spanish, German, Chinese,
  Russian, Portuguese, Japanese, Korean, Italian, and Dutch
  explicitly, and instructs the model to reply in whichever language
  the user's message is written in, matching that language's
  register/formality norms (vous/tu, Sie/du, speech levels, etc). A
  **Reply language** selector in the chat sidebar (default: Auto)
  lets a user pin a specific reply language for a conversation
  regardless of what language they type in — see `LANGUAGE_OPTIONS`
  / `build_language_override_message()` in `backend/app.py` and
  `GET /api/languages`. The same selector also switches the
  **interface chrome** (buttons, placeholders, empty states) via a
  small `frontend/static/i18n/<lang>.json` + `t(key)` helper
  (`frontend/static/i18n.js`). ⚠️ **Prototype-grade**: interface
  translations currently only ship for English, French, and Spanish,
  and only cover the chat page — other selector languages keep
  English chrome (the reply-language override still applies
  server-side), and the landing/login/register pages aren't
  localized yet. Add more `frontend/static/i18n/<lang>.json` files
  and `data-i18n*` attributes to extend coverage.
- **Multimodal input** — the composer's attach button (📎) now also
  accepts images (with a thumbnail preview) and PDF/DOCX files, and
  you can paste a screenshot directly into the message box (clipboard
  paste → attached image, same as ChatGPT/Claude). Images are sent as
  OpenAI-style `image_url` content parts to a vision-capable model —
  `EASTA_VISION_MODEL` (defaults to `EASTA_SMART_MODEL`,
  `openai/gpt-4.1-mini`, which already supports image input) with a
  cross-provider fallback, `EASTA_VISION_FALLBACK_MODEL`
  (`google/gemini-3.8-flash` by default) — see `VISION_MODEL` /
  `model_chain_for_images()` in `backend/app.py`. PDF/DOCX files are
  extracted to plain text server-side (`POST /api/extract-text`, via
  `pypdf` / `python-docx`) and inlined into the message the same way
  plain-text attachments already worked, capped at 50 pages / 20,000
  characters with a `(truncated)` marker rather than silently cutting
  content. ⚠️ **Prototype-grade**: image attachments are stored as
  base64 directly in the new `messages.attachments` JSONB column
  (see `database/schema.sql`) — fine for a demo/small-team app, but
  swap for object storage (S3/R2/etc, storing just a URL) before
  relying on this at real scale. Scanned/image-only PDFs have no
  extractable text layer and are not OCR'd (see "Suggested next
  steps"). Editing a past message currently drops any images it had
  (text-only re-ask).
- **Research mode** — a **🔎 Research** toggle in the composer (next
  to attach) runs a deeper research pass instead of the lightweight
  `web_search` tool: it asks the smart model to break the question
  into 2-3 angled search queries, runs them concurrently, dedupes and
  picks the top ~5 results, fetches and reads the actual pages (not
  just snippets, ~3,000 characters each, also concurrently), and hands
  the model a numbered source list with instructions to cite inline
  (`[1]`, `[2]`, ...). Progress shows as pills above the reply
  ("🔎 Researching: ...", "📄 Reading N sources…"), and a compact
  **Sources** list (link + title) renders under the reply and is saved
  with it. See `run_research()` / `EASTA_ENABLE_RESEARCH_MODE` in
  `backend/app.py`. ⚠️ **Prototype-grade**: still built on the same
  DuckDuckGo HTML scrape as the lightweight `web_search` tool (now
  fixed to resolve DuckDuckGo's redirect links to real URLs, which
  full-page fetching depends on) — swap `_duckduckgo_search()` for a
  real search API (Tavily, Serper, Bing, or similar) before depending
  on this for real traffic; that's the one function both the tool and
  research mode call through.
- **Generation + canvas panel** — three new tools let the model
  produce content the user can keep iterating on, shown in a
  **canvas** side panel (toggle in the chat header, like Claude's
  Artifacts / ChatGPT's Canvas) instead of being pasted into the chat:
  - `generate_document` renders Markdown to a downloadable PDF
    (`reportlab`) or DOCX (`python-docx`) and shows the source on the
    canvas with a **Download** button.
  - `generate_image` calls OpenRouter's dedicated Image API (`POST
    /api/v1/images`, model `EASTA_IMAGE_MODEL`, default
    `google/gemini-2.5-flash-image`) and shows the result on the
    canvas with a **Download** button.
  - `write_code` puts a syntax-highlighted code snippet on the canvas
    with a **Copy** button (no file — nothing to download for code).

  A follow-up like "make it shorter" or "change the ending" makes the
  model call the same tool again with the full revised content, which
  updates the canvas **in place** — the conversation only sees a short
  confirmation line, not the whole document/image/code re-pasted (see
  `build_canvas_context_message()` in `backend/app.py`, which tells
  the model there's an active canvas artifact). The canvas holds one
  artifact per conversation (`canvas_artifacts` table, `UNIQUE` on
  `conversation_id`) — a new generation overwrites it, there's no
  version history yet. Generated files live in a new
  `generated_files` table and are served via
  `GET /api/generated/{id}/download`. Gate the whole feature with
  `EASTA_ENABLE_GENERATION`. ⚠️ **Prototype-grade**: the Markdown→PDF/
  DOCX renderers cover a common but limited subset (headings 1-3,
  paragraphs, bullet/numbered lists, fenced code blocks, bold/italic/
  inline code — no tables, images, or nested lists); generated files
  are stored as raw bytes in Postgres, the same prototype-grade
  tradeoff as `messages.attachments` — swap for object storage before
  relying on this at real scale.
- **Voice: speech-to-text and text-to-speech** — a 🎤 mic button in
  the composer transcribes speech into the message box, and a **🔊
  Read aloud** button on every assistant reply speaks it. Both prefer
  the free, zero-latency browser APIs
  (`SpeechRecognition`/`speechSynthesis`) and only fall back to the
  server when the browser can't do the job:
  - Mic button: browser `SpeechRecognition` first (⚠️ **uneven
    support** — Firefox ships none at all, Safari/iOS has quirks);
    falls back to `POST /api/transcribe` (records via `MediaRecorder`,
    transcribes with OpenRouter's Whisper endpoint,
    `EASTA_STT_MODEL`) when unavailable, gated by
    `EASTA_ENABLE_SERVER_STT`.
  - Read aloud: browser `speechSynthesis` first, but only if it has an
    installed voice matching the current reply language; otherwise
    falls back to `POST /api/speak` (OpenRouter TTS,
    `EASTA_TTS_MODEL`/`EASTA_TTS_VOICE`) when `EASTA_ENABLE_SERVER_TTS`
    is on — important given Phase 1's eleven reply languages, since
    browser voice coverage for languages other than the OS's own is
    inconsistent.
  - **Graceful degradation**: `GET /api/features` reports which
    capabilities are actually usable (flags on *and*, transitively,
    an `OPENROUTER_API_KEY` that works), and the mic/read-aloud
    controls stay hidden rather than shown-but-broken when neither the
    browser nor the server can do the job. This pattern — hide/disable
    a control instead of letting it error — now also gates the
    **Research** toggle (`GET /api/features` → `research_mode`).
  - ⚠️ **Prototype-grade**: `POST /api/speak` returns raw audio, and
    OpenRouter doesn't expose a per-call dollar cost for it the way
    the transcription/image endpoints do — so, unlike every other
    generation call in this app, server TTS spend is **not** logged to
    `usage_logs` yet (reconcile it against your OpenRouter invoice
    directly, or swap to a provider/endpoint that reports cost). STT
    and image generation costs *are* logged, same as chat calls.
- **Dark / light mode** — every page (landing, login, register, chat,
  `/usage`) follows the OS's `prefers-color-scheme` on first visit,
  and a 🌙/☀️ toggle in the chat sidebar footer (next to Cost
  dashboard) lets the user override it explicitly, persisted in
  `localStorage`. The dark palette in `frontend/static/styles.css`
  reuses every existing `--color-*` variable name under a
  `:root[data-theme="dark"]` override — no component had to change to
  pick it up. `frontend/templates/_theme_init.html` (included at the
  top of every page's `<head>`, before the stylesheet) resolves and
  stamps `data-theme` on `<html>` before first paint, so there's no
  flash of the wrong theme. Two things that read colors outside CSS
  needed explicit handling: the `/usage` page's Chart.js chart now
  reads the active theme's resolved `--color-*` values via
  `getComputedStyle` when building the chart (`themeColor()` /
  `hexToRgba()` in `frontend/static/usage.js`); the syntax-highlighted
  code blocks in chat deliberately *don't* flip with the theme (see
  the comment above `.assistant-message pre` in `styles.css`) — they
  stay a fixed dark "terminal" color in both themes, same as
  ChatGPT/Claude, so highlight.js's `atom-one-dark` stylesheet needs
  no swap.
- **Account settings + subscription scaffolding** — a new **Account**
  page (`/account`, linked from the chat sidebar footer next to Cost
  dashboard) with a **Profile** section (username/email, "member
  since", backed by `GET`/`PUT /api/account`), a **Password** section
  (`PUT /api/account/password`, verifies the current password with
  `check_password_hash` the same way login does before accepting a
  new one), and a **Plan** section showing the account's plan
  (`GET /api/account/plan`) next to a Free vs. Premium comparison
  table with a disabled "Upgrade — Coming soon" button. A new
  `users.plan` column (`database/schema.sql`, `DEFAULT 'free'`) backs
  this. ⚠️ **Scaffolding, not enforcement**: nothing anywhere in the
  app reads `plan` to gate or limit behavior — every account is fully
  unrestricted regardless of its value, and the comparison table's
  numbers (100 messages/day, 5 research searches/day, etc.) are
  illustrative of a *future* tier structure once billing (Stripe or
  similar) is wired up, not a real current limit — the page says so
  explicitly next to the table so this isn't misleading in the
  meantime.
- **Styled document & slide generation (PDF / DOCX / PPTX)** — a new
  `create_document` tool (alongside `generate_document` from an
  earlier pass, which still exists for quick Markdown drafts pushed to
  the canvas) takes **structured** content — sections with headings,
  paragraphs, bullet lists, and an optional table, not raw
  Markdown/HTML — so rendering stays consistent per format:
  - **PDF** (`reportlab`) — real typography: a colored heading
    hierarchy, consistent margins/line-height, and a title page
    (centered title + generated-by line, page break) once a document
    has 3+ sections, not a monospace text dump.
  - **DOCX** (`python-docx`) — native Word styles (Title/Heading 1/
    Normal/List Bullet/Table Grid), so the output is editable and
    looks like a real Word document, not manually-formatted runs.
  - **PPTX** (`python-pptx`, new dependency) — a title slide plus one
    slide per section, title+bullets or title+short-body, with a
    real table shape when a section has one — never a wall of text,
    since `sanitize_document_sections()` caps bullets/paragraphs per
    section (tighter for pptx: 15 slides max vs. 20 sections for
    PDF/DOCX) and clips every text field, truncating gracefully
    (reported back to the model and, implicitly, in a shorter file)
    rather than erroring or ballooning.
  - **EASTA branding**: the terracotta accent
    (`#C4693E`/`#AD5731`) on headings, table headers, and slide
    titles across all three formats, plus Helvetica (PDF) / Calibri
    (DOCX) instead of each library's Times-New-Roman-ish default —
    deliberately styled without embedding custom font files (a
    closer match to the Fraunces/Inter web fonts is a follow-up, see
    below).
  - Shows up in the chat as a **file card** (icon, name, format ·
    size, download button) via a new `"file_card"` chat-UI event —
    distinct from the canvas-panel treatment the other generation
    tools use, since a finished report/deck is more often a one-time
    deliverable than something to keep iterating on inline. The
    download link is also appended (as a plain Markdown link, not
    re-streamed as visible tokens) to the saved message so it survives
    a reload, the same trick used for research mode's Sources list.
  - `/api/extract-text` (and the composer's attach flow) now also
    reads **`.pptx`** uploads (`extract_pptx_text()`, slide-by-slide
    text and table content), alongside the existing PDF/DOCX support
    — legacy binary `.ppt` isn't supported, only OOXML `.pptx` (same
    constraint as `.docx`-only, not legacy `.doc`).
  - No new feature flag — gated by the existing `EASTA_ENABLE_GENERATION`.
- **Image generation, reworked** — `generate_image` (added in an
  earlier pass) now renders **inline in the assistant's message** as
  an actual picture, with a **⬇ Download** button and a **🔄
  Regenerate** action, instead of only appearing on the canvas panel —
  a generated image is usually a one-off result to look at and
  download, not a draft to keep iterating on inline the way code/
  documents are, so it no longer touches `canvas_artifacts` at all.
  - **Style/aspect ratio**: square (1:1, default), portrait (3:4), or
    landscape (4:3) — either the model picks one via `generate_image`'s
    own `aspect_ratio` argument (context-dependent, e.g. "portrait"
    for a phone wallpaper), or the user sets it ahead of time with a
    small composer control next to Research, which pins a system hint
    for that turn (`build_image_style_message()`, same mechanism as
    the reply-language override) — hidden when generation is disabled,
    same as the rest of the generation controls.
  - **Regenerate** is a lightweight direct action
    (`POST /api/regenerate-image`) that re-runs the same prompt/aspect
    ratio and swaps the displayed image in place — it does *not* go
    through the chat/tool-calling loop, so regenerating doesn't add a
    new turn to the conversation transcript, matching how a "retry
    this image" button behaves elsewhere.
  - **Cost tracking**: image generation is priced per image, not per
    token, so it never touched `MODEL_PRICING_USD_PER_MILLION_TOKENS`
    (the token-based table used for chat calls) — it logs OpenRouter's
    actual returned `usage.cost` from the Image API via
    `log_direct_cost()`, with a new parallel
    `IMAGE_GENERATION_FALLBACK_COST_USD` table as a flat-estimate
    fallback only if that field is ever missing, so every call still
    gets a non-zero, correctly-attributed row in `usage_logs` — not
    silently uncounted, and not mis-costed as text tokens.
- **API keys + a public API** — an **API Keys** section on the
  Account page: generate a key (shown in full exactly once, at
  creation — only its SHA-256 hash is ever stored), see existing keys
  with their created/last-used dates, and revoke one instantly.
  Backed by a new `api_keys` table.
  - **Bearer-token auth**: `require_user()` — the single auth check
    every existing endpoint already calls — now also accepts
    `Authorization: Bearer <key>` as an alternative to the session
    cookie, resolving to the same `user_id` either way. Every
    endpoint in the app accepts either automatically, with no
    per-route changes, and `enforce_rate_limit(user_id)` downstream
    already applies equally to both, so a leaked key can't bypass
    rate limiting.
  - ⚠️ **Deliberate deviation from "hash it like a password"**: API
    keys use a plain SHA-256 (`hash_api_key()`), not werkzeug's
    `generate_password_hash`. Passwords are checked once at login and
    are low-entropy, so deliberately slow hashing (bcrypt/scrypt)
    resists brute-forcing; API keys are checked on *every* request and
    are already 256 bits of random entropy (`secrets.token_urlsafe`),
    where brute-forcing is infeasible regardless of hash speed and a
    slow hash would add real latency to every call — the same
    reasoning GitHub/Stripe-style API keys use. Explained in a comment
    above the `api_keys` table in `database/schema.sql`.
  - **Public API**: a small, versioned `/v1/*` surface, separate from
    the internal `/api/*` endpoints the web frontend uses (those can
    change without notice; `/v1/*` won't) — `POST /v1/chat` (send a
    message, get a complete non-streamed response — third-party
    clients don't need to parse EASTA's internal SSE-like protocol)
    and `GET /v1/me`. Documented in **[API.md](API.md)** with a curl
    example. Deliberately minimal — no streaming, images, research
    mode, or conversation management via the public API yet.
- **Installable app (PWA)** — EASTA is installable from the browser on
  desktop (Chrome/Edge show an install icon in the address bar) and
  Android (Chrome's "Install app" prompt), launching standalone
  without browser chrome, with an on-brand terracotta "E" icon
  (`frontend/static/icons/`, generated from the same gradient as the
  in-app brand mark). An **⬇ Install app** button appears on the
  landing page and in the chat sidebar footer once the browser signals
  it's installable; iOS Safari has no programmatic install prompt at
  all, so there it shows the manual "Share → Add to Home Screen"
  instructions instead. A minimal service worker
  (`frontend/static/sw.js`, registered at the site root via
  `GET /sw.js` in `frontend/app.py` so its scope covers the whole
  app) caches the static shell (CSS/JS/icons) for fast repeat loads —
  it deliberately never caches `/api/*` or `/v1/*`, so chat data is
  always live.
  - ⚠️ **No literal `.apk` file**: a real, installable Android package
    needs native build tooling (Android SDK, Gradle, a signing
    keystore) that doesn't exist in a Flask/FastAPI web stack — that
    isn't something to fake or half-build here. What's shipped instead
    (the PWA above) is how most web-based AI apps actually deliver
    their "app" experience, and installing one from Chrome on Android
    is functionally equivalent to installing an APK (a home-screen
    icon, standalone window, offline-capable shell) without needing
    the Play Store. To produce an actual signed `.apk`/`.aab` for Play
    Store distribution later, wrap this PWA with **Bubblewrap**
    (Google's CLI, `npx @bubblewrap/cli init --manifest=https://YOUR-DOMAIN/static/manifest.json`)
    or **[PWABuilder](https://www.pwabuilder.com/)** — both generate an
    Android Studio project from the manifest already in this repo; you
    still need the Android SDK and your own signing key to build and
    publish it.
- **Bulk audio transcription** — a **🎙️ Bulk transcription** page
  (linked from the chat sidebar) for transcribing many audio files at
  once: upload several files or a single `.zip` of them, get a job id
  back immediately, and watch per-file progress as transcription runs
  in the background — designed as a batch job from the start, not a
  single blocking request.
  - **Schema**: `transcription_jobs` (one row per upload batch) +
    `transcription_items` (one row per audio file, holding the raw
    bytes only until processed, then cleared to bound storage growth).
  - **Upload**: `POST /api/transcription-jobs` accepts multiple files
    or a `.zip`, creates the job + one item per file (capped at 50
    files/job — extra files are dropped with `truncated: true` in the
    response, not silently over-accepted), and returns immediately.
  - **Processing**: `process_transcription_job()` runs via FastAPI
    `BackgroundTasks` — same process, after the upload response is
    sent — transcribing up to 3 files concurrently
    (`MAX_TRANSCRIPTION_CONCURRENCY`) through the same
    `transcribe_audio_bytes()` (OpenRouter Whisper) used by the
    composer's mic fallback. Each item is validated independently
    (format against `SUPPORTED_AUDIO_EXTENSIONS`, size against
    OpenRouter's documented 25 MB transcription limit) and a failure
    is recorded with a clear `error` string on that item — the job
    keeps going, one bad file doesn't stop the batch.
  - ⚠️ **Explicitly a first version, not the production-scale
    answer**: `BackgroundTasks` has no cross-instance durability (a
    mid-job restart, redeploy, or running more than one backend
    instance can strand a queued item with nothing picking it back
    up) and no global concurrency cap across jobs — fine for modest
    volume, not for "hundreds of files / many hours of audio." A
    detailed comment above `process_transcription_job()` in
    `backend/app.py` calls out the production-hardening step
    explicitly: swap it for a real task queue (Celery or RQ backed by
    Redis, or a dedicated Sevalla background worker process)
    consuming from the same tables with bounded concurrency per
    worker.
  - **Downloads**: once a job has any completed items,
    `GET /api/transcription-jobs/{id}/download` offers a concatenated
    `.txt` (each transcript under a `=== filename ===` header) or a
    `.zip` of one `.docx` per file (reusing `render_markdown_to_docx()`
    from the document-generation work). Individual transcripts are
    also viewable inline per-item on the job page without downloading
    anything.

## Run locally

### 1. Clone EASTA

``` bash
git clone https://github.com/Lineker-star/Daat-AI.git
cd Daat-AI
```

### 2. Set up PostgreSQL

EASTA needs a PostgreSQL database for users, conversations,
messages, documents (RAG), and usage logs (cost dashboard).

If PostgreSQL is not installed on Ubuntu/WSL:

``` bash
sudo apt update
sudo apt install postgresql
```

Open PostgreSQL:

``` bash
sudo -u postgres psql
```

Set a password for the default `postgres` user:

``` sql
ALTER USER postgres WITH PASSWORD 'YOUR_PASSWORD';
```

Create a database:

``` sql
CREATE DATABASE easta;
```

Exit PostgreSQL:

``` text
\q
```

Now create the EASTA tables using the included schema:

``` bash
cd database

psql \
-h localhost \
-U postgres \
-d easta \
-f schema.sql
```

Enter the PostgreSQL password you created when prompted.

### 3. Configure the backend

Navigate to the backend:

``` bash
cd ../backend
```

Copy `backend/.env.example` to `backend/.env` and fill in real
values:

``` env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/easta
OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY
FRONTEND_URL=http://localhost:5000
SESSION_SECRET=YOUR_SESSION_SECRET
COOKIE_SECURE=false
COOKIE_SAMESITE=lax

# Model routing — any OpenRouter model id works here
EASTA_FAST_MODEL=nvidia/nemotron-3-super-120b-a12b:free
EASTA_SMART_MODEL=openai/gpt-4.1-mini
EASTA_FALLBACK_MODEL=meta-llama/llama-3.1-70b-instruct
EASTA_RATE_LIMIT_PER_MINUTE=20

# Feature flags — see backend/.env.example for details on each
EASTA_ENABLE_TOOLS=true
EASTA_ENABLE_RAG=true
EASTA_ENABLE_SUMMARIZATION=true
EASTA_CONTEXT_RECENT_MESSAGES=12
```

You can generate a session secret with:

``` bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Install the backend requirements:

``` bash
pip install -r requirements.txt
```

Start the backend:

``` bash
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Keep this terminal running.

### 4. Configure the frontend

Open a second terminal and navigate to:

``` bash
cd Daat-AI/frontend
```

Copy `frontend/.env.example` to `frontend/.env` and set the backend
URL:

``` env
BACKEND_URL=http://localhost:8000
```

Install the frontend requirements:

``` bash
pip install -r requirements.txt
```

Start the frontend:

``` bash
flask --app app run --host 0.0.0.0 --port 5000
```

Open:

``` text
http://localhost:5000
```

EASTA should now be running locally — you'll land on the new
marketing page, with **Log in** / **Get started** in the top right.

### 5. Optional exercises

The `exercises` folder contains two small examples used in the video
to explain how parts of the app work before putting everything
together.

#### 1. OpenRouter example

A minimal example showing how to connect Python to an LLM through
OpenRouter.

[View the OpenRouter exercise](./exercises/01-openrouter)

#### 2. PostgreSQL multi-user example

A step-by-step example showing how to store multiple users,
conversations, and messages in PostgreSQL.

[View the PostgreSQL exercise](./exercises/02-postgresql-multiuser)

## Deploy via Sevalla

Fork this repository to your own GitHub account before deploying it
so your application can use your own code and future updates.

⭐ [Deploy your EASTA fork with Sevalla](https://sevalla.com/?utm_source=pythonsimplified&utm_medium=Referral&utm_campaign=youtube)

### 1. Deploy PostgreSQL

In Sevalla:

1.  Create a new **PostgreSQL** database.
2.  Keep the database in the same location you plan to use for the
    backend.
3.  Open **Networking** and enable the **External Connection**.
4.  Copy the external database `HOST`, `USER`, `PORT`, and `DATABASE`
    values.

From the local `database` folder, run:

``` bash
psql \
-h HOST \
-U USER \
-p PORT \
-d DATABASE \
-f schema.sql
```

Replace the uppercase placeholders with the External Connection
details from Sevalla.

After the command finishes, the `users`, `conversations`, `messages`,
`documents`, and `usage_logs` tables should appear in Sevalla Studio.

### 2. Deploy the backend

Create a new Sevalla application from your forked GitHub repository.

Enable **Auto Deploy**.

#### Connect PostgreSQL

From the backend application's **Overview**:

**Add Internal Connection → select your PostgreSQL database**

Enable the option to add the database connection details as
environment variables.

The application expects the connection string to be named:

``` text
DATABASE_URL
```

If Sevalla creates it under a different variable name, rename it to
`DATABASE_URL`.

#### Backend environment variables

Add:

``` env
COOKIE_SAMESITE=none
COOKIE_SECURE=true
SESSION_SECRET=YOUR_SESSION_SECRET
OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY
FRONTEND_URL=none
EASTA_ENABLE_TOOLS=true
EASTA_ENABLE_RAG=true
EASTA_ENABLE_SUMMARIZATION=true
```

`DATABASE_URL` should already come from the internal PostgreSQL
connection.

`FRONTEND_URL` is temporary at this stage. You will replace it with
the real frontend domain after creating the frontend application.

To generate a session secret:

``` bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

#### Backend build settings

Go to:

**Settings → Build Strategy → Update Build Strategy**

Set the build path to:

``` text
backend
```

Then go to:

**Processes → ⋮ → Update Process**

Use:

``` bash
uvicorn app:app --host 0.0.0.0 --port 8080
```

### 3. Deploy the frontend

Create another Sevalla application from the **same GitHub
repository**.

Enable **Auto Deploy** again.

#### Frontend environment variable

Copy the backend application's **Domain** from its Overview page.

In the frontend application, add:

``` env
BACKEND_URL=https://YOUR-BACKEND-DOMAIN
```

Do **not** include a trailing `/`.

Now copy the frontend application's **Domain**.

Return to the backend environment variables and replace the
temporary `FRONTEND_URL` value with:

``` env
FRONTEND_URL=https://YOUR-FRONTEND-DOMAIN
```

Again, do **not** include a trailing `/`.

#### Frontend build settings

Go to:

**Settings → Build Strategy → Update Build Strategy**

Set the build path to:

``` text
frontend
```

Then go to:

**Processes → ⋮ → Update Process**

Use:

``` bash
gunicorn --bind 0.0.0.0:8080 app:app
```

### 4. Automatic horizontal scaling

The frontend and backend can be scaled independently.

For each application:

**Processes → ⋮ → Update Process → Scaling → Horizontal Auto Scaling**

Choose the minimum and maximum instance count and the resource
threshold you want Sevalla to use.

### 5. Deploy

Deploy the backend first.

Once the backend is live, deploy the frontend.

Open the frontend domain — you'll land on the landing page. Register
a new user from there. You should now be able to log in, create
conversations, chat with the LLM through OpenRouter (with tool use
and RAG grounding if enabled), and see your spend on `/usage`.

### 6. Update the live application

With **Auto Deploy** enabled, push future changes to the GitHub
branch connected to Sevalla:

``` bash
git add .
git status
git commit -m "your update"
git push origin main
```

Sevalla will detect the GitHub change and redeploy the affected
application.

## Suggested next steps (in Cursor)

- Swap `_duckduckgo_search()`'s DuckDuckGo scrape for a paid search API
  (Tavily, Serper, Bing) once reliability matters — it backs both the
  lightweight `tool_web_search` tool and research mode's
  `run_research()`.
- Swap `tool_execute_python`'s subprocess sandbox for real isolation
  (E2B, Modal Sandboxes, or a network-less, resource-limited
  Docker/gVisor container) before opening it up to untrusted users.
- Add a UI for managing the RAG knowledge base (`/api/documents` has
  no page yet — it's API-only).
- Swap the keyword-search RAG for pgvector + embeddings if you need
  semantic matching.
- Move the in-memory rate limiter to Redis once you run more than one
  backend instance.
- Extend the interface i18n coverage: add
  `frontend/static/i18n/<lang>.json` files for German, Chinese,
  Russian, Portuguese, Japanese, Korean, Italian, and Dutch, and add
  `data-i18n*` attributes to the landing/login/register templates
  (currently only the chat page's chrome is localized, and only for
  English/French/Spanish).
- Move image attachments to object storage (S3/R2/etc) instead of
  storing base64 directly in `messages.attachments`, once you have
  more than demo-scale traffic.
- Add OCR (e.g. a hosted OCR API, or Tesseract) for scanned/image-only
  PDFs that have no extractable text layer — `extract_pdf_text()` in
  `backend/app.py` currently returns empty text for those.
- Let editing a message with image attachments keep/re-attach its
  images instead of dropping them (`edit_message` currently only
  accepts new text).
- Move generated files (`generated_files`) to object storage instead
  of raw Postgres bytes, same as the image-attachments follow-up
  above.
- Add canvas version history / undo instead of each generation
  overwriting the conversation's one `canvas_artifacts` row.
- Extend `render_markdown_to_pdf()` / `render_markdown_to_docx()` to
  cover tables, images, and nested lists (or swap in a proper
  Markdown->HTML parser + `xhtml2pdf` for fuller CommonMark coverage).
- Log server TTS spend to `usage_logs` once you confirm how OpenRouter
  reports per-call cost for `POST /api/v1/audio/speech` (it returns
  raw audio, not JSON with a `usage.cost` field like the
  transcription/image endpoints already logged via `log_direct_cost()`
  do) — see `synthesize_speech_bytes()`'s docstring in
  `backend/app.py`.
- Let `EASTA_TTS_VOICE` vary by reply language instead of one fixed
  voice for every language server TTS is used for (`SpeakRequest`
  already accepts a `language` field for this, unused so far).
- Wire up real billing (Stripe or similar) against the `users.plan`
  scaffolding: a webhook to flip `plan` on checkout/cancellation, and
  actual enforcement somewhere (e.g. `enforce_rate_limit()` or the
  research/generation tool gates in `backend/app.py`) once there's a
  real Free vs. Premium difference to enforce.
- Add email verification and a password-reset flow — registration and
  the new Account page both accept any email without confirming it's
  reachable.
- Embed the actual Fraunces/Inter font files in `create_document`'s
  PDF/DOCX/PPTX output for a closer visual match to the web app,
  instead of Helvetica/Calibri stand-ins (`render_structured_pdf()` /
  `render_structured_docx()` / `render_structured_pptx()` in
  `backend/app.py`).
- Add OCR-less image/chart support to `create_document`'s structured
  sections (currently text + tables only, no embedded images).
- Give API keys scopes/permissions (e.g. read-only vs. chat) instead
  of one all-or-nothing key per name — `api_keys` has no scope column
  yet.
- Add streaming, image attachments, and research mode to `POST
  /v1/chat` once there's real third-party demand for them — see "Not
  included in v1 (yet)" in `API.md`.
- Regenerate the PWA icons in `frontend/static/icons/` with the actual
  Fraunces font instead of the Georgia Bold stand-in used to produce
  them, for a pixel-perfect brand match (they were generated with
  Pillow from the same gradient/color values as `.brand-mark` in
  `styles.css` — the generation script itself isn't checked into the
  repo, just its PNG output).
- Actually build and sign an Android `.apk`/`.aab` via Bubblewrap or
  PWABuilder from `frontend/static/manifest.json` once you're ready
  for Play Store distribution (needs the Android SDK + a signing key,
  neither of which live in this repo).
- Move bulk transcription off FastAPI `BackgroundTasks` onto a real
  task queue (Celery/RQ + Redis, or a Sevalla background worker
  process) before relying on it for genuinely large batches — see the
  comment above `process_transcription_job()` in `backend/app.py` for
  exactly what that change needs to cover (cross-instance durability,
  a global concurrency cap).

## Tech stack

-   Python
-   Flask
-   FastAPI
-   PostgreSQL
-   OpenRouter
-   OpenAI Python SDK
-   NVIDIA Nemotron
-   GitHub
-   Sevalla

## License

MIT License
