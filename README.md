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
  (see `backend/database/schema.sql`) — fine for a demo/small-team app, but
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
  `EASTA_ENABLE_GENERATION`. The Markdown→PDF/DOCX renderers
  (`render_markdown_to_pdf()` / `render_markdown_to_docx()` in
  `backend/app.py`) were rewritten in Phase 15 and now cover tables,
  nested lists, and images — no longer the "limited subset" flagged
  here in earlier passes; see that entry below for what changed and
  what's still a known gap there (e.g. the `xhtml2pdf` vs. WeasyPrint
  tradeoff). ⚠️ **Still prototype-grade**: generated files are stored
  as raw bytes in Postgres, the same tradeoff as
  `messages.attachments` — swap for object storage before relying on
  this at real scale.
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
    the transcription/image endpoints do — so it's logged to
    `usage_logs` from a flat per-character estimate
    (`TTS_FALLBACK_COST_USD_PER_1K_CHARS`, OpenAI's tts-1 list price
    as a reference point) rather than a real returned cost like every
    other generation call in this app. Every paid call — chat, STT,
    TTS, image generation, and bulk transcription — now logs
    *something* to `usage_logs` rather than going uncounted; this one
    just isn't as precise as the rest. Swap to a provider/endpoint
    that reports real cost, or reconcile against your OpenRouter
    invoice, if you need exact TTS numbers.
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
  `users.plan` column (`backend/database/schema.sql`, `DEFAULT 'free'`) backs
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
    above the `api_keys` table in `backend/database/schema.sql`.
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
- **Design pass 2.0** — a polish/consistency pass across
  `frontend/static/styles.css`, not a new feature:
  - **Micro-interactions**: messages fade/slide in as they're added,
    the canvas panel and the composer's mobile "more options" popover
    animate open, the dark-mode toggle icon does a quick flip on
    switch, and icon/toggle buttons get a small press animation —
    all 150-300ms, all skippable design-token-driven CSS (`animation`/
    `transition`), no new JS dependencies.
  - **Dark-mode contrast**: code blocks (`.assistant-message pre` /
    `.canvas-body pre`) were nearly the same shade as the dark theme's
    assistant bubble/canvas surface and are now darkened for clear
    separation; the `/usage` model-breakdown bars got a subtle track
    border for the same reason.
  - **Status badges**: transcription jobs and their individual files
    used to all show the same neutral accent pill regardless of
    queued/processing/done/failed — now color-coded (`.status-badge`
    + `.status-queued/-processing/-done/-failed` in styles.css, wired
    up in `transcriptions.js`), including a new `--color-success-soft`
    token added alongside the existing `--color-danger-soft` /
    `--color-accent-soft` so "done" has a real background color
    instead of reusing an unrelated one.
  - **Token cleanup**: a few hardcoded `border-radius` values (5px/6px
    on inline code, the copy-code button, and attachment image
    thumbnails) were unified onto `var(--radius-sm)`, and two stray
    inline `style="..."` attributes (in `usage.html`, `login.html`,
    `register.html`) were replaced with proper classes
    (`.usage-footnote`, and a `.login-switch + .login-switch` rule for
    the stacked "back to home" line).
- **Responsiveness pass 2.0** — touch-interaction quality on top of
  Phase 12's breakpoint layout fixes, all in
  `frontend/static/styles.css`:
  - **Fixed a real touch bug**: `.message-actions` (edit/regenerate/
    copy under each message) only became visible on `:hover` — on a
    touchscreen, which has no hover state at all, this left them
    permanently invisible and undiscoverable, not just harder to
    reach. Now forced visible under `@media (hover: none)`.
  - **Fixed a real layout bug**: `.conversation-list` (the sidebar's
    scrollable chat history) was missing `min-height: 0`, the classic
    flexbox fix that lets a `flex: 1` + `overflow: auto` item actually
    shrink below its content height — without it, a long history on a
    short mobile viewport could push the sidebar footer (dark mode
    toggle, Account, Bulk transcription, Install app) off the bottom
    of the fixed-height drawer instead of scrolling internally.
  - **Touch target sizing**: a new `@media (pointer: coarse)` block
    (touch-primary devices only — desktop mouse/trackpad keeps the
    denser layout) gives every icon button, message action button, and
    close button a real ~44x44px hit area via `min-width`/
    `min-height`, per Apple HIG / Material / WCAG 2.5.5. A few buttons
    that relied on default text centering (`.sidebar-close`,
    `.canvas-close-button`, the attachment-chip remove button) also
    got explicit flex centering so the glyph doesn't drift toward one
    corner of the now-larger tap target.
  - **Canvas panel on mobile**: already became a full-screen sheet
    (not a squeezed side panel) at the ≤700px breakpoint added in
    Phase 12 — confirmed this is still correct, and bumped its z-index
    above the sidebar drawer's so it reliably wins if both are ever
    triggered at once.
  - **Composer crowding at 360-390px width**: confirmed by measuring
    the collapsed layout at that width — the ≤560px "more options"
    popover from Phase 12 already collapses attach/research/image-
    style/mic together, leaving only the more-button, textarea, and
    send button inline (~90px fixed width against ~310px of available
    composer width), which is comfortably uncrowded. No change needed.
  - ⚠️ **Not physically tested**: everything above was verified by
    reading rendered HTML/CSS and doing the layout arithmetic by hand
    (no real browser or touch device is available in this environment)
    — test on an actual phone, and with the OS "larger text"
    accessibility setting on, before treating this as fully verified.
    A code-level audit for OS text-scaling found no `overflow: hidden`
    region holding real text content (the few fixed-height regions
    that exist hold icons/images/charts, or already use
    `overflow: auto`) and no `user-scalable=no` / `maximum-scale`
    blocking zoom, but that's a review, not a device test.
- **Fixed document generation quality** — `generate_document`'s
  `render_markdown_to_pdf()` / `render_markdown_to_docx()`
  (`backend/app.py`) no longer hand-map Markdown tokens to reportlab
  Flowables / python-docx calls line-by-line. Both now share one real
  parse: `markdown_to_soup()` runs the model's Markdown through
  `mistune` (with the `table`/`strikethrough`/`task_lists`/`url`
  plugins) into an HTML tree once, and each renderer walks that same
  tree — so PDF and DOCX output can't silently drift apart the way two
  independent hand-rolled walkers eventually do, and tables, nested
  lists, and images are no longer dropped.
  - **PDF** now renders via `xhtml2pdf` (HTML+CSS → PDF, styled with
    the EASTA terracotta/Fraunces identity) instead of reportlab
    Flowables — real page margins, a title page for anything over
    ~2 pages (character-count heuristic —
    `MIN_CHARS_FOR_DOCUMENT_TITLE_PAGE`), a "Page X of Y" footer on
    every page, distinct H1/H2/H3 sizes/weights, and code blocks that
    wrap long lines instead of running off the page edge.
    ⚠️ **Chose `xhtml2pdf` over WeasyPrint**, which the original
    prototype-grade note suggested: WeasyPrint needs native
    Pango/cairo/GTK libraries that aren't guaranteed on every
    deployment target (confirmed — it fails to import with a
    missing-`libgobject` error on a plain `pip install` without the
    GTK3 runtime separately installed) — `xhtml2pdf` is pure Python,
    so it works the same way reportlab always did, at the cost of a
    less complete CSS implementation than a real browser engine (two
    gaps found and worked around during testing: it doesn't wrap a
    single 60+ character unbroken run at all — worked around by
    inserting a real break into any such run before rendering — and
    its native `<ul>` bullet marker didn't survive registering a
    custom `@font-face` body font, replaced with a literal, nesting-
    depth-aware bullet character instead). If your deployment target
    can guarantee the native libs (most Linux server images can, via
    `apt`), swapping the PDF half for WeasyPrint is a reasonable
    follow-up.
  - **DOCX** extends `python-docx` with real table support
    (`add_table`, header row shaded in the brand accent), multi-level
    nested lists (Word's built-in `List Bullet`/`List Bullet 2`/
    `List Bullet 3` and `List Number` styles, up to 3 levels), and
    inline images (`add_picture`, fetched from the image's URL with an
    8-second timeout and an 8&nbsp;MB cap — a fetch failure falls back
    to an `[image: alt text]` placeholder paragraph rather than
    failing the whole document).
  - **Fonts**: actual Inter/Fraunces weights (the same families
    `frontend/static/styles.css` uses) are bundled as static `.ttf`
    files in `backend/assets/fonts/` and embedded via `@font-face` —
    reportlab/xhtml2pdf can't reach Google Fonts at render time the
    way a browser's `@import` can. OFL license files for both
    (`OFL-Inter.txt`, `OFL-Fraunces.txt`) are included alongside them.
  - **Verified with a real test document** exercising every gap this
    phase closed (H1-H3, bold/italic/inline code, a nested bullet
    list, a nested numbered list, a table, a fenced code block, a
    blockquote, a working image, and a broken-image-URL fallback) —
    checked structurally (page count, embedded/subsetted font names,
    extracted text, table cell contents, run-level bold/italic flags,
    embedded image byte-for-byte size match) since no PDF/DOCX viewer
    is available in this environment to confirm the visual layout by
    eye; do that before treating this as fully done.
  - `render_structured_pdf()` / `render_structured_docx()` /
    `render_structured_pptx()` (the separate `create_document` tool,
    a structured-JSON-sections content model rather than raw
    Markdown) are untouched by this phase and still render via
    reportlab / `_markdown_inline_to_reportlab()` /
    `_add_markdown_runs()` directly — deliberately a different tool,
    not consolidated into the above.
