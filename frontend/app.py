import os

from dotenv import load_dotenv
from flask import Flask, render_template


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
