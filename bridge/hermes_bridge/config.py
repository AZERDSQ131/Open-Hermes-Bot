"""Where the bridge lives, and where Hermes lives.

The bridge is a small process that sits next to Hermes and answers the phone.
It owns nothing: the conversations, the bots and the preferences stay in
`~/.hermes`. What it does own is the list of devices allowed to call it, which
lives in its own state directory.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, replace
from pathlib import Path


def _hermes_home() -> Path:
    return Path(os.path.expanduser(os.environ.get("HERMES_HOME") or "~/.hermes"))


def _state_dir() -> Path:
    return Path(
        os.path.expanduser(os.environ.get("HERMES_BRIDGE_HOME") or "~/.hermes-bridge")
    )


@dataclass(frozen=True)
class Config:
    """Everything the bridge needs to know about the machine it runs on."""

    host: str = "127.0.0.1"
    port: int = 8765
    # The Hermes API server, as the desktop app addresses it: the gateway on
    # loopback, one profile per bot under /p/<name>.
    hermes_url: str = "http://127.0.0.1:8642"
    hermes_home: Path = field(default_factory=_hermes_home)
    state_dir: Path = field(default_factory=_state_dir)
    # A recorded voice note and an attached file are the same order of size:
    # a few megabytes, never a video.
    max_upload_bytes: int = 25 * 1024 * 1024
    # A pairing code is short-lived: it is printed, typed, and forgotten.
    pairing_ttl: int = 20 * 60
    request_timeout: float = 30.0
    # Silence is the signal: a turn whose upstream says nothing for this long
    # is treated as dead, and the phone is told rather than left waiting.
    turn_silence: float = 45.0
    turn_limit: float = 5 * 60.0

    @property
    def config_path(self) -> Path:
        return self.state_dir / "config.json"

    @property
    def devices_path(self) -> Path:
        return self.state_dir / "devices.json"

    @property
    def pairing_path(self) -> Path:
        return self.state_dir / "pairing.json"

    @property
    def profiles_dir(self) -> Path:
        return self.hermes_home / "profiles"

    @property
    def attachments_dir(self) -> Path:
        return self.hermes_home / "attachments"

    def profile_dir(self, profile: str) -> Path:
        """`default` is not a directory: the primary profile is the home."""
        return self.hermes_home if profile == "default" else self.profiles_dir / profile

    def profile_env(self, profile: str) -> Path:
        return self.profile_dir(profile) / ".env"


def load(path: Path | None = None) -> Config:
    """Read `config.json` when it exists, then let the environment win.

    Every field can be overridden by an environment variable, which is how the
    tests run a bridge against a temporary Hermes home.
    """

    config = Config()
    candidates = [path] if path else [config.config_path]
    for candidate in candidates:
        try:
            raw = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(raw, dict):
            continue
        known = {
            key: raw[key]
            for key in ("host", "port", "hermes_url", "max_upload_bytes", "request_timeout")
            if key in raw
        }
        if "port" in known:
            try:
                known["port"] = int(known["port"])
            except (TypeError, ValueError):
                known.pop("port")
        if "max_upload_bytes" in known:
            try:
                known["max_upload_bytes"] = int(known["max_upload_bytes"])
            except (TypeError, ValueError):
                known.pop("max_upload_bytes")
        if "request_timeout" in known:
            try:
                known["request_timeout"] = float(known["request_timeout"])
            except (TypeError, ValueError):
                known.pop("request_timeout")
        if isinstance(raw.get("hermes_home"), str) and raw["hermes_home"]:
            known["hermes_home"] = Path(os.path.expanduser(raw["hermes_home"]))
        config = replace(config, **known)
        break

    host = os.environ.get("HERMES_BRIDGE_HOST")
    port = os.environ.get("HERMES_BRIDGE_PORT")
    hermes_url = os.environ.get("HERMES_BRIDGE_HERMES_URL")
    if host:
        config = replace(config, host=host)
    if port:
        try:
            config = replace(config, port=int(port))
        except ValueError:
            pass
    if hermes_url:
        config = replace(config, hermes_url=hermes_url)
    return config


def ensure_state(config: Config) -> None:
    """The state directory holds device tokens: nobody else reads it."""

    config.state_dir.mkdir(parents=True, exist_ok=True)
    try:
        config.state_dir.chmod(0o700)
    except OSError:
        pass