- **Google Sign-In** — standard OAuth 2.0 Authorization Code flow,
  application code (not a Sevalla platform feature — see
  `GET /api/auth/google/login` / `GET /api/auth/google/callback` in
  `backend/app.py`):
  - **Schema**: `users.google_id` (nullable, unique) and
    `users.auth_provider` (`'password'` | `'google'`, default
    `'password'`) added; `users.password_hash` is now nullable, since
    a Google-only account has none.
  - **Login**: `GET /api/auth/google/login` redirects to Google's
    consent screen with a random per-attempt `state` token stashed in
    the session (CSRF protection for the flow); `GET
    /api/auth/google/callback` checks that `state` matches, exchanges
    the returned `code` for a token, fetches the profile from Google's
    `userinfo` endpoint, and sets the session cookie exactly like
    `POST /api/login` does — then redirects the browser (a real
    redirect, not JSON, since this is a full-page OAuth round trip) to
    `{FRONTEND_URL}/chat` on success or `{FRONTEND_URL}/login?error=...`
    on failure (`login.js` reads that query param into the existing
    error element).
  - **Find-or-create**: matches an existing account by `google_id`
    first; if none, and Google reports the email as verified, links
    the Google account to an existing password account with that email
    (`link_google_id()`) rather than erroring or creating a duplicate;
    otherwise creates a new Google-only account with a username
    auto-generated from the Google profile name (`generate_unique_username()`,
    collision-safe — appends `_1`, `_2`, ... if taken).
  - **Frontend**: a "Continue with Google" link on `login.html` /
    `register.html` — a plain `<a href="{{ backend_url }}/api/auth/google/login">`,
    not a `fetch()` call, since OAuth needs the actual browser to
    navigate to Google. Hidden by default and only revealed once
    `GET /api/features` reports `google_signin: true` — same
    hide-rather-than-show-broken pattern as the mic button / Research
    toggle, so the button doesn't appear (and 503) before
    `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are actually set.
  - **New env vars**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
    `GOOGLE_REDIRECT_URI` (see `backend/.env.example`) — all optional;
    unset just keeps the feature hidden rather than failing startup.
  - Fixed two related null-`password_hash` crashes surfaced by making
    that column nullable: `POST /api/login` and
    `PUT /api/account/password` both called `check_password_hash()`
    unconditionally, which raises on `None` — a Google-only account
    hitting either now gets a clean 401/400 instead of a 500.
  - ⚠️ **Not tested against real Google credentials** (none are
    configured in this environment) — the full callback logic (state
    verification, token exchange, profile fetch, find/link/create) was
    exercised with `unittest.mock` standing in for Google's token and
    userinfo endpoints, covering: a brand-new user, an existing
    password account linked by verified email, a returning Google
    user, an unverified-email profile (confirmed it creates a new
    account rather than auto-linking), and username collisions. Test
    against a real Google Cloud Console OAuth client before relying on
    this in production.
- **PWA installability audit** — the manifest/service worker/icons
  from the "Installable app (PWA)" entry above already existed; this
  phase audited them against Lighthouse's actual PWA installability
  criteria (no deployed instance or browser available in this
  environment to run Lighthouse itself, so this was a checklist-by-
  checklist code review instead) and fixed the one real gap found:
  - **Fixed**: the service worker's `fetch` handler only ever
    intercepted requests under `/static/` — a page navigation (loading
    `/chat`, `/login`, `/`, ...) was never handled at all, so it fell
    straight through to the browser's own offline error page on a
    flaky connection instead of anything EASTA controls. This is
    specifically what Lighthouse's "current page responds with a 200
    when offline" check looks for. Fixed with a standard
    network-falling-back-to-a-cached-offline-page pattern: navigation
    requests (`event.request.mode === "navigate"`) now try the network
    first and fall back to a new `/offline` page
    (`frontend/templates/offline.html`, cached during service worker
    install) on failure — see `frontend/static/sw.js`. Cache bumped to
    `easta-shell-v3` so existing installs pick up the new fetch
    handler and cached offline page.
  - **Confirmed already correct** (no change needed): `manifest.json`
    has `name`/`short_name`/`start_url`/`display: standalone`/
    `theme_color`/`background_color` matching the brand exactly, and
    192×192 + 512×512 icons (plus a maskable variant — verified its
    logo sits well inside Google's 80% safe-zone circle, ~28% of the
    canvas, so it won't get clipped by Android's mask shapes); the
    service worker registers at the root scope so it controls
    `start_url` (`/chat`); every page includes both `_pwa_head.html`
    (manifest link + `theme-color` meta + apple-touch-icon) and
    `pwa.js` (service worker registration), not just the chat page.
  - ⚠️ **Not run against a real Lighthouse audit** — there's no
    deployed instance or Chrome available in this environment. Run
    Chrome DevTools → Lighthouse → PWA against the actual deployed URL
    before treating this as the final word; HTTPS (required for
    service workers and for Lighthouse's installability check, and not
    something this checklist could verify either) should already be
    covered by Sevalla's default TLS, but confirm it.
  - No paid API calls in this phase (manifest/service-worker/template
    work only) — nothing new to log to `usage_logs`.
- **Fixed: document/image generation tools never reached the model for
  short requests** — a real, observed correctness bug, not a polish
  item: asking "Generate the pdf containing this" got a generic "I
  can't generate actual files" refusal (with the model dumping raw
  Markdown and suggesting Smallpdf/Google Docs/Word) even though
  `generate_document`/`create_document`/`generate_image` were sitting
  right there in `ENABLE_GENERATION`'s tool list. Root cause, found by
  following the request through `backend/app.py`: `pick_model()`'s
  complexity heuristic didn't recognize "generate the pdf..." as
  needing the smarter model (too short, no matching keyword), so it
  routed to `EASTA_FAST_MODEL` — which is deliberately **not** in
  `TOOL_CAPABLE_MODELS` (kept tool-less for cost/latency, see that
  set's own comment) and therefore got no tools at all, not just no
  document tool. The fast model's own base-training refusal is what
  the user saw; `EASTA_SMART_MODEL` (which does have the tool) was
  never even tried, since the fast model's reply counted as a
  successful turn, not an error to fall back from.
  - **Fix 1**: a new `_GENERATION_KEYWORDS` list in `pick_model()`
    (separate from `_COMPLEXITY_KEYWORDS`, since this is a correctness
    requirement, not a complexity judgment call) forces any message
    containing a generation verb (generate/create/make/turn X into/
    convert, plus French/Spanish/German/Chinese/Russian/Portuguese/
    Japanese/Korean/Italian/Dutch equivalents) or a file-type noun
    (pdf/docx/pptx/word doc/presentation/slides/image/picture/...) onto
    `EASTA_SMART_MODEL`, regardless of message length. Also fixes the
    identical bug for `generate_image` (e.g. "create an image of a
    sunset" was silently broken the same way and wasn't even the
    reported case — found while tracing the same code path).
  - **Fix 2**: a new `build_generation_capability_message()` system
    message (only added when `ENABLE_GENERATION` is on — never claims
    a capability that isn't actually there) explicitly tells the model
    it has real file/image generation tools, to use them immediately
    on create/generate/turn-into requests, that a reference to
    existing content ("generate a PDF of that") means content already
    in the conversation rather than something to ask the user to
    re-paste, and explicitly **not** to claim it can't generate files
    — directly countering the generic refusal text observed, which was
    a tell that the model was reciting trained-in disclaimer habits
    instead of checking its actual tools for this turn.
  - Conversation history (needed for "generate a PDF of **that**" to
    resolve what "that" means) was already included via
    `build_llm_context()`'s normal recent-message window — confirmed
    working, no change needed there.
  - **Verified**: `pick_model()` now routes all of "Generate the pdf
    containing this" (the exact reported phrasing), "turn that into a
    Word doc", "make that into slides", "create an image of a sunset",
    and French/Spanish/Chinese/Russian equivalents onto
    `EASTA_SMART_MODEL`, confirmed as a member of `TOOL_CAPABLE_MODELS`
    so `stream_with_tools()` actually attaches `tools=tools_for_model()`
    to the request; confirmed genuinely simple messages ("hi there",
    "what time is it") still route to the fast model, so the
    cost-optimization isn't lost. ⚠️ **Not tested against a real
    model**: no OpenRouter key is available in this environment, so
    this confirms the routing/tool-availability plumbing is now
    correct, not that a live model reliably calls the tool when
    offered it — reproduce the exact repro steps (ask for a PDF, then
    a Word doc, then slides, each in a fresh conversation with a
    moderately long formatted prior reply) against the deployed app
    before closing this out.
- **Rename and delete conversations** — hover a conversation in the
  sidebar to reveal small ✏️/🗑️ buttons next to it (always visible,
  not hover-gated, on touch devices — same pattern as the message
  action buttons).
  - **Rename**: turns the label into an inline text input in place,
    pre-filled with the current title (capped at 100 characters, same
    as the existing auto-title-from-first-message logic) — saves on
    Enter or on blur, discards on Escape.
  - **Delete**: a lightweight inline confirm row (message + Delete/
    Cancel buttons) replaces the conversation row in place, not a
    browser `confirm()` popup. Deleting the currently-open conversation
    redirects to the next most recent one, or creates a fresh "New
    Chat" if none remain — never leaves the chat view pointed at a
    conversation that no longer exists.
  - **Backend**: `PATCH /api/conversations/{id}` and
    `DELETE /api/conversations/{id}`, both scoped to the authenticated
    user's own conversations (404 otherwise, same pattern as the
    existing conversation endpoints) — see `update_conversation_title()`
    / `delete_conversation()` in `backend/app.py`.
  - Confirmed `messages`/`generated_files`/`canvas_artifacts` all
    already have `ON DELETE CASCADE` on their `conversation_id` foreign
    key, and `usage_logs` has `ON DELETE SET NULL` (kept for historical
    cost accounting rather than deleted) — no manual cleanup code
    needed on delete.
  - New UI strings added to all three shipped interface languages
    (`frontend/static/i18n/{en,fr,es}.json`), matching the existing
    interface-localization coverage.
- **Real brand logo** — the placeholder "E" square (`.brand-mark`) is
  replaced everywhere it appeared (landing/login/register/offline nav,
  chat sidebar header + empty-chat state, usage/account/transcriptions
  headers) with the real logo, provided as a full horizontal lockup at
  `frontend/static/icons/Eastaai-logo.png`. Small placements use a
  cropped, background-removed `icon-square.png` (just the circular
  "EA" icon mark, derived from the lockup and committed alongside it)
  rather than squeezing the full wide lockup — with its wordmark and
  tagline — into a 40px slot where the text would be illegible. The
  full lockup isn't used anywhere yet; there's no existing large-format
  slot for it (the landing page has no hero-level logo placement, only
  the same small nav-bar one every other page has), and adding one
  wasn't asked for. `--color-accent` (the terracotta used everywhere
  else in the UI) is unchanged — the logo's own brown/copper tones are
  self-contained to the image itself, not reflowed into the design
  system. Also added to the service worker's cached shell assets so
  `offline.html` still shows the logo while genuinely offline. The
  separate PWA manifest icon set (favicons, `apple-touch-icon.png`,
  `icon-192.png`/`icon-512.png`/`icon-512-maskable.png`) was out of
  scope for this pass and still showed the old generated "E" —
  addressed in the next entry below.
- **Favicon and PWA icons regenerated from the real logo** — every
  icon a browser/OS expects now comes from the same high-resolution
  crop as `.brand-mark` above, not the old programmatically-generated
  "E":
  - `favicon.ico` (new, multi-resolution 16×16/32×32/48×48) — linked
    from every page's `<head>` via `_pwa_head.html`, alongside the
    existing PNG favicon links (`favicon-16.png`/`favicon-32.png`,
    also regenerated) for browsers that prefer PNG over ICO.
  - `apple-touch-icon.png` (180×180) regenerated with an opaque cream
    background (`--color-bg` `#F6F1E8`) rather than transparent, per
    Apple's guidance that touch icons shouldn't have alpha.
  - `manifest.json`'s icon entries needed no changes — `icon-192.png`,
    `icon-512.png`, and `icon-512-maskable.png` are regenerated in
    place at the same paths the manifest already pointed to, so an
    installed app's home-screen icon becomes the real logo
    automatically. `icon-512-maskable.png` specifically got a fresh
    treatment (not just a resize of the "any"-purpose icon): the logo
    composited onto the app's terracotta gradient at roughly 62% of
    the canvas, keeping it inside Android's 80% maskable safe zone —
    verified by measuring the actual rendered content's max radius
    from center (170px) against the safe-zone radius (205px) rather
    than assuming the padding was enough.
  - Bumped the service worker's cache to `easta-shell-v5` — a version
    bump for *content* changing at the same cached URLs
    (`icon-192.png`/`icon-512.png`), not just `SHELL_ASSETS`'s list
    changing, so an already-installed PWA actually picks up the new
    icon bytes instead of keeping the old ones cached indefinitely
    under the previous cache name.
  - **Fixed the standing `/favicon.ico` 404**: browsers request
    `/favicon.ico` automatically on every page load regardless of any
    `<link rel="icon">` tag — nothing served that path before, so it
    404'd in the console even though the favicon shown to the user
    (via the PNG `<link>` tags) worked fine. Added
    `GET /favicon.ico` in `frontend/app.py` (same root-scope pattern
    as the existing `GET /sw.js`) serving the new `.ico` file directly
    at the root path. Verified this is the real fix, not just a
    silenced symptom: curled `/favicon.ico` directly (the exact
    request a browser fires automatically) and confirmed
    `200 image/x-icon`, byte-identical to the explicit
    `/static/icons/favicon.ico` the `<link>` tag points to.
