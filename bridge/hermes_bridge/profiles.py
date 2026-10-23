"""A bot is a Hermes profile.

The bridge does not invent a second kind of bot: it reads the profiles Hermes
already has, and lays a new one out the way Hermes expects it — the same
directories, the same `profile.yaml` metadata the desktop app reads, and a key
of its own so one bot's turn can never ride another's.
"""

from __future__ import annotations

import os
import re
import secrets
import shutil
import subprocess
import sys
import time
import zlib
from pathlib import Path

import yaml

from .config import Config

PRIMARY = "default"

# Names Hermes itself reserves, plus the primary profile's id.
RESERVED = {"default", "hermes", "test", "tmp", "root", "sudo"}
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
COLOR_RE = re.compile(
    r"^(?:#[0-9a-fA-F]{3,8}|hsl\(\s*\d{1,3}(?:\.\d+)?\s+\d{1,3}%\s+\d{1,3}%\s*\))$"
)
SHAPE_RE = re.compile(r"^[a-z-]{1,24}$")

# The face of a bot, when nobody has painted one. Deterministic, so the same
# bot looks the same on every device.
COLORS = ("#8b5cf6", "#4f9d8f", "#e152b0", "#3f6fd1", "#e09248", "#2fbfa0")
SHAPES = ("cercle", "capsule", "nuage", "hexagone", "galet", "goutte")

# A bot's account belongs to one profile: messaging tokens and the primary's
# server key stay behind. The new profile mints a key of its own below.
DROP_ENV = re.compile(
    r"^(?:API_SERVER_KEY|API_SERVER_PORT|API_SERVER_HOST|API_SERVER_ENABLED"
    r"|GATEWAY_ALLOW_ALL_USERS|GATEWAY_ALLOWED_USERS|GATEWAY_RELAY_[A-Z_]*"
    r"|TELEGRAM_[A-Z_]*|DISCORD_[A-Z_]*|SLACK_[A-Z_]*|WHATSAPP_[A-Z_]*"
    r"|SIGNAL_[A-Z_]*|IMESSAGE_[A-Z_]*|MATRIX_[A-Z_]*|TEAMS_[A-Z_]*"
    r"|WECOM_[A-Z_]*|QQ_[A-Z_]*|SMS_[A-Z_]*)="
)


