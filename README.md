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
-   GitHub
-   Sevalla

## License

MIT License