- **Search across conversations (Phase 18)** — `GET
  /api/conversations/search?q=...` searches both conversation titles
  and message content, scoped to the current user, via Postgres
  full-text search (`to_tsvector`/`websearch_to_tsquery`/`ts_rank_cd`)
  the same way `documents`/RAG grounding already does — not a `LIKE`
  scan. New `messages.search_vector` column (`tsvector`) + GIN index,
  populated at insert time in `save_message()`; backfilled for
  pre-existing rows in `backend/database/schema.sql`. One result per
  conversation (its single best-ranked match, title or message),
  ranked and deduplicated in SQL via a `DISTINCT ON` over a `UNION ALL`
  of title/message matches. The matched snippet is highlighted with
  `ts_headline()` — but rather than trust its raw `<b>`/`</b>` output
  directly into the page (which wouldn't escape a user's own message
  content containing literal `<`/`>`/`&`), `search_conversations()` in
  `backend/app.py` uses control-character delimiters, `html.escape()`s
  the *whole* snippet first, and only then swaps those delimiters for
  real `<mark>` tags — verified this actually neutralizes a `<script>`
  in test content while still highlighting a real match. A search box
  above the sidebar's conversation list (debounced, 300ms) swaps the
  list for results; clearing it restores the normal view.
- **Pinning and folders (Phase 19)** — new `conversations.pinned`
  (boolean) and `conversations.folder` (free-text, nullable — no
  folder-management UI to justify a real `folders` table) columns.
  `PATCH /api/conversations/{id}` (previously rename-only) now accepts
  `title`/`pinned`/`folder` independently, only touching whichever
  fields a request actually includes (Pydantic `exclude_unset=True` →
  a small column whitelist, never trusting request keys as literal SQL
  identifiers) — so a pin toggle doesn't need to resend the title, etc.
  The sidebar's per-conversation actions consolidated from two loose
  icon buttons (rename/delete) into a single "..." menu (Pin/Rename/
  Move to folder/Delete), since four crammed hover-reveal icons in a
  ~280px row stops being "small" — folder assignment reuses the same
  inline-input pattern as rename (save on Enter/blur, cancel on
  Escape; a blank name clears the folder). Conversations render as a
  **Pinned** section first, then each folder as a collapsible
  `<details>`/`<summary>` section (native keyboard support, no custom
  JS needed for expand/collapse), then unfiled conversations
  chronologically — a conversation that's both pinned and foldered
  shows only under Pinned, not duplicated.
  - Fixed two bugs surfaced while extending `conversations` rows to
    carry the new columns: `build_llm_context()` and
    `maybe_summarize_conversation()` both destructured the row with a
    fixed 5-value unpack (`_id, _title, _created_at, summary,
    summarized_through = conversation_row`), which would have raised
    "too many values to unpack" the moment `get_conversation()`
    started returning `pinned`/`folder` too — caught before it could
    ship, fixed with a trailing `*_rest`.
  - Also fixed a real (if narrow) existing CSS bug while building the
    new menu's open animation: `@keyframes popover-in` was defined
    *inside* the composer's `@media (max-width: 560px)` block, making
    it silently unusable by anything outside that breakpoint — moved
    to the top level so both the composer's mobile popover and the
    new conversation menu can use it regardless of viewport width.
