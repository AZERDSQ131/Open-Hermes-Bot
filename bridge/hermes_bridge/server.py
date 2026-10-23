"""The HTTP surface the phone speaks.

One contract, shaped like the screens: the bots, their conversations, one turn
at a time, and the two things that are bytes rather than words — a file and a
recording. Everything it needs from Hermes, it asks Hermes.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from . import __version__, media, prefs, profiles
from .config import Config
from .devices import Devices, Pairing
from .hermes import Hermes, HermesError
from .profiles import BotError

log = logging.getLogger("hermes_bridge")

MAX_JSON = 2 * 1024 * 1024
PAIR_WINDOW = 300.0
PAIR_ATTEMPTS = 10


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class ClientGone(Exception):
    """The phone hung up mid-answer; stop the upstream and say nothing."""


def param(match: re.Match[str], name: str) -> str:
    return unquote(match.group(name) or "")


class Bridge:
    def __init__(self, config: Config) -> None:
        self.config = config
        self.devices = Devices(config)
        self.pairing = Pairing(config)
        self.hermes = Hermes(config)


ROUTES: list[tuple[str, re.Pattern[str], str, bool]] = [
    # The root is what a person opens in a browser to check the door: a page,
    # not an API answer no one can read.
    ("GET", re.compile(r"^/$"), "_root", True),
    ("GET", re.compile(r"^/v1/health$"), "_health", True),
    ("POST", re.compile(r"^/v1/pair$"), "_pair", True),
    ("GET", re.compile(r"^/v1/bots$"), "_bots", False),
    ("POST", re.compile(r"^/v1/bots$"), "_bot_create", False),
    ("PATCH", re.compile(r"^/v1/bots/(?P<bot>[^/]+)$"), "_bot_update", False),
    ("DELETE", re.compile(r"^/v1/bots/(?P<bot>[^/]+)$"), "_bot_delete", False),
    ("GET", re.compile(r"^/v1/models$"), "_models", False),
    ("GET", re.compile(r"^/v1/sessions$"), "_sessions", False),
    ("POST", re.compile(r"^/v1/sessions$"), "_session_create", False),
    (
        "GET",
        re.compile(r"^/v1/sessions/(?P<bot>[^/]+)/(?P<session>[^/]+)/messages$"),
        "_messages",
        False,
    ),
    (
        "PATCH",
        re.compile(r"^/v1/sessions/(?P<bot>[^/]+)/(?P<session>[^/]+)$"),
        "_session_rename",
        False,
    ),
    (
        "DELETE",
        re.compile(r"^/v1/sessions/(?P<bot>[^/]+)/(?P<session>[^/]+)$"),
        "_session_delete",
        False,
    ),
    (
        "POST",
        re.compile(r"^/v1/sessions/(?P<bot>[^/]+)/(?P<session>[^/]+)/turns$"),
        "_turn",
        False,
    ),
    ("POST", re.compile(r"^/v1/attachments$"), "_attachment", False),
    ("POST", re.compile(r"^/v1/voice$"), "_voice", False),
    ("GET", re.compile(r"^/v1/prefs$"), "_prefs_read", False),
    ("PUT", re.compile(r"^/v1/prefs$"), "_prefs_write", False),
    ("GET", re.compile(r"^/v1/devices$"), "_devices", False),
    ("DELETE", re.compile(r"^/v1/devices/(?P<device>[^/]+)$"), "_device_delete", False),
]


class BridgeServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, config: Config) -> None:
        self.bridge = Bridge(config)
        self._pair_lock = threading.Lock()
        self._pair_tries: dict[str, list[float]] = {}
        super().__init__((config.host, config.port), Handler)

    def allowed_to_pair(self, address: str) -> bool:
        now = time.monotonic()
        with self._pair_lock:
            tries = [stamp for stamp in self._pair_tries.get(address, []) if now - stamp < PAIR_WINDOW]
            if len(tries) >= PAIR_ATTEMPTS:
                self._pair_tries[address] = tries
                return False
            tries.append(now)
            self._pair_tries[address] = tries
            return True


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = f"hermes-bridge/{__version__}"
    sys_version = ""

    # ----------------------------------------------------------- plumbing

    @property
    def bridge(self) -> Bridge:
        return self.server.bridge  # type: ignore[attr-defined]

    @property
    def config(self) -> Config:
        return self.bridge.config

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003 - stdlib name
        log.debug("%s %s", self.address_string(), fmt % args)

    def do_GET(self) -> None:  # noqa: N802 - stdlib name
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch("POST")

    def do_PUT(self) -> None:  # noqa: N802
        self._dispatch("PUT")

    def do_PATCH(self) -> None:  # noqa: N802
        self._dispatch("PATCH")

    def do_DELETE(self) -> None:  # noqa: N802
        self._dispatch("DELETE")

    def do_OPTIONS(self) -> None:  # noqa: N802
        # The same app also runs in a browser (Expo web). The preflight is the
        # browser's question; the token is still what opens anything.
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, X-Filename"
        )
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Max-Age", "600")

    def _dispatch(self, method: str) -> None:
        started = time.monotonic()
        parsed = urlsplit(self.path)
        path = parsed.path
        if len(path) > 1:
            path = path.rstrip("/")
        query = parse_qs(parsed.query)
        self.streaming = False
        status = 500
        try:
            for route_method, pattern, name, public in ROUTES:
                if route_method != method:
                    continue
                match = pattern.match(path)
                if not match:
                    continue
                if not public:
                    token = self._bearer()
                    if not token or not self.bridge.devices.verify(token):
                        raise ApiError(
                            401,
                            "unauthorized",
                            "This device is not paired with the bridge. Pair it in Setup.",
                        )
                handler = getattr(self, name)
                status = handler(match, query) or 200
                return
            raise ApiError(404, "not_found", f"No route for {method} {path}")
        except ApiError as exc:
            status = self._error(exc.status, exc.code, exc.message)
        except HermesError as exc:
            status = self._error(exc.status, exc.code, exc.message)
        except BotError as exc:
            status = self._error(exc.status, exc.code, exc.message)
        except media.MediaError as exc:
            status = self._error(exc.status, exc.code, exc.message)
        except ClientGone:
            status = 499
        except (BrokenPipeError, ConnectionResetError):
            status = 499
        except Exception:  # noqa: BLE001 - a last resort, never a leak
            log.error("unhandled on %s %s\n%s", method, path, traceback.format_exc())
            try:
                status = self._error(500, "internal", "The bridge failed to answer.")
            except OSError:
                status = 500
        finally:
            log.info(
                "%s %s %s %dms",
                method,
                path,
                getattr(self, "_status", status),
                int((time.monotonic() - started) * 1000),
            )

    def _bearer(self) -> str:
        header = self.headers.get("Authorization") or ""
        if header.lower().startswith("bearer "):
            return header[7:].strip()
        return ""

    def _json(self, status: int, payload: dict) -> int:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(raw)
        self.wfile.flush()
        self.close_connection = True
        self._status = status
        return status

    def _error(self, status: int, code: str, message: str) -> int:
        if self.streaming:
            # The headers are gone; the only honest thing left is an event.
            try:
                self._sse("error", {"code": code, "message": message})
            except ClientGone:
                pass
            return status
        return self._json(status, {"error": {"code": code, "message": message}})

    # ------------------------------------------------------------- bodies

    def _length(self) -> int:
        raw = self.headers.get("Content-Length")
        try:
            return max(0, int(raw or 0))
        except ValueError:
            raise ApiError(400, "bad_length", "The request has no usable length.")

    def _json_body(self) -> dict:
        length = self._length()
        if length == 0:
            return {}
        if length > MAX_JSON:
            raise ApiError(413, "too_large", "That request is too large.")
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ApiError(400, "bad_json", "That request was not JSON.")
        if not isinstance(payload, dict):
            raise ApiError(400, "bad_json", "That request was not a JSON object.")
        return payload

    def _raw_body(self) -> bytes:
        length = self._length()
        if length <= 0:
            raise ApiError(400, "empty", "Nothing was sent.")
        if length > self.config.max_upload_bytes:
            raise ApiError(
                413,
                "too_large",
                f"The file is larger than {self.config.max_upload_bytes // (1024 * 1024)} MB.",
            )
        return self.rfile.read(length)

    # --------------------------------------------------------------- sse

    def _sse_start(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("X-Accel-Buffering", "no")
        self._cors()
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        self.streaming = True
        self._status = 200
        self._write_sse(": connected\n\n")

    def _write_sse(self, text: str) -> None:
        try:
            self.wfile.write(text.encode("utf-8"))
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError) as exc:
            raise ClientGone() from exc

    def _sse(self, event: str, data: dict) -> None:
        self._write_sse(f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n")

    # ------------------------------------------------------------- health

    def _root(self, match, query) -> int:
        health = self.bridge.hermes.health()
        pairing = self.bridge.pairing.status()
        state = "Hermes is answering." if health["ok"] else "Hermes is not answering."
        tone = "#4f9d8f" if health["ok"] else "#e09248"
        hint = (
            "A pairing code is waiting for a phone."
            if pairing["pending"]
            else "No pairing code is waiting: mint one on the host with "
            "<code>python3 -m hermes_bridge pair</code>."
        )
        body = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hermes Bridge</title>
<style>
  :root {{ color-scheme: dark }}
  body {{ margin: 0; min-height: 100vh; display: grid; place-items: center;
          background: #0f0f11; color: #e8e8ec;
          font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif }}
  main {{ padding: 32px 24px; max-width: 30rem }}
  h1 {{ margin: 0 0 6px; font-size: 1.35rem; letter-spacing: -0.02em }}
  .state {{ margin: 18px 0 6px; font-weight: 600; color: {tone} }}
  p {{ margin: 6px 0; color: #9d9da4 }}
  code {{ background: #1b1b1d; padding: 1px 5px; border-radius: 4px; color: #e8e8ec }}
  a {{ color: #8fb8ff }}
</style>
</head>
<body>
<main>
  <h1>Hermes Bridge</h1>
  <p>Version {__version__} — the door between a phone and Hermes.</p>
  <p class="state">{state}</p>
  <p>{hint}</p>
  <p>Machine-readable: <a href="/v1/health">/v1/health</a>.</p>
</main>
</body>
</html>
"""
        raw = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(raw)
        self.wfile.flush()
        self.close_connection = True
        self._status = 200
        return 200

    def _health(self, match, query) -> int:
        hermes = self.bridge.hermes.health()
        return self._json(
            200,
            {
                "ok": True,
                "service": "hermes-bridge",
                "version": __version__,
                "hermes": hermes,
                "pairing": {
                    "required": self.bridge.devices.count() == 0,
                    **self.bridge.pairing.status(),
                },
                "time": int(time.time()),
            },
        )

    def _pair(self, match, query) -> int:
        if not self.server.allowed_to_pair(self.client_address[0]):  # type: ignore[attr-defined]
            raise ApiError(429, "too_many", "Too many attempts. Wait a few minutes, then try again.")
        body = self._json_body()
        code = str(body.get("code") or "")
        name = str(body.get("name") or "iPhone")
        if not self.bridge.pairing.redeem(code):
            raise ApiError(401, "bad_code", "That code is wrong or has expired.")
        minted = self.bridge.devices.add(name)
        log.info("paired a new device: %s", minted["device"]["name"])
        return self._json(201, minted)

    # --------------------------------------------------------------- bots

    def _bots(self, match, query) -> int:
        return self._json(200, {"bots": profiles.list_bots(self.config)})

    def _bot_create(self, match, query) -> int:
        body = self._json_body()
        bot = profiles.create_bot(
            self.config,
            name=str(body.get("name") or ""),
            title=str(body.get("title") or ""),
            color=str(body.get("color") or ""),
            shape=str(body.get("shape") or ""),
            description=str(body.get("description") or ""),
        )
        return self._json(201, {"bot": bot})

    def _bot_update(self, match, query) -> int:
        bot = profiles.update_bot(self.config, param(match, "bot"), self._json_body())
        return self._json(200, {"bot": bot})

    def _bot_delete(self, match, query) -> int:
        gone = profiles.delete_bot(self.config, param(match, "bot"))
        return self._json(200, gone)

    # ------------------------------------------------------------- models

    def _models(self, match, query) -> int:
        bot_id = (query.get("bot") or [profiles.PRIMARY])[0]
        profiles.get_bot(self.config, bot_id)
        return self._json(
            200, {"bot": bot_id, "models": self.bridge.hermes.models(profiles.profile_of(bot_id))}
        )

    # ----------------------------------------------------------- sessions

    def _sessions(self, match, query) -> int:
        wanted = (query.get("bot") or [""])[0]
        bots = [profiles.get_bot(self.config, wanted)] if wanted else profiles.list_bots(self.config)
        errors = []

        def fetch(bot: dict) -> list[dict]:
            try:
                return self.bridge.hermes.sessions(bot["id"])
            except HermesError as exc:
                errors.append({"bot": bot["id"], "code": exc.code, "message": exc.message})
                return []

        with ThreadPoolExecutor(max_workers=max(1, min(4, len(bots)))) as pool:
            rows = [row for batch in pool.map(fetch, bots) for row in batch]
        rows.sort(key=lambda row: row["lastActive"], reverse=True)
        return self._json(200, {"sessions": rows, "errors": errors})

    def _session_create(self, match, query) -> int:
        body = self._json_body()
        bot_id = str(body.get("bot") or profiles.PRIMARY)
        bot = profiles.get_bot(self.config, bot_id)
        title = str(body.get("title") or "New conversation").strip()[:120] or "New conversation"
        created = self.bridge.hermes.create_session(profiles.profile_of(bot["id"]), title)
        return self._json(
            201,
            {
                "session": {
                    "bot": bot["id"],
                    "id": created["id"],
                    "title": created["title"],
                    "messageCount": 0,
                    "lastActive": int(time.time()),
                    "archived": False,
                }
            },
        )

    def _session_rename(self, match, query) -> int:
        bot_id = param(match, "bot")
        profiles.get_bot(self.config, bot_id)
        body = self._json_body()
        title = str(body.get("title") or "").strip()[:120]
        if not title:
            raise ApiError(400, "no_title", "A conversation needs a name.")
        self.bridge.hermes.rename_session(
            profiles.profile_of(bot_id), param(match, "session"), title
        )
        return self._json(200, {"ok": True, "title": title})

    def _session_delete(self, match, query) -> int:
        bot_id = param(match, "bot")
        profiles.get_bot(self.config, bot_id)
        self.bridge.hermes.delete_session(
            profiles.profile_of(bot_id), param(match, "session")
        )
        return self._json(200, {"ok": True})

    def _messages(self, match, query) -> int:
        bot_id = param(match, "bot")
        profiles.get_bot(self.config, bot_id)
        try:
            limit = int((query.get("limit") or ["200"])[0])
        except ValueError:
            limit = 200
        limit = min(max(limit, 1), 500)
        rows = self.bridge.hermes.messages(
            profiles.profile_of(bot_id), param(match, "session"), limit
        )
        return self._json(200, {"messages": rows})

    # -------------------------------------------------------------- turns

    def _turn(self, match, query) -> int:
        bot_id = param(match, "bot")
        session_id = param(match, "session")
        bot = profiles.get_bot(self.config, bot_id)
        profile = profiles.profile_of(bot["id"])
        body = self._json_body()
        message = str(body.get("message") or "")
        if not message.strip():
            raise ApiError(400, "empty_message", "An empty message is not a turn.")
        model = str(body.get("model") or "").strip()[:200]
        provider = str(body.get("provider") or "").strip()[:80]
        if not self.bridge.hermes.key_for(profile):
            raise ApiError(
                409,
                "no_key",
                f"{bot['name']} has no API key yet — set API_SERVER_KEY in "
                f"{self.config.profile_env(profile)} and restart the Hermes gateway.",
            )

        self._sse_start()
        text = ""
        failure = ""
        stream = self.bridge.hermes.stream_turn(profile, session_id, message, model, provider)
        try:
            for event, data in stream:
                if event == "assistant.delta" and data.get("delta"):
                    text += str(data["delta"])
                    self._sse("delta", {"text": str(data["delta"])})
                elif event == "tool.started" and data.get("tool_name"):
                    self._sse("tool", {"tool": str(data["tool_name"])})
                elif event == "keepalive":
                    self._write_sse(": keepalive\n\n")
                elif event == "assistant.completed":
                    final = data.get("text")
                    content = data.get("message")
                    if not isinstance(final, str) and isinstance(content, dict):
                        final = content.get("content")
                    if isinstance(final, str) and final and not text:
                        text = final
                elif event == "error":
                    failure = str(data.get("message") or "The bot stopped before answering.")
                elif event == "run.failed":
                    failure = failure or "The bot could not finish this turn."
                elif event == "done":
                    break
        except HermesError as exc:
            self._sse("error", {"code": exc.code, "message": exc.message})
            return 200
        finally:
            # Closing the upstream is how Hermes is told to stop the run when
            # the phone has already gone.
            stream.close()
        if failure:
            self._sse("error", {"code": "turn_failed", "message": failure})
            return 200
        self._sse("done", {"text": text, "sessionId": session_id})
        return 200

    # -------------------------------------------------------- bytes, both

    def _attachment(self, match, query) -> int:
        data = self._raw_body()
        filename = (query.get("filename") or [""])[0] or self.headers.get("X-Filename") or "file"
        mime = (self.headers.get("Content-Type") or "application/octet-stream").split(";")[0]
        saved = media.save_upload(self.config, filename, mime, data)
        return self._json(201, saved)

    def _voice(self, match, query) -> int:
        data = self._raw_body()
        mime = (self.headers.get("Content-Type") or "audio/m4a").split(";")[0]
        saved = media.save_upload(self.config, f"voice.{media.audio_extension(mime)}", mime, data)
        transcript = media.transcribe(self.config, Path(saved["path"]))
        return self._json(200, {"transcript": transcript, "path": saved["path"]})

    # ------------------------------------------------------------- prefs

    def _prefs_read(self, match, query) -> int:
        return self._json(200, {"prefs": prefs.read(self.config)})

    def _prefs_write(self, match, query) -> int:
        body = self._json_body()
        value = body.get("prefs")
        if not isinstance(value, dict):
            raise ApiError(400, "bad_prefs", "Preferences are a JSON object.")
        prefs.write(self.config, value)
        return self._json(200, {"prefs": prefs.read(self.config)})

    # ----------------------------------------------------------- devices

    def _devices(self, match, query) -> int:
        return self._json(200, {"devices": self.bridge.devices.list()})

    def _device_delete(self, match, query) -> int:
        if not self.bridge.devices.remove(param(match, "device")):
            raise ApiError(404, "no_device", "No device with that id.")
        return self._json(200, {"ok": True})
