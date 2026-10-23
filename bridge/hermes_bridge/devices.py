"""Who is allowed in: a pairing code once, then a token per device.

The token the phone keeps is not a Hermes key and cannot be used anywhere but
here. The Hermes keys stay on this machine; the bridge reads them when it
needs to speak, and never puts them in an answer.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from pathlib import Path

from .config import Config

# No I, O, 0 or 1: the code is read off a terminal and typed on a phone.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _hash(value: str) -> str:
    return hashlib.sha256(value.strip().encode("utf-8")).hexdigest()


def _write_private(path: Path, text: str) -> None:
    """Write a file nobody but the bridge's user can read, atomically."""

    tmp = path.with_name(path.name + f".{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    try:
        tmp.chmod(0o600)
    except OSError:
        pass
    os.replace(tmp, path)


def new_code() -> str:
    raw = "".join(secrets.choice(_ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


class Devices:
    """The paired devices, by token hash."""

    def __init__(self, config: Config) -> None:
        self.path = config.devices_path
        self._lock = threading.Lock()
        self._devices = self._read()

    def _read(self) -> list[dict]:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return []
        rows = raw.get("devices") if isinstance(raw, dict) else None
        if not isinstance(rows, list):
            return []
        return [row for row in rows if isinstance(row, dict) and row.get("hash")]

    def _write(self) -> None:
        _write_private(
            self.path,
            json.dumps({"devices": self._devices}, indent=2) + "\n",
        )

    def add(self, name: str) -> dict:
        """Mint a token for a device. The token is returned once, never kept."""

        token = "hbr_" + secrets.token_urlsafe(32)
        row = {
            "id": "dev_" + secrets.token_hex(4),
            "name": name.strip()[:64] or "A phone",
            "hash": _hash(token),
            "createdAt": int(time.time()),
            "lastSeenAt": 0,
        }
        with self._lock:
            self._devices.append(row)
            self._write()
        return {"device": self.public(row), "token": token}

    def verify(self, token: str) -> dict | None:
        """Is this token one we minted? Constant time, and it touches lastSeen."""

        if not token:
            return None
        digest = _hash(token)
        with self._lock:
            for row in self._devices:
                if hmac.compare_digest(str(row.get("hash", "")), digest):
                    # Throttled: a chatty phone must not rewrite the file on
                    # every request.
                    now = int(time.time())
                    if now - int(row.get("lastSeenAt") or 0) > 300:
                        row["lastSeenAt"] = now
                        self._write()
                    return self.public(row)
        return None

    def list(self) -> list[dict]:
        with self._lock:
            return [self.public(row) for row in self._devices]

    def remove(self, device_id: str) -> bool:
        with self._lock:
            kept = [row for row in self._devices if row.get("id") != device_id]
            if len(kept) == len(self._devices):
                return False
            self._devices = kept
            self._write()
            return True

    def count(self) -> int:
        with self._lock:
            return len(self._devices)

    @staticmethod
    def public(row: dict) -> dict:
        return {
            "id": row.get("id"),
            "name": row.get("name"),
            "createdAt": int(row.get("createdAt") or 0),
            "lastSeenAt": int(row.get("lastSeenAt") or 0),
        }


class Pairing:
    """One code at a time, written by `python -m hermes_bridge pair`."""

    def __init__(self, config: Config) -> None:
        self.path = config.pairing_path
        self.ttl = config.pairing_ttl
        self._lock = threading.Lock()

    def mint(self) -> dict:
        code = new_code()
        expires = int(time.time()) + self.ttl
        with self._lock:
            _write_private(
                self.path,
                json.dumps({"codeHash": _hash(code), "expiresAt": expires}) + "\n",
            )
        return {"code": code, "expiresAt": expires}

    def status(self) -> dict:
        """Whether a code is waiting, without saying what it is."""

        with self._lock:
            try:
                raw = json.loads(self.path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                return {"pending": False, "expiresAt": 0}
        expires = int(raw.get("expiresAt") or 0)
        return {"pending": expires > int(time.time()), "expiresAt": expires}

    def redeem(self, code: str) -> bool:
        """Spend the code. A code works once, and only before it expires."""

        given = _hash(code.strip().upper())
        with self._lock:
            try:
                raw = json.loads(self.path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                return False
            expected = str(raw.get("codeHash") or "")
            expires = int(raw.get("expiresAt") or 0)
            if expires <= int(time.time()) or not expected:
                return False
            if not hmac.compare_digest(expected, given):
                return False
            try:
                self.path.unlink()
            except OSError:
                pass
            return True