- **Shareable read-only conversation links (Phase 20)** — a real
  privacy surface, treated deliberately: sharing is opt-in per
  conversation (`conversations.share_token` is `NULL` by default and
  only ever set by an explicit "Share" click), instantly revocable
  (unsharing or re-sharing just changes what's in that one column, so
  an old link stops matching anything immediately), and the public
  view can't leak anything about the account that created it.
  - `POST /api/conversations/{id}/share` generates a
    `secrets.token_urlsafe(32)` token (256 bits — the actual
    protection here, not obscurity) and returns the link;
    `POST /api/conversations/{id}/unshare` clears it. Both ownership-
    scoped like every other conversation endpoint. Re-sharing an
    already-shared conversation rotates the token, which *is* how
    "regenerating invalidates old links" works — no separate code path
    needed.
  - `GET /api/shared/{token}` is deliberately unauthenticated (no
    `require_user()` — this is the page a stranger with just the link
    reaches) and its DB lookup (`get_conversation_by_share_token()`)
    selects *only* `id`/`title`, never `user_id`/email/username/other
    conversations, so there's nothing to accidentally leak even by a
    future careless edit to that one query.
  - Token stored as **plaintext**, not hashed like `api_keys.key_hash`
    — a deliberate, different tradeoff from that column, explained in
    `backend/database/schema.sql`: a share link is meant to be re-shown/re-
    copied later (reopening the Share menu item), not a write-once
    secret, and it only grants read-only access to one conversation,
    not account access.
  - Sidebar: the conversation menu's "Share" item (added in the same
    Phase 19 menu, before Delete) creates the link, copies it
    (`navigator.clipboard`), and swaps its own label to "Link copied!"
    for a second — already-shared conversations show "Copy share
    link" instead (re-copying the existing link without rotating it)
    plus a separate "Stop sharing" item.
  - Public read-only page at `/shared/{token}`
    (`frontend/templates/shared.html` + `frontend/static/shared.js`,
    a new ~130-line standalone file, not a repurposed `chat.js` — no
    session cookie sent, no sidebar, no composer): fetches the one
    unauthenticated endpoint and renders title + messages (Markdown
    rendered the same way as the real chat UI, plus any image
    attachments) or a clear "invalid or no longer shared" state for a
    revoked/bad token.
  - Verified end-to-end via `TestClient`: ownership-scoping (404 for
    non-owned), the public endpoint requiring no auth, an invalid
    token 404ing, and — explicitly asserted, not just eyeballed — that
    a valid share response's top-level JSON keys are exactly
    `{title, messages}` and nothing else.
- **Cross-conversation memory (Phase 21)** — new `user_memory` table:
  short, durable facts about a user (id, user_id, content,
  source_conversation_id, created_at), distinct from any single
  conversation's own history. Deliberately much more conservative than
  the existing conversation-summarization feature it sits next to in
  `backend/app.py`:
  - A cheap keyword pre-filter (`_message_might_contain_durable_fact()`
    — "i am", "my name", "i prefer", "remember that", etc.) decides
    whether a user's message is even worth checking, so the extraction
    LLM call fires only on messages that plausibly contain a personal
    fact, not every single turn — a real cost-control measure, not
    just a latency one.
  - Only messages that pass the pre-filter go to `FAST_MODEL` (a
    simple classification task, not worth the smart model) with a
    prompt that explicitly disallows inferring/guessing anything not
    directly stated, and returns the literal word `NONE` — expected to
    be the common outcome — when there's nothing durable to keep.
  - Stored facts are injected into `build_llm_context()` (which now
    takes a `user_id` parameter to do this) as their own clearly-
    labeled system message, capped at the 20 most recent
    (`MAX_MEMORY_ITEMS_IN_CONTEXT`), explicitly told to the model as
    "stated previously, not verified fact."
  - Full user visibility and control on `/account`'s new "Remembered"
    panel: list everything stored, delete an individual item, or clear
    all — `GET`/`DELETE /api/account/memory` and
    `DELETE /api/account/memory/{id}`.
  - Verified with mocked LLM responses: a real extracted fact gets
    saved with the right args; a `NONE` response saves nothing; a
    message that doesn't pass the keyword pre-filter never calls the
    LLM at all; the feature flag (`EASTA_ENABLE_MEMORY`) off skips it
    entirely; an LLM call failure is caught and logged rather than
    breaking the turn. Also confirmed the memory system message is
    correctly present in `build_llm_context()`'s output when stored
    items exist, and correctly absent (no crash) when no `user_id` is
    passed at all.
  - Fixed a real bug caught while adding the `user_id` parameter to
    `build_llm_context()`: both existing call sites passed every
    argument *positionally*, so inserting a new parameter in the
    middle of the signature would have silently shifted
    `language_message` into the new `user_id` slot and so on down the
    line — every call site rewritten to use keyword arguments instead,
    which is what should have been used there from the start.
