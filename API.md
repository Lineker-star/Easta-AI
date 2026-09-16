# EASTA API (v1)

A small, deliberately-scoped public API for third-party/programmatic
access to EASTA — separate from the internal endpoints the web
frontend uses under `/api/*` (those are implementation details and can
change without notice; `/v1/*` is the stable, documented surface).

## Authentication

1. Log in to the EASTA web app and go to **Account → API Keys**.
2. Click **Generate new key**, give it a name (e.g. "My integration"),
   and copy the key it shows you — it's displayed **once**, at
   creation time only. EASTA never stores or displays the plaintext
   key again after that; only a hash of it is kept.
3. Send it as a Bearer token on every request:

```
Authorization: Bearer easta_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Revoke a key any time from the same page — revocation takes effect
immediately.

**Rate limiting**: API-key traffic goes through the same per-user rate
limiter as the web app (`EASTA_RATE_LIMIT_PER_MINUTE`, default 20
requests/minute) — a leaked key can't be used to bypass it.

## `POST /v1/chat`

Send a message, get a complete response. This endpoint is a plain
request/response API (not streamed), so it works with any HTTP client
— no SSE parsing required.

### Request

```bash
curl https://YOUR-BACKEND-DOMAIN/v1/chat \
  -H "Authorization: Bearer easta_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the capital of Senegal?"
  }'
```

| Field             | Type   | Required | Description |
|-------------------|--------|----------|-------------|
| `message`         | string | yes      | The user message (12,000 character limit). |
| `conversation_id` | int    | no       | Continue an existing conversation. Omit to start a new one. |
| `language`        | string | no       | Reply-language override — see `GET /api/languages` for the list of codes (e.g. `"fr"`, `"es"`). Omit for automatic (reply in whatever language the message is written in). |

### Response

```json
{
  "conversation_id": 42,
  "message": {
    "role": "assistant",
    "content": "Dakar is the capital of Senegal."
  }
}
```

Send another request with the same `conversation_id` to continue the
conversation — EASTA remembers prior turns the same way it does in the
web app.

## `GET /v1/me`

Returns the authenticated account's basic info — useful to confirm a
key works and identify who it belongs to.

```bash
curl https://YOUR-BACKEND-DOMAIN/v1/me \
  -H "Authorization: Bearer easta_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

```json
{
  "username": "alice",
  "plan": "free"
}
```

## Not included in v1 (yet)

This is intentionally a small surface, not every internal capability
exposed publicly:

- **Streaming responses** — the internal chat endpoint streams token-
  by-token with tool-use/canvas/source events; `/v1/chat` intentionally
  collapses all of that into one plain text response for broad
  third-party client compatibility. (Generated documents/images still
  come through as Markdown links/images in the response text, since
  those are appended to the saved message content the same way they
  appear in the web app after a page reload.)
- **Image attachments, research mode, and the image-style control** —
  these exist in the web app but aren't exposed as request parameters
  here yet.
- **Listing/deleting conversations, documents, or generated files**
  via the public API — manage those from the web app for now.

## Errors

Standard HTTP status codes:

| Status | Meaning |
|--------|---------|
| 400    | Malformed request (e.g. missing/empty `message`, or over the length limit). |
| 401    | Missing, invalid, or revoked API key. |
| 404    | `conversation_id` doesn't exist or doesn't belong to you. |
| 429    | Rate limited — slow down. |
| 502    | EASTA couldn't get a response from the underlying model right now — retry. |

Error bodies look like:

```json
{ "detail": "human-readable message" }
```
