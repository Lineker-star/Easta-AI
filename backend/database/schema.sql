--
-- EASTA database schema
-- (PostgreSQL 14+; uses only built-in full-text search, no extensions required)
--
-- STANDING CONVENTION -- read this before adding a column to a table
-- that already exists below (users/conversations/messages/etc, as
-- opposed to a brand new table):
--
-- `CREATE TABLE IF NOT EXISTS` only runs its column list the FIRST
-- time a table is created. Against a database where the table already
-- exists (i.e. any deployed environment, past the very first run),
-- editing the CREATE TABLE block alone is a silent no-op -- the new
-- column never actually gets added, and the app starts throwing
-- `UndefinedColumn` the moment it queries it. (This exact bug shipped
-- once already: users.google_id was added to the CREATE TABLE block
-- for Phase 16, correctly paired with an ALTER TABLE here in the same
-- commit -- but production was never re-migrated by actually
-- re-running this file after that deploy, so the column didn't exist
-- live. The fix for that was operational, not a schema.sql change --
-- see README.md's "Update the live application" section -- but it's
-- exactly the failure mode this convention exists to prevent code-side.)
--
-- So: every column added to an EXISTING table needs BOTH of these, in
-- the same commit --
--   1. The updated `CREATE TABLE IF NOT EXISTS` block (so a fresh
--      install gets the column immediately, with no separate ALTER
--      needed).
--   2. A matching `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
--      statement placed after that block (so an already-existing
--      database converges to the same schema when this file is
--      re-run against it).
-- A new CHECK constraint needs the DROP CONSTRAINT IF EXISTS + ADD
-- CONSTRAINT pattern used below for users_auth_provider_check /
-- generated_files_kind_check, for the same reason. A brand new table
-- needs neither -- CREATE TABLE IF NOT EXISTS alone is correct there,
-- since there's no pre-existing version of it to migrate.
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

--
-- users
--

CREATE TABLE IF NOT EXISTS public.users (
    id serial PRIMARY KEY,
    username character varying(50) NOT NULL UNIQUE,
    email character varying(255) NOT NULL UNIQUE,
    -- Nullable: a Google-only account (auth_provider = 'google') has no
    -- password at all -- see backend/app.py's create_google_user() /
    -- GET /api/auth/google/callback.
    password_hash text,
    -- Scaffolding for a future Stripe (or similar) integration -- see
    -- the Account page / GET /api/account/plan in backend/app.py.
    -- Nothing reads this to gate or limit behavior yet; every account
    -- is effectively unrestricted regardless of this value.
    plan character varying(20) NOT NULL DEFAULT 'free',
    -- Google's stable per-account id ("sub" in its userinfo response),
    -- set once a user has signed in with Google -- see
    -- get_user_by_google_id() / link_google_id() in backend/app.py.
    -- Nullable + unique: most rows have no Google account linked.
    google_id character varying(255) UNIQUE,
    -- How this account was created / how it can log in. A password
    -- account can still get a google_id linked later (matched by
    -- verified email) without changing this -- it only reflects how
    -- the row itself was first created.
    auth_provider character varying(20) NOT NULL DEFAULT 'password',
    -- Phase 23: platform-wide admin view (GET /api/admin/*), distinct
    -- from an organization's per-org 'owner' role above -- this grants
    -- visibility across every user/org on the whole instance, not just
    -- one org. Nobody can grant this to themselves through the app;
    -- there's no API route that ever sets it (deliberately -- see
    -- require_admin() in backend/app.py). Flip it by hand in the
    -- database for whoever should have it:
    --   UPDATE users SET is_admin = true WHERE username = '...';
    is_admin boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_plan_check CHECK (((plan)::text = ANY ((ARRAY['free'::character varying, 'premium'::character varying])::text[]))),
    CONSTRAINT users_auth_provider_check CHECK (((auth_provider)::text = ANY ((ARRAY['password'::character varying, 'google'::character varying])::text[])))
);

-- Safe to re-run against a database created before these columns/
-- constraints existed.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan character varying(20) NOT NULL DEFAULT 'free';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS google_id character varying(255) UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_provider character varying(20) NOT NULL DEFAULT 'password';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_auth_provider_check;
ALTER TABLE public.users ADD CONSTRAINT users_auth_provider_check
    CHECK (((auth_provider)::text = ANY ((ARRAY['password'::character varying, 'google'::character varying])::text[])));

--
-- conversations
-- `summary` + `summarized_through_message_id` back the rolling
-- context-summarization feature: once a conversation grows past the
-- "keep recent" window, older turns get folded into `summary` by an
-- LLM call, and only messages with id > summarized_through_message_id
-- are sent to the model as raw turns going forward.
--

CREATE TABLE IF NOT EXISTS public.conversations (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title character varying(100) DEFAULT 'New Chat'::character varying NOT NULL,
    summary text,
    summarized_through_message_id integer,
    -- Phase 19: pin a conversation above the regular chronological
    -- list, and/or file it under a free-text folder label. A simple
    -- nullable text column rather than a folders table -- there's no
    -- folder management UI (rename/delete a folder as an object) to
    -- justify one; see backend/app.py's sidebar folder grouping.
    pinned boolean NOT NULL DEFAULT false,
    folder character varying(50),
    -- Phase 20: read-only public sharing, opt-in per conversation.
    -- NULL (the default for every row) means "not shared" -- a token
    -- only ever exists here after the owner explicitly calls
    -- POST /api/conversations/{id}/share, and clearing it (unshare,
    -- or sharing again to rotate it) immediately invalidates any link
    -- already handed out, since GET /api/shared/{token} is a direct
    -- equality lookup against whatever's currently in this column.
    -- Stored as plaintext rather than hashed like api_keys.key_hash --
    -- deliberately different tradeoff: a share link is meant to be
    -- shown/copied again later (e.g. reopening the Share panel), not
    -- a write-once secret, and unlike a password or API key this only
    -- grants read-only access to one conversation's messages, not
    -- account access.
    share_token character varying(64) UNIQUE,
    shared_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Safe to re-run against a database created before these columns
-- existed.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS folder character varying(50);
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS share_token character varying(64) UNIQUE;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS shared_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_conversations_user_pinned
    ON public.conversations (user_id, pinned DESC, created_at DESC);

-- No separate index on share_token: the UNIQUE constraint above
-- already creates one, so GET /api/shared/{token}'s lookup is already
-- indexed without a redundant duplicate.

--
-- messages
-- `attachments` holds image attachments (see ImageAttachment /
-- validate_images() in backend/app.py) as a JSON array of
-- {type, name, mime_type, data_url} objects, or NULL for a text-only
-- message. PDF/DOCX attachments are extracted to plain text client-side
-- before the message is sent, so they live in `content`, not here.
-- NOTE: storing base64 image data directly in Postgres is
-- prototype-grade -- swap for object storage (S3/R2/etc, storing just a
-- URL here) before relying on this at real scale.
--

CREATE TABLE IF NOT EXISTS public.messages (
    id serial PRIMARY KEY,
    conversation_id integer NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    role character varying(20) NOT NULL,
    content text NOT NULL,
    attachments jsonb,
    -- Powers GET /api/conversations/search (Phase 18) the same way
    -- documents.search_vector already powers RAG grounding below --
    -- populated at insert time by save_message() in backend/app.py,
    -- same reasoning as documents: messages are never edited in place
    -- (editing a message deletes it and re-inserts fresh, see
    -- edit_message() in backend/app.py), so a column set once at
    -- insert can't go stale the way it could if content were mutable.
    search_vector tsvector,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT messages_role_check CHECK (((role)::text = ANY ((ARRAY['user'::character varying, 'assistant'::character varying])::text[])))
);

-- Safe to re-run against a database created before these columns existed.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachments jsonb;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- One-time backfill for rows inserted before search_vector existed --
-- idempotent (only touches rows that still have no vector), so safe
-- to re-run alongside the rest of this file.
UPDATE public.messages
SET search_vector = to_tsvector('english', content)
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
    ON public.messages (conversation_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_messages_search_vector
    ON public.messages USING GIN (search_vector);

--
-- organizations / organization_members
-- Phase 22: shared team workspaces. An organization is just a name +
-- an invite link (invite_token) -- joining via POST
-- /api/organizations/join/{token} adds an organization_members row.
-- role is 'owner' (created the org, or granted ownership -- can
-- manage members/invite link) or 'member' (can use/add to the shared
-- knowledge base, cannot manage membership). See backend/app.py's
-- "Organizations" section for the full membership/invite flow.
--
-- Explicit design decision (documented here since it's a real privacy
-- boundary, not an oversight): belonging to the same organization
-- does NOT give members visibility into each other's individual
-- conversations. Conversations stay 100% scoped to conversations.user_id
-- exactly as before this phase -- nothing about conversations changed.
-- Organizations only ever share two things: the documents (RAG
-- knowledge base) rows below, and the combined cost-dashboard view for
-- owners (GET /api/organizations/{id}/usage, which reads usage_logs --
-- see the note above that route for why usage_logs itself doesn't get
-- an org_id column). This is the safer default the brief itself
-- recommends, not just the easier one to build.
--

CREATE TABLE IF NOT EXISTS public.organizations (
    id serial PRIMARY KEY,
    name character varying(100) NOT NULL,
    -- Unique, unguessable (secrets.token_urlsafe) -- the whole join
    -- flow is "anyone with this link can join", so treat it like the
    -- share_token on conversations above: rotate it
    -- (POST .../invite/regenerate) any time it needs to stop working.
    invite_token character varying(64) UNIQUE,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS public.organization_members (
    id serial PRIMARY KEY,
    org_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role character varying(20) NOT NULL DEFAULT 'member',
    joined_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT organization_members_role_check CHECK (((role)::text = ANY ((ARRAY['owner'::character varying, 'member'::character varying])::text[]))),
    CONSTRAINT organization_members_unique UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_user_id
    ON public.organization_members (user_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_org_id
    ON public.organization_members (org_id);

--
-- documents
-- The knowledge base used for RAG grounding. Each row is one chunk /
-- document EASTA has been taught; `search_vector` powers Postgres
-- full-text search retrieval at query time (see
-- retrieve_relevant_chunks() in backend/app.py). This keyword-search
-- approach needs no extra extensions or embedding calls, so it works
-- out of the box on a plain managed Postgres instance (e.g. Sevalla).
-- Upgrade path: swap to pgvector + real embeddings for semantic (not
-- just keyword) retrieval once you need it.
--
-- Phase 22: a document now belongs to EITHER a user (personal, exactly
-- the pre-Phase-22 behavior -- every existing row already satisfies
-- this) OR an organization (shared with every member) -- never both,
-- never neither, enforced by documents_owner_check below rather than
-- just application-level discipline.
--

CREATE TABLE IF NOT EXISTS public.documents (
    id serial PRIMARY KEY,
    user_id integer REFERENCES public.users(id) ON DELETE CASCADE,
    org_id integer REFERENCES public.organizations(id) ON DELETE CASCADE,
    title character varying(200) NOT NULL,
    content text NOT NULL,
    search_vector tsvector NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT documents_owner_check CHECK (
        (user_id IS NOT NULL AND org_id IS NULL)
        OR (user_id IS NULL AND org_id IS NOT NULL)
    )
);

-- Safe to re-run against a database created before these columns/
-- constraints existed -- every pre-existing row already has user_id
-- set and org_id NULL, so it already satisfies documents_owner_check
-- once user_id is allowed to be nullable.
ALTER TABLE public.documents ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS org_id integer REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_owner_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_owner_check
    CHECK (
        (user_id IS NOT NULL AND org_id IS NULL)
        OR (user_id IS NULL AND org_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_documents_search_vector
    ON public.documents USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_documents_user_id
    ON public.documents (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_org_id
    ON public.documents (org_id, created_at DESC);

--
-- usage_logs
-- Backs the cost dashboard: one row per model call, with token counts
-- and an estimated USD cost computed from the pricing table in
-- backend/app.py. Estimates only -- reconcile against your OpenRouter
-- invoice periodically.
--
-- Phase 22 note: the organization owner's combined cost dashboard
-- (GET /api/organizations/{id}/usage) deliberately does NOT need an
-- org_id column here -- every row already has a real user_id, and
-- "this org's spend" is just usage_logs joined through
-- organization_members.user_id for that org's members, computed at
-- query time. A row never changes meaning depending on which org (if
-- any) its user happens to belong to when you look, which an
-- org_id-on-usage_logs column would have to get right at insert time
-- instead (e.g. multi-org members, or a call made before joining).
--

CREATE TABLE IF NOT EXISTS public.usage_logs (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    conversation_id integer REFERENCES public.conversations(id) ON DELETE SET NULL,
    model character varying(120) NOT NULL,
    prompt_tokens integer NOT NULL DEFAULT 0,
    completion_tokens integer NOT NULL DEFAULT 0,
    cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created
    ON public.usage_logs (user_id, created_at DESC);

--
-- generated_files
-- Backs the generate_document / generate_image / create_document tools
-- (see backend/app.py). Holds the raw bytes of a generated PDF, DOCX,
-- PPTX, or image so it can be re-downloaded later via
-- GET /api/generated/{id}/download.
-- NOTE: storing generated file bytes directly in Postgres is
-- prototype-grade, same tradeoff as the messages.attachments column --
-- swap for object storage (S3/R2/etc) before relying on this at real
-- scale.
--

CREATE TABLE IF NOT EXISTS public.generated_files (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    conversation_id integer REFERENCES public.conversations(id) ON DELETE CASCADE,
    title character varying(200) NOT NULL,
    kind character varying(20) NOT NULL,
    mime_type character varying(120) NOT NULL,
    data bytea NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT generated_files_kind_check CHECK (((kind)::text = ANY ((ARRAY['pdf'::character varying, 'docx'::character varying, 'image'::character varying, 'pptx'::character varying])::text[])))
);

-- Widens the CHECK above to include 'pptx' for databases created
-- before create_document/PPTX support existed. DROP+ADD of a CHECK
-- constraint only changes what future rows are validated against --
-- it does not touch existing data, so this is safe to re-run.
ALTER TABLE public.generated_files DROP CONSTRAINT IF EXISTS generated_files_kind_check;
ALTER TABLE public.generated_files ADD CONSTRAINT generated_files_kind_check
    CHECK (((kind)::text = ANY ((ARRAY['pdf'::character varying, 'docx'::character varying, 'image'::character varying, 'pptx'::character varying])::text[])));

CREATE INDEX IF NOT EXISTS idx_generated_files_user_id
    ON public.generated_files (user_id, created_at DESC);

--
-- canvas_artifacts
-- Backs the design/canvas side panel: the single "current working
-- artifact" for a conversation (a document, a piece of code, or an
-- image), updated in place each time the model calls
-- generate_document / generate_image / write_code again -- see
-- upsert_canvas_artifact() in backend/app.py. One row per
-- conversation (no version history in this pass -- see README
-- "Suggested next steps").
--

CREATE TABLE IF NOT EXISTS public.canvas_artifacts (
    id serial PRIMARY KEY,
    conversation_id integer NOT NULL UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
    title character varying(200) NOT NULL,
    kind character varying(20) NOT NULL,
    language character varying(40),
    content text,
    generated_file_id integer REFERENCES public.generated_files(id) ON DELETE SET NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT canvas_artifacts_kind_check CHECK (((kind)::text = ANY ((ARRAY['document'::character varying, 'code'::character varying, 'image'::character varying])::text[])))
);

--
-- api_keys
-- Backs the Account page's "API Keys" section and Bearer-token auth
-- for the public /v1/* API (see require_user() / resolve_api_key() in
-- backend/app.py). The plaintext key is shown to the user exactly
-- once, at creation time, in the API response -- only its hash is
-- ever stored, same idea as password hashing (see key_hash's
-- generation for why it's a plain SHA-256 rather than
-- werkzeug's generate_password_hash, unlike users.password_hash).
--

CREATE TABLE IF NOT EXISTS public.api_keys (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name character varying(100) NOT NULL,
    key_hash character varying(64) NOT NULL UNIQUE,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id
    ON public.api_keys (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash
    ON public.api_keys (key_hash);

--
-- transcription_jobs / transcription_items
-- Backs bulk audio transcription (see the "Bulk transcription" section
-- in backend/app.py): one job per upload batch (several files, or a
-- .zip of them), one item per audio file. Uploading returns the job
-- id immediately -- transcription runs afterward (FastAPI
-- BackgroundTasks for now; see the README for why that doesn't scale
-- to hundreds of files). `transcription_items.data` holds the raw
-- audio bytes only until that item is processed (success or failure),
-- then gets cleared to NULL to bound storage growth -- same
-- prototype-grade storage tradeoff as generated_files/
-- messages.attachments (Postgres bytea, not object storage).
--

CREATE TABLE IF NOT EXISTS public.transcription_jobs (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status character varying(20) NOT NULL DEFAULT 'queued',
    total_files integer NOT NULL DEFAULT 0,
    completed_files integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT transcription_jobs_status_check CHECK (((status)::text = ANY ((ARRAY['queued'::character varying, 'processing'::character varying, 'done'::character varying, 'failed'::character varying])::text[])))
);

CREATE INDEX IF NOT EXISTS idx_transcription_jobs_user_id
    ON public.transcription_jobs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.transcription_items (
    id serial PRIMARY KEY,
    job_id integer NOT NULL REFERENCES public.transcription_jobs(id) ON DELETE CASCADE,
    filename character varying(255) NOT NULL,
    status character varying(20) NOT NULL DEFAULT 'queued',
    data bytea,
    transcript_text text,
    error text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT transcription_items_status_check CHECK (((status)::text = ANY ((ARRAY['queued'::character varying, 'processing'::character varying, 'done'::character varying, 'failed'::character varying])::text[])))
);

CREATE INDEX IF NOT EXISTS idx_transcription_items_job_id
    ON public.transcription_items (job_id, created_at);

--
-- user_memory
-- Phase 21: short, durable facts about a user extracted across
-- conversations (stated preferences/standing context -- "I'm
-- vegetarian", "I go by Alex") -- distinct from any single
-- conversation's own message history, injected into every future
-- conversation's system context (see build_memory_context_message()
-- in backend/app.py). A brand new table, so CREATE TABLE IF NOT
-- EXISTS alone is correct here -- no ALTER TABLE needed (see this
-- file's own header comment on when one is vs. isn't required).
-- source_conversation_id is ON DELETE SET NULL, not CASCADE: deleting
-- the conversation a fact was noticed in shouldn't delete the fact
-- itself, only detach where it came from -- same reasoning as
-- usage_logs.conversation_id above.
--

CREATE TABLE IF NOT EXISTS public.user_memory (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content text NOT NULL,
    source_conversation_id integer REFERENCES public.conversations(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_memory_user_id
    ON public.user_memory (user_id, created_at DESC);