- **Shared team workspaces (Phase 22)** — new `organizations` /
  `organization_members` tables, and `documents` extended so a row
  belongs to either a `user_id` *or* an `org_id` (nullable pair, a
  `documents_owner_check` CHECK constraint enforces exactly one is
  set) — existing personal documents keep working completely
  unchanged.
  - **Explicit, documented privacy decision**: belonging to the same
    organization does **not** give members visibility into each
    other's individual conversations. `conversations` stays scoped to
    `conversations.user_id` exactly as before this phase — nothing
    about conversations changed. Organizations only ever share two
    things: the documents (RAG knowledge base) below, and the
    combined cost dashboard for owners. This is the safer default
    most team tools ship (see the comment block above `organizations`
    in `backend/database/schema.sql`), and no reason to deviate was found.
  - Org creation is instant (`POST /api/organizations` creates the
    org and adds its creator as `owner` in one transaction — an org
    can never exist with zero members). Joining is via a shareable
    invite link (`secrets.token_urlsafe(32)`, plaintext in
    `organizations.invite_token` — same "meant to be re-shown/
    re-copied, and only grants limited scoped access" tradeoff as
    conversation share tokens, not an API-key-style hashed secret),
    landing on a new `/join/<token>` page that requires an explicit
    button click before calling `POST
    /api/organizations/join/{invite_token}` — deliberately not
    auto-joining on page load, since a GET request (including one a
    link-preview bot might prefetch) should never have a side effect.
  - Ownership/membership is enforced with two small helpers used
    throughout: `require_org_member()` (404, not 403, for a
    non-member — avoids leaking whether an org id even exists to
    someone outside it) and `require_org_owner()` (403, for a member
    who isn't an owner). The "don't strand an org without an owner"
    guard (`count_organization_owners()`) blocks both removing the
    last owner and the last owner leaving.
  - RAG retrieval (`retrieve_relevant_chunks()`) now searches both the
    caller's personal documents and every org they belong to's shared
    ones in one query, so answers get grounded in shared team
    knowledge automatically — no per-turn "which knowledge base"
    choice needed in chat itself.
  - A user signing in via the invite flow when not already logged in
    is bounced through `/login` (or `/register`) and back via a new
    same-site-only `?next=` param (`_safe_next_path()` in both
    `frontend/app.py` and `backend/app.py` — rejects anything not
    starting with `/`, and rejects `//host`-style protocol-relative
    values too, so this can never become an open redirect), including
    through the Google Sign-In round trip (`oauth_next` carried in the
    session across the whole redirect-to-Google-and-back flow).
  - Frontend: a new "Organizations" panel on `/account` (create an
    org, see/copy/regenerate its invite link, view members, remove a
    member, leave), a new **Knowledge base** page at `/documents`
    (also linked from the chat sidebar) with a Personal/org switcher
    for adding and deleting documents — the first UI EASTA has ever
    had for `POST /api/documents` at all, personal RAG documents were
    API-only before this phase — and a new **Organization spend**
    panel on `/usage` (owner-only, hidden entirely if the signed-in
    user doesn't own any org) showing total spend/calls plus a
    per-member breakdown (`LEFT JOIN` so a zero-usage member still
    shows a 0/0 row instead of being silently absent).
  - Verified via `TestClient` with DB calls mocked: all 10
    `/api/organizations/*` routes register with no path collision
    between the literal `/join/{token}` segment and sibling
    `{org_id}`-based routes; non-member/non-owner 404/403 gating;
    last-owner removal and last-owner leave are both blocked;
    joining an org twice is a no-op (`ON CONFLICT DO NOTHING`), not an
    error; the full Google OAuth `next` round trip (login with
    `?next=/join/<token>` → session → callback) lands back on the
    invite page instead of the default `/chat`; and an unsafe `next`
    value (`https://evil.example`, `//evil.example`,
    `javascript:alert(1)`) is stripped to empty rather than honored,
    on both the frontend and backend validators. All new/changed
    templates render via a local Flask dev server and every changed
    `.py`/`.js` file passes `py_compile`/`node -c`.
    ⚠️ **Not verified**: real browser rendering/interaction (org
    cards, the documents page, the join flow) — only server-rendered
    HTML and API behavior were checked, not actual JS execution in a
    browser. No real Postgres migration was run either (see the
    schema.sql migration note earlier in this file); apply
    `backend/database/schema.sql`'s new `ALTER TABLE`/`CREATE TABLE`
    statements by hand against any existing database.
- **Admin view (Phase 23)** — a new `users.is_admin` boolean (default
  `false`). Deliberately no API route ever sets it — there's no self-
  service or promote/demote endpoint anywhere in the app, on purpose,
  to avoid any path to privilege escalation. Grant it by hand:
  `UPDATE users SET is_admin = true WHERE username = '...';` (see the
  comment above the column in `backend/database/schema.sql`).
  - `require_admin()` in `backend/app.py` gates two new endpoints with
    a plain 403 (not org-membership's existence-hiding 404 — there's
    nothing to hide here, every user already knows `/api/admin/*`
    exists): `GET /api/admin/stats` (platform-wide totals — users,
    organizations, conversations, messages, documents, total spend/
    calls, and signups for the last 30 days) and `GET /api/admin/users`
    (every user on the instance with plan, admin status, conversation
    count, and total spend, via the same `LEFT JOIN`-so-zero-usage-
    still-shows-up pattern as the Phase 22 org cost breakdown).
  - `is_admin` now rides along on `GET /api/session` and
    `GET /api/account` — session's copy is a fresh per-request DB
    lookup (not cached in the signed session cookie), so granting or
    revoking admin by hand takes effect on that user's very next page
    load rather than only after they log out and back in.
  - Frontend: a new `/admin` page (`admin.html` + `admin.js`, styled
    entirely from existing `.usage-panel`/`.stat-grid`/`.usage-table`
    classes — no new CSS needed) with the same stat-grid + Chart.js
    layout as the personal/org cost dashboards, plus a full user
    table. A **🛡️ Admin** sidebar link appears only once `chat.js`'s
    session check confirms `is_admin` — the same hide-rather-than-
    show-broken pattern already used for the Google sign-in button and
    the mic button. The page itself has no server-side gate (the
    frontend process has no DB/session access of its own to check
    against, same as every other page here) — it calls
    `GET /api/admin/stats` immediately and shows a plain "not
    authorized" panel on a 403 rather than rendering the dashboard.
  - A real bug caught while wiring this up: `get_user_by_id()`'s
    return tuple gained a 7th field (`is_admin`), and two existing call
    sites destructured it positionally with exactly 6 names each
    (`GET /api/account`, `GET /v1/me`) — both would have raised "too
    many values to unpack" on the very next request. Fixed by adding
    the new field at the *end* of the tuple (not inserted in the
    middle, unlike the earlier `user_id` lesson from Phase 21) and
    updating both unpacks explicitly; the two call sites that already
    used index access (`user[3]`, `user[5]`) needed no change since
    their indices didn't shift.
  - Verified via `TestClient` with the DB mocked: a non-admin gets 403
    from both admin routes; an admin gets correctly-shaped stats and
    user-list responses; `GET /api/session` reflects `is_admin: true`/
    `false` correctly for the same logged-in session depending on what
    `is_user_admin()` returns (a live check, not a stale cached value);
    and `GET /api/account` now includes `is_admin`. `/admin` and
    `/chat` both render via a local Flask dev server, and every
    changed `.py`/`.js` file passes `py_compile`/`node -c`.
    ⚠️ **Not verified**: real browser rendering/interaction, and no
    real Postgres migration was run (same caveat as every phase above
    — apply the new `ALTER TABLE` by hand against any existing
    database).
- **Offline composing (Phase 24)** — a message sent while offline (or
  while a connection drops mid-send) is queued to IndexedDB instead of
  just failing, and sent automatically once the connection is back.
  Purely client-side; no backend or schema change was needed since it
  replays the exact same `POST /api/conversations/{id}/messages` body
  the app always sent.
  - New `frontend/static/offline-queue.js`: a small hand-rolled
    IndexedDB wrapper (one object store, one shape — not worth a
    library dependency for) with `addQueuedMessage()`/
    `getQueuedMessages()`/`removeQueuedMessage()`.
  - In `chat.js`, the send handler checks `navigator.onLine` up front
    (skips the doomed network attempt entirely when already known
    offline) and `streamAssistantReply()` now also catches a
    network-level failure mid-send and queues instead of showing a
    hard error — distinguished from a real backend error by `fetch()`
    only ever rejecting with a `TypeError` for a genuine network
    failure (offline/DNS/connection reset); an HTTP 4xx/5xx instead
    resolves normally and becomes a regular `Error` further down the
    same code path, so a real server error still shows as an error
    rather than silently queuing forever.
  - A queued message shows immediately as a normal message bubble with
    a "⏳ Queued — will send once you're back online" badge, and an
    "⚡ You're offline" banner appears above the composer for as long
    as `navigator.onLine` is false. Both persist correctly across a
    page reload (`loadAndRenderQueuedMessages()` re-renders anything
    still queued for the open conversation from IndexedDB alongside
    the server's real history) — a queued message is never silently
    dropped just because the tab was closed before reconnecting.
  - Flushing (`flushOfflineQueue()`) runs on the browser's `online`
    event, right after opening/loading a conversation, and stops
    immediately if `navigator.onLine` flips back to false mid-flush —
    everything from that point on stays safely in IndexedDB rather
    than being lost or retried in a tight loop. A queued item is only
    ever removed from IndexedDB *after* its resend actually succeeds
    (not before), so an interrupted flush can't lose a message.
  - ⚠️ **Scoped limitation, by design**: this covers composing on an
    already-open `/chat` tab that then loses connectivity — it does
    **not** make a fresh page load work offline. `frontend/static/sw.js`
    deliberately never caches `/chat` itself (its own header comment:
    "chat data must always come from the network, never a stale
    cache"), since the page is rendered per-request server-side and
    isn't safe to serve stale from a shared cache; reloading `/chat`
    while genuinely offline still falls through to the existing
    `/offline` fallback page from Phase 17, not a working composer.
  - Verified with real IndexedDB behavior (not just a syntax check):
    `fake-indexeddb` running `offline-queue.js` unmodified under
    Node confirmed insertion-order preservation, correct
    per-conversation filtering, a correct add → get → remove round
    trip, a removal of a non-existent id not throwing, and a clean
    rejected promise (not a crash) when `indexedDB` itself is
    unavailable. `node -c` passes on both changed/new JS files, the
    Jinja template parses, and `/chat` renders via a local Flask dev
    server with `offline-queue.js` correctly included before
    `chat.js` and the offline banner markup present.
    ⚠️ **Not verified**: the actual browser `online`/`offline` events
    and a real flaky-connection `fetch()` `TypeError` were not
    exercised in a real browser (no headless browser available in
    this environment) — only the IndexedDB layer and the page
    rendering were checked directly.
- **Graceful degradation on slow connections (Phase 25)** — an audit-
  then-fix pass, purely client-side (no backend/schema change). The
  audit found two real gaps: nothing anywhere in the app ever timed
  out a request (a genuinely hung — not offline, not erroring, just
  never-resolving — connection left whatever button triggered it
  disabled forever with no recourse but a reload), and the chat
  sidebar's conversation list rendered as a bare blank space for
  however long `GET /api/conversations` took, with the only visible
  "loading" hint being a single static "Checking your session..."
  line in the header — reading as frozen/broken rather than loading
  on a slow connection.
  - Every page's `apiRequest()` (`account.js`, `admin.js`,
    `documents.js`, `transcriptions.js`, `usage.js`) plus the raw
    `fetch()` calls in `login.js`/`register.js`/`join.js`/`shared.js`
    now wrap the request in an `AbortController` with a bounded
    timeout, turning a bare `AbortError` into a clear "Request timed
    out — check your connection and try again." message that surfaces
    through each page's existing `catch (error) { ...textContent =
    error.message }` — no call site needed to change to benefit.
    `chat.js`'s `apiRequest()` is the one deliberate exception: it
    also carries the message-send/edit/regenerate streaming requests
    (which can legitimately run long — research mode reading several
    pages, a long generation — and must never be aborted just for
    taking a while), so its timeout is opt-in per call rather than a
    blanket default. Only the genuinely-quick calls that run during
    initial page load (`loadSession()`, `loadConversations()`,
    `loadMessages()`, all 15s) opt in — exactly the ones responsible
    for "everything looks stuck" on a bad connection.
  - The bulk-audio-upload call in `transcriptions.js` gets its own
    much longer timeout (5 minutes, via a named `UPLOAD_TIMEOUT_MS`
    rather than the 20s default) — a large file legitimately takes a
    while on a slow connection, and the point of this phase is
    tolerating that gracefully, not aborting it.
  - `login.js`/`register.js`/`join.js` submit buttons now show a
    loading label ("Logging in…"/"Creating account…"/"Joining…")
    while their request is in flight — they already disabled the
    button, but with no visible text change it read as unresponsive
    rather than working, unlike every other form in the app (Save/
    Generate/Create buttons elsewhere already did this).
  - New `renderConversationSkeleton()` in `chat.js`: five shimmering
    placeholder rows shown in `#conversation-list` the instant
    `bootstrap()` starts, before `loadSession()`/`loadConversations()`
    even return — `renderConversations()` already clears the list's
    contents before drawing real rows, so the skeleton is naturally
    replaced with no extra "clear" call needed on the success path;
    `showPageError()` now also explicitly clears it on the failure
    path (e.g. a `loadSession()` timeout) so it can't shimmer forever
    if page load fails outright.
  - Verified: the exact `AbortController` + timeout-wrapper logic
    (not just syntax) was exercised against a simulated never-resolving
    `fetch()` under Node — confirmed it aborts at the configured
    timeout and rejects with the friendly message, not the raw
    `AbortError`. `node -c` passes on every changed JS file, CSS brace
    balance holds, and every affected page (`/chat`, `/login`,
    `/register`, `/join/<token>`, `/shared/<token>`, `/account`,
    `/usage`, `/documents`, `/admin`, `/transcriptions`) still renders
    via a local Flask dev server.
    ⚠️ **Not verified**: real browser behavior on an actually slow or
    intermittently-stalling connection (no way to simulate real network
    throttling in this environment) — only the timeout logic itself
    and page rendering were checked directly.
- **Error tracking with Sentry (Phase 26)** — `sentry-sdk` added to
  both `backend/requirements.txt` (`[fastapi]` extra) and
  `frontend/requirements.txt` (`[flask]` extra). Entirely optional,
  same "unset = skip gracefully" pattern as Google Sign-In: a blank
  `SENTRY_DSN` means `sentry_sdk.init()` never runs on either side, and
  the app behaves exactly as before this phase.
  - Backend: `sentry_sdk.init()` runs before `FastAPI()` is
    instantiated (required for the Starlette/FastAPI integration to
    actually instrument it), reading `SENTRY_DSN`/`SENTRY_ENVIRONMENT`/
    `SENTRY_TRACES_SAMPLE_RATE` (default `0` — errors only, no
    performance traces, which have separate Sentry quota/cost). A new
    `report_error(context, error)` helper wraps the ~15 existing
    `except Exception: print(...)` sites that were already
    catching-and-continuing on a non-fatal background failure (model
    fallback retries, post-turn summarization/memory extraction,
    usage-cost logging, ...) — still prints to stdout exactly as
    before, and now also calls `sentry_sdk.capture_exception()`, which
    is a documented safe no-op when Sentry was never configured, so
    `report_error()` itself never needs to branch on `SENTRY_DSN`.
    These were genuinely invisible failures before this phase — easy
    to miss entirely outside of actively tailing server logs.
  - Frontend: same pattern with Flask's integration, plus a new
    `inject_sentry_config()` context processor so every template gets
    `sentry_dsn`/`sentry_environment` automatically without touching
    every `render_template()` call. A new
    `frontend/templates/_sentry_init.html` partial (included from
    every page, the same way `_pwa_head.html`/`_theme_init.html`
    already are) loads Sentry's official browser CDN bundle and calls
    `Sentry.init()` client-side — but only renders anything at all
    when `sentry_dsn` is set, so a page's HTML is byte-for-byte
    unchanged with Sentry unconfigured. Deliberately Sentry's own CDN
    (`browser.sentry-cdn.com`), not `cdnjs` like every other script tag
    in this app — checked first, and `cdnjs`'s Sentry package is stuck
    at a very old v6 release, unsuitable for a current integration.
  - The same DSN is used on both sides on purpose: a Sentry DSN is
    meant to be public/embeddable in client-side code (unlike an API
    key), so there's no separate "public" vs "secret" key to manage
    here.
  - Verified directly against the real `sentry_sdk` package (installed
    and imported, not mocked): `report_error()` is a safe no-op with no
    DSN configured and correctly calls `capture_exception()` when it
    is (checked both ways); `sentry_sdk.init()` genuinely activates a
    live client with the configured `environment`/`traces_sample_rate`
    when `SENTRY_DSN` is set (checked via `sentry_sdk.get_client()`);
    routes keep working normally with Sentry active; and every page
    renders with the Sentry script entirely absent with no DSN set,
    and correctly present (with the right DSN/environment values
    injected) once one is. `py_compile` passes on both `app.py` files,
    and every Jinja template (including the new partial) parses.
    ⚠️ **Not verified**: an event actually arriving in a real Sentry
    project (would need a real DSN and network access to Sentry's
    ingest endpoint, neither available in this environment) — only the
    SDK's own local behavior (client activation, safe no-op, correct
    config) was checked directly.
- **Multi-provider image generation + resilience (Phase 28)** —
  `generate_image_bytes()` now tries a cross-provider fallback model if
  the primary one errors or rate-limits, the same resilience pattern
  already applied to chat (`FAST_MODEL`/`SMART_MODEL`/`FALLBACK_MODEL`)
  and vision (`VISION_MODEL`/`VISION_FALLBACK_MODEL`) — image
  generation was the one remaining OpenRouter-backed feature with no
  fallback at all, a single point of failure if `EASTA_IMAGE_MODEL`'s
  provider had an outage.
  - New `EASTA_IMAGE_FALLBACK_MODEL` (default `openai/gpt-image-1`) —
    deliberately a different underlying provider than the default
    `EASTA_IMAGE_MODEL` (`google/gemini-2.5-flash-image`), so one
    provider's outage doesn't take the feature down entirely.
  - `generate_image_bytes()`'s return type grew a 4th field,
    `model_used` — whichever model in the chain actually produced the
    image, appended at the end (not inserted in the middle, learning
    from the Phase 23 `is_admin`-tuple lesson) so both call sites
    needed a small, explicit update rather than silently breaking.
    Both (the `generate_image` tool and `POST /api/regenerate-image`)
    now log cost against `model_used` instead of always
    `EASTA_IMAGE_MODEL`, so a usage/cost breakdown correctly reflects
    the fallback provider taking over rather than attributing spend to
    a model that never actually responded.
  - Every failed attempt (primary or fallback) goes through
    `report_error()` from Phase 26, so a provider starting to fail
    shows up in Sentry (when configured) even on turns where the
    fallback quietly saves the day and the user never sees an error at
    all.
  - Verified against a mocked OpenRouter Image API covering all three
    paths: primary fails → fallback succeeds (confirmed `model_used`
    is the fallback, cost logged correctly, exactly one `report_error`
    call for the failed primary); both fail → the last error is
    re-raised (confirmed two `report_error` calls, one per model) so
    callers' existing "turn this into a user-facing tool error /
    502" handling is unchanged; primary succeeds → the fallback is
    never even attempted (confirmed exactly one HTTP call made, not
    two) so the common case doesn't pay for a redundant request.
    `py_compile` passes.
    ⚠️ **Not verified**: a real call against OpenRouter's live Image
    API for either model (no network access to OpenRouter in this
    environment) — only the fallback/logging logic itself was checked,
    against a mocked HTTP layer.
- **End-to-end test suite (Phase 27)** — a new `e2e/` directory with a
  Playwright suite, chosen over Cypress for better multi-browser
  support and no separate paid dashboard needed for CI reporting. This
  drives a real browser against a real, already-running EASTA stack
  (Postgres + backend + frontend) — it does not mock the LLM, so
  several tests wait on a real streamed OpenRouter reply.
  - **One continuous flow** (`full-journey.spec.js`): register → log
    out → log back in → send a message and get a streamed reply →
    attach a file → generate a PDF (downloaded and verified by its
    `%PDF-` magic-byte header, not just "a link appeared") → rename
    the conversation → delete it — all in one session, to catch
    anything that only breaks when these steps run back-to-back
    against real, accumulating state.
  - **Targeted specs** for each piece plus edge cases a single flow
    wouldn't hit: `register.spec.js` (success, client-side password-
    mismatch, duplicate username), `login.spec.js` (log out/in, wrong
    password, `/chat` redirecting to `/login` when logged out),
    `chat-message.spec.js`, `attachment.spec.js`,
    `generate-document.spec.js`, `conversation-rename.spec.js`,
    `conversation-delete.spec.js`.
  - **Google Sign-In** (`google-signin.spec.js`) — explicitly not
    skipped despite being the hardest one. There's no way to drive a
    real Google consent screen from an automated browser (no live test
    account to hold credentials for, and Google actively blocks
    scripted sign-ins), so this exercises a new backend test-only
    route instead: `GET /api/e2e/mock-google-callback` in
    `backend/app.py`, added right after the real
    `GET /api/auth/google/callback`. It skips only the actual network
    round trip to Google (the token exchange and profile fetch) and
    reuses the exact same account-creation/linking/session-setting
    code as the real callback, so everything downstream of "we have a
    verified Google profile" is exercised for real, not stubbed out.
    Gated behind a new `EASTA_E2E_MOCK_GOOGLE_OAUTH` env var (404s
    unless it's explicitly `true`) that must never be enabled in
    production — see the loud warning on that flag in
    `backend/.env.example` and in `e2e/README.md`.
  - **Wired into the deploy process**: a new ⚠️ callout in this file's
    "Deploy via Sevalla" → "Update the live application" section (the
    same treatment as the existing schema.sql-migration callout) makes
    running this suite against staging (or at minimum locally against
    a disposable database) an explicit pre-deploy step, not an
    afterthought.
  - Verified: `npx playwright test --list` discovers all 9 spec files
    /14 tests with no syntax or import errors; every `.js` file in
    `e2e/` passes `node -c`; the new `GET /api/e2e/mock-google-callback`
    route was verified directly via `TestClient` with the DB mocked —
    404s with the flag off, and with it on, correctly derives a
    stable per-email fake `google_id`, creates a new account on first
    sign-in, and reuses the same account (skipping
    `get_user_by_email()`/`create_google_user()` entirely) on a second
    sign-in with the same mocked profile.
    ⚠️ **Not verified**: no test in this suite was actually run end-to-
    end against a live browser + live app in this environment —
    `npx playwright install chromium` could not complete (no network
    access to Playwright's browser-binary CDN here), so real browser
    execution of these specs is unverified beyond static discovery and
    manual review against the actual frontend markup/selectors and
    backend route behavior. Run `cd e2e && npx playwright install
    --with-deps chromium && npm test` against a real disposable stack
    before trusting this suite in CI/pre-deploy.
- **Production incident fix: "Failed to fetch" on `/chat`, and raw
  i18n keys in the sidebar.** Root cause of both was the exact
  migration gap `backend/database/schema.sql`'s own header comment warns
  about: production hadn't been re-migrated since before Phase 18, so
  `users.is_admin` (Phase 23) didn't exist live. That alone was enough
  to take down the *entire app* for every logged-in user, plus it
  exposed a real, separate bug in how FastAPI/CORS interact here:
  - `GET /api/session` — the very first request every page makes
    (`loadSession()` in `chat.js`) — now does a DB lookup for
    `is_admin` (added in Phase 23). With that column missing, the
    lookup raised `UndefinedColumn`, which Starlette's
    `ServerErrorMiddleware` catches *outside* `CORSMiddleware` in the
    ASGI stack — its generic 500 response never gets CORS headers, so
    a cross-origin `fetch()` call sees the response blocked by the
    browser and reports the opaque `TypeError: Failed to fetch`
    instead of any real error. That's why the page never got past
    "Checking your session..." — not a network problem at all, a
    masked 500.
  - Confirmed a plain `@app.exception_handler(Exception)` does **not**
    reliably fix this on the FastAPI/Starlette versions this app runs
    on — verified directly (a `TestClient` check with `CORSMiddleware`
    registered): the substitute response it returns still doesn't flow
    back through `CORSMiddleware`'s header-injecting `send` wrapper. A
    new `CatchUnhandledErrorsMiddleware` (`BaseHTTPMiddleware`,
    registered in `backend/app.py` *before* `CORSMiddleware` so CORS
    ends up wrapping it) does work — also verified directly, including
    that normal `HTTPException` responses (404s, 400s, ...) and their
    exact status/detail are completely unaffected. Every unhandled
    exception anywhere in the app now returns a clean, CORS-safe,
    generic 500 instead of manifesting as a confusing "Failed to
    fetch" on the frontend, and reports through Phase 26's
    `report_error()` (stdout + Sentry when configured) so the real
    cause is actually visible in logs going forward.
  - `GET /api/session` specifically also got a defensive try/except
    around the `is_admin` lookup — degrading to `is_admin: false` and
    reporting the error, rather than 500ing. This is deliberately
    narrow: it's the one literal all-or-nothing gate every page load
    depends on before anything else can even run, so it's the one
    place worth hardening beyond "now fails with a clear error instead
    of an opaque one." Every other query added since Phase 18 (search,
    pinning, sharing, orgs, ...) is left as-is — with the CORS fix
    above, a still-missing column there now surfaces as a real,
    readable error rather than a masked one, and the actual fix is
    still to re-run the migration, not to make every query
    individually defensive.
  - **The definitive fix at the time was operational, not code**:
    re-run `backend/database/schema.sql` against the production database.
    That's since been automated entirely — see "Automatic schema
    migration on startup" below, added specifically because this exact
    manual step had already caused three separate incidents.
  - Separately, `frontend/static/sw.js`'s `CACHE_NAME` hadn't been
    bumped since Phase 17, despite Phases 18–28 repeatedly changing
    `/static/` content (`i18n/*.json` in particular) — the service
    worker's fetch handler cache-firsts *anything* under `/static/`,
    not just its explicit shell-asset list, so a returning visitor's
    browser kept serving a pre-Phase-18 `en.json` indefinitely. Any
    interface string added since then fell through `i18n.js`'s `t()`
    "key not found" fallback (`activeTranslations[key] || key`) and
    rendered as the raw key name — exactly the `conversation_search_pla…`/
    `knowledge_base_link` symptom reported. Fixed by bumping
    `CACHE_NAME` to `easta-shell-v6`, which makes the service worker's
    `activate` handler clear out the stale `v5` cache on next load.
    Audited every `data-i18n`/`data-i18n-placeholder`/`data-i18n-title`
    key referenced in `chat.html` plus every `t()` call in `chat.js`
    against all three language files: all 27 HTML-referenced keys and
    all 35 JS-referenced keys are present in `en.json`/`fr.json`/
    `es.json` (47 entries each, nothing missing, nothing orphaned) — so
    this was purely a stale-cache symptom, not a genuine content gap.
  - Verified: the exact production failure was reproduced with the DB
    mocked to raise `UndefinedColumn` from `is_user_admin()` inside a
    real logged-in session — confirmed `GET /api/session` now returns
    `200 {"is_admin": false}` instead of 500. A second, broader check
    forced an unhandled exception in an unrelated route
    (`GET /api/conversations`) and confirmed a clean, CORS-safe 500
    with a readable `detail`. `py_compile` passes; `node -c` passes on
    `sw.js`.
- **Automatic schema migration on startup.** Replaces the manual
  "remember to re-run `schema.sql` after every deploy" step entirely —
  the step that directly caused all three production incidents
  documented above, most recently the one right above this entry.
  - New `apply_schema_migration()` in `backend/app.py`, run once via a
    `lifespan` context manager before the app accepts its first
    request: reads `backend/database/schema.sql` and executes the whole file
    as a single `cursor.execute()` call with no parameters. Sent that
    way deliberately — Postgres's own parser then handles statement
    boundaries and comments correctly (some of `schema.sql`'s own
    comments contain literal semicolons, e.g. "PostgreSQL 14+; uses
    only...", which would break a naive client-side `.split(";")`),
    and the whole file runs as one atomic implicit transaction:
    commits together, or rolls back together, via the same
    `with psycopg.connect(...) as connection:` pattern used everywhere
    else in this file.
  - Safe on **every** startup, not just after a change — every
    statement in `schema.sql` is additive and idempotent by the
    STANDING CONVENTION documented at the top of that file, so
    re-applying it against a database that already has everything is a
    genuine no-op, not merely a low-risk one.
  - A migration failure is fatal **on purpose**: the exception
    propagates and stops the app from starting at all, rather than
    letting it come up successfully against a schema it doesn't
    actually match (exactly what silently happened all three previous
    times). Look for `EASTA: startup schema migration applied` in
    Sevalla's backend logs on success, or
    `EASTA: startup schema migration failed: ...` with the real
    underlying error otherwise — also reported to Sentry via Phase
    26's `report_error()` when configured.
  - Resolves `backend/database/schema.sql`'s location via the running
    file's own path (`Path(__file__)`), not the working directory --
    the file lives inside `backend/`'s own build path, as one single
    canonical copy, not duplicated at the repo root. If it's ever
    missing, the `RuntimeError` this raises says exactly where it
    looked and exactly what to do about it, rather than a bare
    `FileNotFoundError`.
  - The "Deploy PostgreSQL" and "Update the live application" sections
    below were rewritten accordingly — the manual `psql -f schema.sql`
    commands are kept only as an optional, still-safe-to-run-anytime
    fallback for manual inspection/troubleshooting, not as a required
    step anymore.
  - Verified directly (DB calls mocked, no live Postgres available in
    this environment): the success path executes the real, full
    `schema.sql` content via a single no-params `cursor.execute()`
    call and logs the expected message; a DB error during migration is
    fatal (`TestClient`'s startup genuinely fails to enter, the same
    as a real ASGI server failing to boot) and reported via
    `report_error()`; and a simulated missing-file scenario raises the
    clear, actionable `RuntimeError` rather than a bare
    `FileNotFoundError`, and is equally fatal. `py_compile` passes.
  - **Update, confirmed from an actual deploy crash log**: the first
    version of this fix guessed at Sevalla's build-path behavior and
    checked two candidate locations for `schema.sql` (the repo root
    and a copy inside `backend/`), on the theory that a "build path"
    setting usually just scopes build/run *commands* rather than
    physically excluding files from the checkout. That theory was
    wrong for this setup: the crash log confirmed the backend's
    Sevalla build path (`backend`) only checks out `backend/` itself,
    so `database/schema.sql` at the repo root genuinely didn't exist
    in the deployed container — not a lookup bug, the file was
    actually absent. Rather than keep a second copy of the file around
    as a permanent fallback (which would drift out of sync over time —
    exactly the class of problem this whole feature exists to
    eliminate), `schema.sql` was relocated to live at
    `backend/database/schema.sql` as the single source of truth, and
    every reference to the old `database/schema.sql` path across the
    codebase (this file, `e2e/README.md`, and the comments throughout
    `backend/app.py` that pointed to it) was updated to match. The
    path-resolution code is simpler now too — one confirmed location,
    not a guessed fallback chain.

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

That's it for PostgreSQL itself — you do **not** need to manually
create the EASTA tables. The backend applies
`backend/database/schema.sql` automatically the first time it starts
(see "Automatic schema migration on startup" above), against whatever
empty database you just created.

If you want the tables to exist before that first run anyway (e.g. to
poke around in `psql` first), the schema also still applies safely by
hand at any time:

``` bash
cd backend/database

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

That's it — you do **not** need to manually run `schema.sql` against
this database. The backend applies it automatically on every startup
(see `apply_schema_migration()` in `backend/app.py`), including the
very first one: `CREATE TABLE IF NOT EXISTS` creates the whole schema
from nothing just as readily as it converges an existing database. The
`users`, `conversations`, `messages`, `documents`, and `usage_logs`
tables (and everything since) will appear in Sevalla Studio once the
backend has started once.

If you ever want to run it by hand anyway (to inspect the database
before the backend's first boot, or to debug a migration failure shown
in the backend's logs), the manual command still works:

``` bash
psql \
-h HOST \
-U USER \
-p PORT \
-d DATABASE \
-f backend/database/schema.sql
```

Replace the uppercase placeholders with the External Connection
details from Sevalla.

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

⚠️ **Run the E2E suite before every deploy, not just the first one.**
`e2e/` has a Playwright suite covering register → login → send a
message and get a streamed reply → attach a file → generate a PDF →
rename a conversation → delete a conversation → Google sign-in (via a
test-only mocked-OAuth route — see `e2e/README.md`). Run it against a
staging deployment if you have one, or at minimum locally against a
disposable Postgres database (never against production — some of these
tests register throwaway accounts and delete conversations):

``` bash
cd e2e
cp .env.example .env   # point E2E_BASE_URL/E2E_BACKEND_URL at staging or localhost
npm install
npx playwright install --with-deps chromium
npm test
```

See `e2e/README.md` for the full setup (including the one backend env
var, `EASTA_E2E_MOCK_GOOGLE_OAUTH`, the Google Sign-In test needs) and
what each spec covers. Treat a red run as a blocker the same way you'd
treat a failed build — don't push past it "just this once."

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

**The database migrates itself.** Every backend startup — including
the one this redeploy just triggered — runs
`apply_schema_migration()` before accepting any requests: it applies
the full `backend/database/schema.sql` against `DATABASE_URL` and only then
starts serving traffic. If your change modified `schema.sql` (added a
column, a table, a constraint, ...), it's already live by the time the
new backend instance is actually taking requests — there's no longer a
separate step to remember, which is exactly what caused three
consecutive production incidents when it was a manual one (most
recently: `users.is_admin` missing live — see "Production incident
fix" above).

This is safe on every single startup, not just ones that actually
changed something — every statement in `schema.sql` is written to be
additive and idempotent (`CREATE TABLE IF NOT EXISTS` for new tables,
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for columns added to a
table that already existed — see the note at the top of
`backend/database/schema.sql` for why both are needed), so re-applying
everything on a database that already has all the changes is a no-op,
not a risk.

A migration failure is **fatal on purpose** — the backend refuses to
start rather than come up against a schema it doesn't match, so a
broken migration shows up immediately as a failed deploy in Sevalla's
logs (look for `EASTA: startup schema migration applied` on success,
or `EASTA: startup schema migration failed: ...` with the real error
otherwise), not as a mysteriously broken live app discovered later.
One thing worth knowing about this specific setup: the backend's
Sevalla application builds from the `backend` build path (see
"Backend build settings" above), which is a sibling of `database/`,
not a parent of it — `apply_schema_migration()` resolves
`backend/database/schema.sql`'s location via the running file's own path
rather than the working directory, so this works as long as Sevalla's
build still checks out the full repository (it does, for a standard
git-connected build — "build path" scopes which directory the
build/start *commands* run from, not what's present on disk). If a
future build setup ever genuinely excludes everything outside
`backend/`, the startup failure message tells you exactly what to do
about it (copy `schema.sql` into `backend/database/schema.sql`) rather
than failing in a way that's hard to diagnose.

You can still run the migration by hand any time — useful for
inspecting a database before the backend's next deploy, or confirming
a fix without waiting on a redeploy:

``` bash
psql -h HOST -U USER -p PORT -d DATABASE -f backend/database/schema.sql
```

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
- If your deployment target can guarantee the native Pango/cairo/GTK
  libraries (most Linux server images can, via `apt`), consider
  swapping `render_markdown_to_pdf()`'s `xhtml2pdf` backend for
  WeasyPrint for fuller CSS/CommonMark coverage (see the Phase 15
  entry above for why `xhtml2pdf` was chosen instead this round).
- Add a way for a Google-only account (`auth_provider = 'google'`,
  `password_hash IS NULL`) to set a password from the Account page —
  right now that page's password form just cleanly rejects them
  ("This account signed up with Google and has no password set")
  rather than offering a path to add one, so a Google-only user has no
  way to also get a username/password login.
- Replace TTS's flat per-character cost estimate
  (`TTS_FALLBACK_COST_USD_PER_1K_CHARS`) with a real per-call cost
  once you confirm how OpenRouter reports one for
  `POST /api/v1/audio/speech` (it returns raw audio, not JSON with a
  `usage.cost` field like the transcription/image endpoints already
  logged via `log_direct_cost()`) — see `synthesize_speech_bytes()`'s
  docstring in `backend/app.py`.
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
-   Playwright (E2E tests -- see `e2e/`)
-   GitHub
-   Sevalla

## License

MIT License
