"""A Hermes API server small enough to run in a test.

It answers the calls the bridge makes, checks each profile's own key, and
remembers what it was asked so a test can look.
"""

from __future__ import annotations

import json
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit


class FakeHermes:
    def __init__(self) -> None:
        self.keys = {"default": "key-primary", "nova": "key-nova"}
        self.sessions: dict[str, list[dict]] = {
            "default": [
                {
                    "id": "s-primary-1",
                    "title": "Chief",
                    "message_count": 2,
                    "last_active": 2000,
                    "archived": False,
                }
            ],
            "nova": [
                {
                    "id": "s-nova-1",
                    "title": "Notes",
                    "message_count": 1,
                    "last_active": 1000,
                    "archived": False,
                }
            ],
        }
        self.messages = {
            "s-primary-1": [
                {"role": "user", "content": "hello", "timestamp": 1},
                {"role": "assistant", "content": "hi there", "timestamp": 2},
            ]
        }
        self.last_turn: dict = {}
        self.calls: list[tuple[str, str, str]] = []
        self._lock = threading.Lock()


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    @property
    def fake(self) -> FakeHermes:
        return self.server.fake  # type: ignore[attr-defined]

    def log_message(self, fmt, *args) -> None:  # noqa: A003
        pass

    # ------------------------------------------------------------ helpers

    def _split(self) -> tuple[str, str]:
        parsed = urlsplit(self.path)
        match = re.match(r"^/p/([^/]+)(/.*)$", parsed.path)
        if match:
            return match.group(1), match.group(2)
        return "default", parsed.path

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except ValueError:
            return {}
        return data if isinstance(data, dict) else {}

    def _json(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(raw)
        self.close_connection = True

    def _authorised(self, profile: str) -> bool:
        header = self.headers.get("Authorization") or ""
        expected = self.fake.keys.get(profile)
        return bool(expected) and header == f"Bearer {expected}"

    # ------------------------------------------------------------- routes

    def do_GET(self) -> None:  # noqa: N802
        profile, rest = self._split()
        parsed = urlsplit(self.path)
        self.fake.calls.append(("GET", profile, rest))
        if not self._authorised(profile):
            return self._json(401, {"error": {"message": "Invalid gateway API key"}})

        if rest == "/health/detailed":
            return self._json(200, {"ok": True})

        if rest == "/api/sessions":
            query = parse_qs(parsed.query)
            limit = int((query.get("limit") or ["100"])[0])
            offset = int((query.get("offset") or ["0"])[0])
            rows = self.fake.sessions.get(profile, [])
            page = rows[offset : offset + limit]
            return self._json(
                200, {"data": page, "has_more": offset + len(page) < len(rows)}
            )

        match = re.match(r"^/api/sessions/([^/]+)/messages$", rest)
        if match:
            return self._json(200, {"data": self.fake.messages.get(match.group(1), [])})

        if rest == "/api/model/options":
            return self._json(
                200,
                {
                    # The host names its current model with the provider in
                    # front, and calls the provider "auto".
                    "model": "anthropic/sonnet-4.5",
                    "provider": "auto",
                    "providers": [
                        {
                            "slug": "anthropic",
                            "name": "Anthropic",
                            "authenticated": True,
                            "models": [{"id": "sonnet-4.5", "name": "Sonnet 4.5"}],
                        },
                        {
                            "slug": "openai",
                            "name": "OpenAI",
                            "authenticated": False,
                            "models": [{"id": "gpt-x", "name": "GPT X"}],
                        },
                    ],
                },
            )
        return self._json(404, {"error": {"message": "no route"}})

    def do_POST(self) -> None:  # noqa: N802
        profile, rest = self._split()
        self.fake.calls.append(("POST", profile, rest))
        if not self._authorised(profile):
            return self._json(401, {"error": {"message": "Invalid gateway API key"}})

        if rest == "/api/sessions":
            body = self._body()
            title = str(body.get("title") or "")
            with self.fake._lock:
                taken = {row["title"] for row in self.fake.sessions.get(profile, [])}
                if title in taken:
                    return self._json(409, {"detail": "title already in use"})
                session_id = f"s-{profile}-{len(self.fake.sessions.get(profile, [])) + 1}"
                self.fake.sessions.setdefault(profile, []).append(
                    {
                        "id": session_id,
                        "title": title,
                        "message_count": 0,
                        "last_active": int(time.time()),
                        "archived": False,
                    }
                )
            return self._json(201, {"session": {"id": session_id}})

        match = re.match(r"^/api/sessions/([^/]+)/chat/stream$", rest)
        if match:
            self.fake.last_turn = {
                "profile": profile,
                "authorization": self.headers.get("Authorization"),
                "body": self._body(),
                "session": match.group(1),
            }
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Connection", "close")
            self.end_headers()
            for frame in (
                "event: assistant.delta\ndata: {\"delta\": \"Deploy \"}\n\n",
                ": keepalive\n\n",
                "event: tool.started\ndata: {\"tool_name\": \"shell\"}\n\n",
                "event: assistant.delta\ndata: {\"delta\": \"412 is green.\"}\n\n",
                "event: done\ndata: {\"ok\": true}\n\n",
            ):
                self.wfile.write(frame.encode("utf-8"))
                self.wfile.flush()
            self.close_connection = True
            return
        return self._json(404, {"error": {"message": "no route"}})

    def do_PATCH(self) -> None:  # noqa: N802
        profile, rest = self._split()
        self.fake.calls.append(("PATCH", profile, rest))
        if not self._authorised(profile):
            return self._json(401, {"error": {"message": "Invalid gateway API key"}})
        match = re.match(r"^/api/sessions/([^/]+)$", rest)
        if not match:
            return self._json(404, {"error": {"message": "no route"}})
        body = self._body()
        for row in self.fake.sessions.get(profile, []):
            if row["id"] == match.group(1):
                row["title"] = str(body.get("title") or row["title"])
        return self._json(200, {"ok": True})

    def do_DELETE(self) -> None:  # noqa: N802
        profile, rest = self._split()
        self.fake.calls.append(("DELETE", profile, rest))
        if not self._authorised(profile):
            return self._json(401, {"error": {"message": "Invalid gateway API key"}})
        match = re.match(r"^/api/sessions/([^/]+)$", rest)
        if not match:
            return self._json(404, {"error": {"message": "no route"}})
        self.fake.sessions[profile] = [
            row for row in self.fake.sessions.get(profile, []) if row["id"] != match.group(1)
        ]
        return self._json(200, {"ok": True})


class FakeServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def start() -> tuple[FakeServer, FakeHermes]:
    fake = FakeHermes()
    server = FakeServer(("127.0.0.1", 0), _Handler)
    server.fake = fake  # type: ignore[attr-defined]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, fake
