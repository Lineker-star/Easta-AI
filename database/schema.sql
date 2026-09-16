--
-- EASTA database schema
-- (PostgreSQL 14+; uses only built-in full-text search, no extensions required)
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
    password_hash text NOT NULL,
    -- Scaffolding for a future Stripe (or similar) integration -- see
    -- the Account page / GET /api/account/plan in backend/app.py.
    -- Nothing reads this to gate or limit behavior yet; every account
    -- is effectively unrestricted regardless of this value.
    plan character varying(20) NOT NULL DEFAULT 'free',
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_plan_check CHECK (((plan)::text = ANY ((ARRAY['free'::character varying, 'premium'::character varying])::text[])))
);

-- Safe to re-run against a database created before this column existed.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan character varying(20) NOT NULL DEFAULT 'free';

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
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

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
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT messages_role_check CHECK (((role)::text = ANY ((ARRAY['user'::character varying, 'assistant'::character varying])::text[])))
);

-- Safe to re-run against a database created before this column existed.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachments jsonb;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
    ON public.messages (conversation_id, created_at, id);

--
-- documents
-- The knowledge base used for RAG grounding. Each row is one chunk /
-- document the user has taught EASTA about; `search_vector` powers
-- Postgres full-text search retrieval at query time (see
-- retrieve_relevant_chunks() in backend/app.py). This keyword-search
-- approach needs no extra extensions or embedding calls, so it works
-- out of the box on a plain managed Postgres instance (e.g. Sevalla).
-- Upgrade path: swap to pgvector + real embeddings for semantic (not
-- just keyword) retrieval once you need it.
--

CREATE TABLE IF NOT EXISTS public.documents (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title character varying(200) NOT NULL,
    content text NOT NULL,
    search_vector tsvector NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_search_vector
    ON public.documents USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_documents_user_id
    ON public.documents (user_id, created_at DESC);

--
-- usage_logs
-- Backs the cost dashboard: one row per model call, with token counts
-- and an estimated USD cost computed from the pricing table in
-- backend/app.py. Estimates only -- reconcile against your OpenRouter
-- invoice periodically.
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