class BotError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def face_for(name: str) -> tuple[str, str]:
    seed = zlib.crc32(name.encode("utf-8"))
    return COLORS[seed % len(COLORS)], SHAPES[(seed // 7) % len(SHAPES)]


def clean_color(value: str) -> str:
    color = (value or "").strip()
    return color if COLOR_RE.match(color) else ""


def clean_shape(value: str) -> str:
    shape = (value or "").strip()
    return shape if SHAPE_RE.match(shape) else ""


def profile_of(bot_id: str) -> str:
    """The profile a bot id names. The primary bot has a name of its own."""

    bot_id = (bot_id or "").strip()
    return PRIMARY if bot_id == PRIMARY else bot_id


def _meta_path(config: Config, profile: str) -> Path:
    return config.profile_dir(profile) / "profile.yaml"


def read_meta(config: Config, profile: str) -> dict:
    path = _meta_path(config, profile)
    data: dict = {}
    try:
        loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            data = loaded
    except (OSError, yaml.YAMLError):
        data = {}
    ui = data.get("ui_meta") if isinstance(data.get("ui_meta"), dict) else {}
    bots = ui.get("hermes-bots") if isinstance(ui.get("hermes-bots"), dict) else {}
    return {
        "title": str(bots.get("title") or "").strip(),
        "color": str(bots.get("color") or "").strip(),
        "shape": str(bots.get("shape") or "").strip(),
        "description": str(data.get("description") or "").strip(),
    }


def write_meta(config: Config, profile: str, fields: dict) -> dict:
    """Write only what was given, and only when it really changes.

    The desktop app reads the same block; a colour picked there must not be
    overwritten by a guess from here.
    """

    path = _meta_path(config, profile)
    data: dict = {}
    try:
        loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            data = loaded
    except (OSError, yaml.YAMLError):
        data = {}

    ui = data.get("ui_meta") if isinstance(data.get("ui_meta"), dict) else {}
    bots = ui.get("hermes-bots") if isinstance(ui.get("hermes-bots"), dict) else {}

    if "title" in fields and fields["title"]:
        bots["title"] = fields["title"]
    if "color" in fields and fields["color"]:
        bots["color"] = fields["color"]
    if "shape" in fields and fields["shape"]:
        bots["shape"] = fields["shape"]
    if "description" in fields:
        data["description"] = fields["description"]
        data["description_auto"] = False
    ui["hermes-bots"] = bots
    data["ui_meta"] = ui

    tmp = path.with_name(path.name + ".bridge-tmp")
    tmp.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")
    os.replace(tmp, path)
    return read_meta(config, profile)


def list_bots(config: Config) -> list[dict]:
    """Every bot on this machine: the primary first, then the profiles."""

    primary = read_meta(config, PRIMARY)
    color, shape = face_for(PRIMARY)
    bots = [
        {
            "id": PRIMARY,
            "profile": PRIMARY,
            "name": primary["title"] or "Hermes",
            "title": primary["title"],
            "description": primary["description"],
            "color": primary["color"] or color,
            "shape": primary["shape"] or shape,
            "primary": True,
            "hasKey": bool(_env_key(config, PRIMARY)),
        }
    ]

    root = config.profiles_dir
    try:
        children = sorted(root.iterdir()) if root.is_dir() else []
    except OSError:
        children = []
    for child in children:
        name = child.name
        if not child.is_dir() or name.startswith(".") or not NAME_RE.match(name):
            continue
        if (root / ".deleted" / name).exists():
            continue
        meta = read_meta(config, name)
        color, shape = face_for(name)
        bots.append(
            {
                "id": name,
                "profile": name,
                "name": meta["title"] or name.replace("-", " ").title(),
                "title": meta["title"],
                "description": meta["description"],
                "color": meta["color"] or color,
                "shape": meta["shape"] or shape,
                "primary": False,
                "hasKey": bool(_env_key(config, name)),
            }
        )
    return bots


def get_bot(config: Config, bot_id: str) -> dict:
    for bot in list_bots(config):
        if bot["id"] == bot_id:
            return bot
    raise BotError(404, "no_bot", f"No bot called {bot_id}")


def _env_key(config: Config, profile: str) -> str:
    path = config.profile_env(profile)
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    for line in text.splitlines():
        if line.startswith("API_SERVER_KEY="):
            return line.partition("=")[2].strip()
    return ""


def _link_or_copy(source: str, target: str) -> str:
    """Skills are copied by hard link: same bytes, no second 52 MB."""

    try:
        os.link(source, target)
        return target
    except OSError:
        return shutil.copy2(source, target)


def create_bot(
    config: Config,
    name: str,
    title: str = "",
    color: str = "",
    shape: str = "",
    description: str = "",
) -> dict:
    """Lay a new profile out, publish it in one rename, and ask the gateway.

    Built in a dotted staging sibling so the profile scanner can never adopt a
    half-built bot, and published with `os.replace` — the same shape the
    desktop app uses, and for the same reason.
    """

    name = (name or "").strip().lower()
    if not NAME_RE.match(name):
        raise BotError(
            400,
            "bad_name",
            "A bot's name is lowercase letters, digits, - and _, up to 64, "
            "starting with a letter or a digit.",
        )
    if name in RESERVED:
        raise BotError(400, "reserved_name", f"{name} is a name Hermes keeps for itself.")

    root = config.hermes_home
    final = config.profiles_dir / name
    if final.exists():
        raise BotError(409, "exists", f"A bot called {name} already exists.")

    title = (title or "").strip()[:80]
    description = (description or "").strip()[:600]
    color = clean_color(color)
    shape = clean_shape(shape)
    if not color or not shape:
        fallback_color, fallback_shape = face_for(name)
        color = color or fallback_color
        shape = shape or fallback_shape

    config.profiles_dir.mkdir(parents=True, exist_ok=True)
    deleted = config.profiles_dir / ".deleted"
    deleted.mkdir(parents=True, exist_ok=True)
    # Reusing a deleted bot's name is normal, but Hermes keeps a tombstone
    # there and skips every profile carrying one.
    try:
        (deleted / name).unlink()
    except OSError:
        pass

    staging = config.profiles_dir / f".{name}.staging-bridge"
    shutil.rmtree(staging, ignore_errors=True)
    try:
        for child in (
            "memories",
            "sessions",
            "skills",
            "skins",
            "logs",
            "plans",
            "workspace",
            "cron",
            "home",
        ):
            (staging / child).mkdir(parents=True, exist_ok=True)

        for filename in ("config.yaml", "SOUL.md"):
            source = root / filename
            if source.is_file():
                shutil.copy2(source, staging / filename)

        # The copied soul opens with the primary agent's identity. A bot that
        # answers "I am Hermes" is the wrong agent wearing the right name.
        soul = staging / "SOUL.md"
        if soul.is_file() and title:
            text = soul.read_text(encoding="utf-8", errors="replace")
            if "You are Hermes" in text:
                soul.write_text(
                    text.replace("You are Hermes", "You are " + title, 1),
                    encoding="utf-8",
                )

        for filename in ("memories/MEMORY.md", "memories/USER.md"):
            source = root / filename
            if source.is_file():
                (staging / "memories").mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, staging / filename)

        env_lines = []
        primary_env = root / ".env"
        if primary_env.is_file():
            for line in primary_env.read_text(encoding="utf-8", errors="replace").splitlines():
                if DROP_ENV.match(line.strip()):
                    continue
                env_lines.append(line)
        env_lines.append("")
        env_lines.append(f"API_SERVER_KEY={secrets.token_hex(32)}")
        env_path = staging / ".env"
        env_path.write_text("\n".join(env_lines) + "\n", encoding="utf-8")
        env_path.chmod(0o600)

        if (root / "skills").is_dir():
            shutil.rmtree(staging / "skills", ignore_errors=True)
            try:
                shutil.copytree(
                    root / "skills",
                    staging / "skills",
                    copy_function=_link_or_copy,
                    symlinks=True,
                )
            except (OSError, shutil.Error):
                shutil.rmtree(staging / "skills", ignore_errors=True)
                (staging / "skills").mkdir(exist_ok=True)

        if (root / "skins").is_dir():
            shutil.rmtree(staging / "skins", ignore_errors=True)
            try:
                shutil.copytree(
                    root / "skins",
                    staging / "skins",
                    copy_function=_link_or_copy,
                    symlinks=True,
                )
            except (OSError, shutil.Error):
                shutil.rmtree(staging / "skins", ignore_errors=True)
                (staging / "skins").mkdir(exist_ok=True)

        meta = {
            "ui_meta": {"hermes-bots": {"title": title, "color": color, "shape": shape}},
            **({"description": description, "description_auto": False} if description else {}),
        }
        (staging / "profile.yaml").write_text(
            yaml.safe_dump(meta, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )

        os.replace(staging, final)
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    hot_serve(config, name)
    return get_bot(config, name)


def update_bot(config: Config, bot_id: str, fields: dict) -> dict:
    profile = profile_of(bot_id)
    get_bot(config, bot_id)
    cleaned = {}
    if "title" in fields:
        cleaned["title"] = str(fields.get("title") or "").strip()[:80]
    if "description" in fields:
        cleaned["description"] = str(fields.get("description") or "").strip()[:600]
    if "color" in fields:
        color = clean_color(str(fields.get("color") or ""))
        if not color:
            raise BotError(400, "bad_color", "That is not a colour this app can paint.")
        cleaned["color"] = color
    if "shape" in fields:
        shape = clean_shape(str(fields.get("shape") or ""))
        if not shape:
            raise BotError(400, "bad_shape", "That is not a shape this app can draw.")
        cleaned["shape"] = shape
    if not cleaned:
        return get_bot(config, bot_id)
    write_meta(config, profile, cleaned)
    return get_bot(config, bot_id)


def delete_bot(config: Config, bot_id: str) -> dict:
    """Take a bot out of service, without burning what it remembered.

    The gateway is asked to stop serving the profile *before* its directory
    moves: a served profile is a live one, and it will recreate what it lost.
    A tombstone then keeps Hermes from adopting the directory again, and the
    bytes are kept in the bridge's own trash so a mistaken delete can be undone
    by hand.
    """

    profile = profile_of(bot_id)
    if profile == PRIMARY:
        raise BotError(400, "primary", "The primary bot is Hermes itself: it cannot be deleted.")
    get_bot(config, bot_id)

    control(config, profile, "request_unserve_profile")

    source = config.profiles_dir / profile
    stamp = time.strftime("%Y%m%d-%H%M%S")
    trash = config.state_dir / "trash"
    trash.mkdir(parents=True, exist_ok=True)
    target = trash / f"{profile}-{stamp}"
    os.replace(source, target)

    deleted = config.profiles_dir / ".deleted"
    deleted.mkdir(parents=True, exist_ok=True)
    (deleted / profile).write_text(f"{stamp}\n", encoding="utf-8")
    return {"id": bot_id, "trash": str(target)}


def control(config: Config, name: str, function: str) -> None:
    """Ask the running gateway about a profile, on its control socket.

    Best effort on purpose: the gateway rescans on its own, and a bot that
    exists is a bot that exists whether the ask landed or not.
    """

    script = (
        "import sys\n"
        "from pathlib import Path\n"
        "root = Path(sys.argv[1])\n"
        "sys.path.insert(0, str(root / 'hermes-agent'))\n"
        "try:\n"
        "    module = __import__('gateway.control_socket', fromlist=[sys.argv[3]])\n"
        "    getattr(module, sys.argv[3])(root, sys.argv[2])\n"
        "except Exception:\n"
        "    pass\n"
    )
    try:
        subprocess.run(
            [sys.executable, "-c", script, str(config.hermes_home), name, function],
            timeout=12,
            capture_output=True,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        pass


def hot_serve(config: Config, name: str) -> None:
    control(config, name, "request_serve_profile_hot")
