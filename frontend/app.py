import os

from dotenv import load_dotenv
from flask import Flask, render_template, send_from_directory


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


@app.get("/login")
def login_page():
    return render_template(
        "login.html",
        backend_url=BACKEND_URL,
    )


@app.get("/register")
def register():
    return render_template(
        "register.html",
        backend_url=BACKEND_URL,
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


@app.get("/transcriptions")
@app.get("/transcriptions/<int:job_id>")
def transcriptions(job_id=None):
    return render_template(
        "transcriptions.html",
        backend_url=BACKEND_URL,
        job_id=job_id,
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
