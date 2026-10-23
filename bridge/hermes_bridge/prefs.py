"""What the person chose, kept where the desktop app keeps it.

The models the picker offers, the ones pinned, the model each bot falls back
to: all of it is `ui_meta.hermes-bot` in the primary profile's `profile.yaml`.
The phone writes the same block, so the two apps agree without either of them
keeping a copy.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path

import yaml

from .config import Config

_lock = threading.Lock()

# The app was called Grok Bot before: those preferences are read once, so the
# rename costs the person nothing.
LEGACY_KEY = "grok-bot"
KEY = "hermes-bot"


def _path(config: Config) -> Path:
    return config.hermes_home / "profile.yaml"


def read(config: Config) -> dict:
    path = _path(config)
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    ui = data.get("ui_meta") if isinstance(data.get("ui_meta"), dict) else {}
    prefs = ui.get(KEY)
    if not isinstance(prefs, dict) or not prefs:
        legacy = ui.get(LEGACY_KEY)
        prefs = legacy if isinstance(legacy, dict) else {}
    return dict(prefs)


def write(config: Config, prefs: dict) -> None:
    path = _path(config)
    with _lock:
        data: dict = {}
        try:
            loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data = loaded
        except (OSError, yaml.YAMLError):
            data = {}
        ui = data.get("ui_meta") if isinstance(data.get("ui_meta"), dict) else {}
        ui[KEY] = prefs if isinstance(prefs, dict) else {}
        data["ui_meta"] = ui
        tmp = path.with_name(path.name + ".bridge-tmp")
        tmp.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")
        os.replace(tmp, path)
