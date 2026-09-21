import os
import urllib.parse

from dotenv import load_dotenv
from flask import Flask, render_template, request, send_from_directory


load_dotenv()

app = Flask(__name__)

BACKEND_URL = os.getenv(
    "BACKEND_URL",
    "http://127.0.0.1:8000",
)


@app.get("/")
def landing():
    return render_template(
        "landing.html",
        backend_url=BACKEND_URL,
    )


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


def _safe_next_path(raw_value):
    """Only ever returns a same-site relative path (or None) -- used to
    bounce a user back to whatever protected page sent them to
    /login?next=... (e.g. an org invite link) without opening an
    open-redirect: a value like "https://evil.example" or "//evil.example"
    is rejected outright rather than trusted."""
    if not raw_value:
        return None

    if not raw_value.startswith("/") or raw_value.startswith("//"):
        return None

    return raw_value


def _google_login_url(next_path):
    url = f"{BACKEND_URL}/api/auth/google/login"
    if next_path:
        url += f"?next={urllib.parse.quote(next_path)}"
    return url


@app.get("/login")
def login_page():
    next_path = _safe_next_path(request.args.get("next"))
    return render_template(
        "login.html",
        backend_url=BACKEND_URL,
        next_path=next_path,
        google_login_url=_google_login_url(next_path),
    )


@app.get("/register")
def register():
    next_path = _safe_next_path(request.args.get("next"))
    return render_template(
        "register.html",
        backend_url=BACKEND_URL,
        next_path=next_path,
        google_login_url=_google_login_url(next_path),
    )


@app.get("/chat")
@app.get("/chat/<int:conversation_id>")
def chat(conversation_id=None):
    return render_template(
        "chat.html",
        backend_url=BACKEND_URL,
        conversation_id=conversation_id,
    )


@app.get("/usage")
def usage():
    return render_template(
        "usage.html",
        backend_url=BACKEND_URL,
    )


@app.get("/account")
def account():
    return render_template(
        "account.html",
        backend_url=BACKEND_URL,
    )


@app.get("/documents")
def documents_page():
    # ?org=<id> preselects that organization's shared knowledge base
    # instead of the personal one -- see the "Knowledge base" link on
    # each org card in account.js. Not validated here (documents.js's
    # own fetch of GET /api/organizations is the source of truth for
    # which orgs the user actually belongs to; an invalid/foreign id
    # here just fails to match and the dropdown falls back to Personal).
    initial_org_id = request.args.get("org")
    return render_template(
        "documents.html",
        backend_url=BACKEND_URL,
        initial_org_id=initial_org_id,
    )


@app.get("/join/<invite_token>")
def join_organization_page(invite_token):
    # The actual join (POST /api/organizations/join/{token}) happens
    # client-side in join.js once the button is clicked -- this route
    # just renders the confirmation page. Deliberately not auto-joining
    # on page load: a GET request (including one a browser or link
    # scanner might prefetch) should never have a side effect.
    return render_template(
        "join.html",
        backend_url=BACKEND_URL,
        invite_token=invite_token,
    )


@app.get("/admin")
def admin_page():
    # No server-side admin check here -- this route just renders the
    # shell; admin.js immediately calls GET /api/admin/stats and shows
    # a plain "not authorized" state on a 403 rather than the dashboard.
    # The real enforcement is backend-side (require_admin()), same
    # division of responsibility as every other page in this app (the
    # frontend process has no session/DB access of its own to check
    # against).
    return render_template(
        "admin.html",
        backend_url=BACKEND_URL,
    )


@app.get("/transcriptions")
@app.get("/transcriptions/<int:job_id>")
def transcriptions(job_id=None):
    return render_template(
        "transcriptions.html",
        backend_url=BACKEND_URL,
        job_id=job_id,
    )


@app.get("/shared/<share_token>")
def shared_conversation(share_token):
    # Deliberately unauthenticated -- see GET /api/shared/{token} in
    # backend/app.py, which this page fetches from client-side
    # (shared.js). No sidebar/composer template include here: this is
    # the public read-only view a stranger reaches from a copied link,
    # not the logged-in chat UI.
    return render_template(
        "shared.html",
        backend_url=BACKEND_URL,
        share_token=share_token,
    )


@app.get("/offline")
def offline():
    # Cached by the service worker as the navigation fallback when the
    # network is unreachable -- see frontend/static/sw.js's
    # OFFLINE_URL. Not linked from anywhere in the UI; only ever
    # reached via that fallback.
    return render_template(
        "offline.html",
        backend_url=BACKEND_URL,
    )


@app.get("/sw.js")
def service_worker():
    # Served at the site root (not /static/sw.js) so its default scope
    # covers the whole app rather than just /static/ -- see
    # frontend/static/sw.js and pwa.js's registration call.
    response = send_from_directory(app.static_folder, "sw.js")
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/favicon.ico")
def favicon():
    # Browsers request /favicon.ico automatically, regardless of any
    # <link rel="icon"> tag in <head> (see _pwa_head.html, which also
    # links this same file from /static/icons/favicon.ico for the
    # browsers that do respect the tag) -- without this route that
    # implicit request 404s in the console even though the favicon
    # shown to the user is working fine via the <link> tag.
    return send_from_directory(
        os.path.join(app.static_folder, "icons"), "favicon.ico"
    )
