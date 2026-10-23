"""Speaking to Hermes, the way the desktop app already speaks to it.

The API server answers on loopback, under the prefix of the profile a call is
about (`/p/<name>`), and checks that prefix against that profile's own
`API_SERVER_KEY`. The bridge reads those keys off the disk — it runs on the same
machine — and never hands one out.
"""

from __future__ import annotations

import http.client
import json
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from .config import Config

PRIMARY = "default"


class HermesError(Exception):
    """A failure that is already a sentence, with a code the phone maps."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def read_env_value(path: Path, key: str) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        if name.strip() != key:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        return value
    return ""


def _error_message(payload: object, fallback: str) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])
        if isinstance(error, str) and error:
            return error
        for key in ("detail", "message", "error_description"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return fallback


class Hermes:
    def __init__(self, config: Config) -> None:
        self.config = config
        parsed = urllib.parse.urlsplit(config.hermes_url)
        self.scheme = parsed.scheme or "http"
        self.host = parsed.hostname or "127.0.0.1"
        self.port = parsed.port or (443 if self.scheme == "https" else 80)
        self.prefix = parsed.path.rstrip("/")

    # ------------------------------------------------------------- the keys

    def key_for(self, profile: str) -> str:
        return read_env_value(self.config.profile_env(profile), "API_SERVER_KEY")

    def has_key(self, profile: str) -> bool:
        return bool(self.key_for(profile))

    def _auth(self, profile: str) -> dict:
        key = self.key_for(profile)
        if not key:
            raise HermesError(
                409,
                "no_key",
                f"The bot {profile} has no API key yet — set API_SERVER_KEY in "
                f"{self.config.profile_env(profile)} and restart the Hermes gateway.",
            )
        return {"Authorization": f"Bearer {key}"}

    # ------------------------------------------------------------ the paths

    def api_path(self, profile: str, path: str) -> str:
        prefix = "" if profile == PRIMARY else f"/p/{urllib.parse.quote(profile, safe='')}"
        return f"{self.prefix}{prefix}{path}"

    # ----------------------------------------------------------- the calls

    def _call(
        self,
        profile: str,
        method: str,
        path: str,
        body: dict | None = None,
        timeout: float | None = None,
    ) -> dict:
        data = None if body is None else json.dumps(body).encode("utf-8")
        headers = {"Accept": "application/json", **self._auth(profile)}
        if data is not None:
            headers["Content-Type"] = "application/json"
        url = f"{self.scheme}://{self.host}:{self.port}{self.api_path(profile, path)}"
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(
                request, timeout=timeout or self.config.request_timeout
            ) as response:
                raw = response.read()
                status = response.status
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            status = exc.code
        except (urllib.error.URLError, socket.timeout, TimeoutError, OSError) as exc:
            raise HermesError(
                502,
                "unreachable",
                "Hermes is not answering — is the gateway running on this machine? "
                f"({getattr(exc, 'reason', exc)})",
            ) from exc

        try:
            payload = json.loads(raw.decode("utf-8")) if raw else {}
        except (ValueError, UnicodeDecodeError):
            payload = {}

        if status >= 400:
            if status == 401:
                raise HermesError(
                    401,
                    "bad_key",
                    f"Hermes refused the key of {profile}. "
                    "The API_SERVER_KEY of that profile does not match the gateway's.",
                )
            raise HermesError(
                status,
                "hermes_error",
                _error_message(payload, f"Hermes answered HTTP {status}"),
            )
        if not isinstance(payload, dict):
            return {"data": payload}
        return payload

    # ---------------------------------------------------------- the probes

    def reachable(self) -> bool:
        try:
            with socket.create_connection((self.host, self.port), timeout=1.5):
                return True
        except OSError:
            return False

    def health(self) -> dict:
        ok = self.reachable()
        return {
            "ok": ok,
            "url": self.config.hermes_url,
            "primaryKey": self.has_key(PRIMARY),
        }

    # --------------------------------------------------------- the sessions

    def sessions(self, profile: str, limit: int = 100, pages: int = 5) -> list[dict]:
        """The conversations a bot holds, newest first, without duplicates."""

        rows: list[dict] = []
        seen: set[str] = set()
        offset = 0
        for _ in range(pages):
            payload = self._call(
                profile,
                "GET",
                f"/api/sessions?limit={limit}&offset={offset}&order=recent&source=api_server",
            )
            batch = payload.get("data") or payload.get("sessions") or []
            if not isinstance(batch, list) or not batch:
                break
            for row in batch:
                if not isinstance(row, dict):
                    continue
                session_id = str(row.get("id") or "").strip()
                if not session_id or session_id in seen:
                    continue
                seen.add(session_id)
                rows.append(
                    {
                        "bot": profile,
                        "id": session_id,
                        "title": str(row.get("title") or ""),
                        "messageCount": int(row.get("message_count") or 0),
                        "lastActive": int(row.get("last_active") or 0),
                        "archived": bool(row.get("archived")),
                    }
                )
            if payload.get("has_more") is False or len(batch) < limit:
                break
            offset += len(batch)
        return rows

    def messages(self, profile: str, session_id: str, limit: int = 200) -> list[dict]:
        payload = self._call(
            profile,
            "GET",
            f"/api/sessions/{urllib.parse.quote(session_id, safe='')}"
            f"/messages?limit={limit}&order=oldest&inline_images=false",
        )
        rows = payload.get("data") or payload.get("messages") or []
        out = []
        for row in rows if isinstance(rows, list) else []:
            if not isinstance(row, dict):
                continue
            content = row.get("content")
            if isinstance(content, list):
                # Some rows carry the content as parts; the phone shows text.
                content = "".join(
                    str(part.get("text") or "")
                    for part in content
                    if isinstance(part, dict)
                )
            out.append(
                {
                    "role": str(row.get("role") or ""),
                    "content": content if isinstance(content, str) else "",
                    "timestamp": int(row.get("timestamp") or 0),
                }
            )
        return out

    def create_session(self, profile: str, title: str) -> dict:
        """Open a conversation. A taken title gets a suffix, not a failure."""

        attempted = title
        try:
            payload = self._call(profile, "POST", "/api/sessions", {"title": attempted})
        except HermesError as exc:
            if exc.status != 409:
                raise
            attempted = f"{title} · {int(time.time()) % 100000}"
            payload = self._call(profile, "POST", "/api/sessions", {"title": attempted})
        session = payload.get("session") if isinstance(payload.get("session"), dict) else {}
        session_id = str(session.get("id") or payload.get("id") or "").strip()
        if not session_id:
            raise HermesError(502, "no_session", "Hermes did not return a session id")
        return {
            "id": session_id,
            "title": str(session.get("title") or attempted),
        }

    def rename_session(self, profile: str, session_id: str, title: str) -> None:
        self._call(
            profile,
            "PATCH",
            f"/api/sessions/{urllib.parse.quote(session_id, safe='')}",
            {"title": title},
        )

    def delete_session(self, profile: str, session_id: str) -> None:
        self._call(
            profile,
            "DELETE",
            f"/api/sessions/{urllib.parse.quote(session_id, safe='')}",
        )

    def models(self, profile: str) -> dict:
        payload = self._call(profile, "GET", "/api/model/options")
        providers = []
        for provider in payload.get("providers") or []:
            if not isinstance(provider, dict):
                continue
            # A provider nobody authenticated cannot run a turn: offering it
            # would be offering a choice that fails on send.
            if not provider.get("authenticated"):
                continue
            models = []
            for model in provider.get("models") or []:
                model_id = model if isinstance(model, str) else (model or {}).get("id")
                if not model_id:
                    continue
                models.append(
                    {
                        "id": str(model_id),
                        "name": str(
                            (model or {}).get("name")
                            if isinstance(model, dict)
                            else ""
                        )
                        or str(model_id),
                    }
                )
            if not models:
                continue
            providers.append(
                {
                    "slug": str(provider.get("slug") or ""),
                    "name": str(provider.get("name") or provider.get("slug") or ""),
                    "models": models,
                }
            )
        current = str(payload.get("model") or "")
        provider = str(payload.get("provider") or "")
        # Hermes names its current model with the provider in front
        # ("opencode-go/muse-spark-1.3-contributor"), while a turn wants the two
        # apart. A provider of "auto" names nothing: the answer is in the list.
        if current and "/" in current:
            prefix, rest = current.split("/", 1)
            if any(
                entry["slug"] == prefix
                and any(model["id"] == rest for model in entry["models"])
                for entry in providers
            ):
                current, provider = rest, prefix
        if provider in ("", "auto"):
            for entry in providers:
                if any(model["id"] == current for model in entry["models"]):
                    provider = entry["slug"]
                    break
        return {
            "current": current,
            "currentProvider": provider if provider != "auto" else "",
            "providers": providers,
        }

    # ------------------------------------------------------------- a turn

    def stream_turn(
        self,
        profile: str,
        session_id: str,
        message: str,
        model: str = "",
        provider: str = "",
    ):
        """One agent turn, as Hermes writes it.

        Yields `(event, data)` pairs. The connection is closed by the caller
        when the phone goes away, and closing it is how Hermes is told to stop
        the run — the same thing the desktop app does.
        """

        headers = {
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
            **self._auth(profile),
        }
        body: dict = {"message": message}
        if model:
            body["model"] = model
            # The session remembers the model of its last turn, and Hermes
            # prefers that over the body: the lock makes the picker's choice
            # the one that actually runs.
            body["require_model_lock"] = True
        if provider:
            body["provider"] = provider

        path = self.api_path(
            profile,
            f"/api/sessions/{urllib.parse.quote(session_id, safe='')}/chat/stream",
        )
        connection_class = (
            http.client.HTTPSConnection
            if self.scheme == "https"
            else http.client.HTTPConnection
        )
        connection = connection_class(
            self.host, self.port, timeout=self.config.turn_silence
        )
        try:
            connection.request("POST", path, body=json.dumps(body).encode("utf-8"), headers=headers)
            response = connection.getresponse()
            if response.status >= 400:
                raw = response.read()
                try:
                    payload = json.loads(raw.decode("utf-8"))
                except (ValueError, UnicodeDecodeError):
                    payload = {}
                raise HermesError(
                    response.status,
                    "hermes_error",
                    _error_message(payload, f"Hermes answered HTTP {response.status}"),
                )

            started = time.monotonic()
            lines: list[str] = []
            while True:
                if time.monotonic() - started > self.config.turn_limit:
                    raise HermesError(
                        504,
                        "timeout",
                        "The bot took more than five minutes to answer.",
                    )
                try:
                    raw_line = response.readline()
                except (socket.timeout, TimeoutError) as exc:
                    raise HermesError(
                        504,
                        "silent",
                        "The bot stopped answering — the model may be out of quota, "
                        "or the server cannot reach it. Try another model.",
                    ) from exc
                if not raw_line:
                    break
                line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
                if line == "":
                    event = _parse_frame(lines)
                    lines = []
                    if event:
                        yield event
                    continue
                lines.append(line)
            event = _parse_frame(lines)
            if event:
                yield event
        except (ConnectionError, socket.timeout, TimeoutError, OSError) as exc:
            raise HermesError(
                502,
                "unreachable",
                f"The connection to Hermes dropped: {exc}",
            ) from exc
        finally:
            connection.close()


def _parse_frame(lines: list[str]) -> tuple[str, dict] | None:
    if not lines:
        return None
    name = "message"
    data: list[str] = []
    for line in lines:
        if line.startswith(":"):
            continue
        if line.startswith("event:"):
            name = line[6:].strip()
        elif line.startswith("data:"):
            data.append(line[5:].lstrip())
    if not data:
        # A comment frame is a keepalive: pass it on as one, so a long turn
        # keeps the phone's connection warm through the proxy.
        return ("keepalive", {}) if any(line.startswith(":") for line in lines) else None
    raw = "\n".join(data)
    try:
        parsed = json.loads(raw)
    except ValueError:
        parsed = {"text": raw}
    return name, parsed if isinstance(parsed, dict) else {"value": parsed}
