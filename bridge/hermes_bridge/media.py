"""A file the phone attached, and a recording it dictated.

Both land where the desktop app puts them — `~/.hermes/attachments` — so the
transcript and the bot can reach them with a path, not with bytes over a
command line.
"""

from __future__ import annotations

import glob
import json
import os
import re
import secrets
import subprocess
import time
from pathlib import Path
from urllib.parse import unquote

from .config import Config

SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")
AUDIO_TYPES = {
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/aac": "aac",
}


class MediaError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def safe_name(raw: str) -> str:
    name = os.path.basename(unquote(raw or "").replace("\\", "/")).strip()
    name = SAFE_NAME.sub("-", name).strip(".-")
    if not name:
        name = "file"
    stem, dot, extension = name.rpartition(".")
    if not dot or len(extension) > 8:
        return name[:80]
    return f"{stem[:70]}.{extension.lower()}"


def save_upload(config: Config, filename: str, mime: str, data: bytes) -> dict:
    if not data:
        raise MediaError(400, "empty", "Nothing was attached.")
    config.attachments_dir.mkdir(parents=True, exist_ok=True)
    name = safe_name(filename)
    stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    target = config.attachments_dir / f"{stamp}-{secrets.token_hex(3)}-{name}"
    target.write_bytes(data)
    try:
        target.chmod(0o600)
    except OSError:
        pass
    return {
        "name": name,
        "path": str(target),
        "bytes": len(data),
        "mime": mime or "application/octet-stream",
    }


def _hermes_python(home: Path) -> str:
    candidates = sorted(glob.glob(str(home / "tools" / "python-*" / "bin" / "python3")))
    return candidates[-1] if candidates else "python3"


def _python_path(home: Path) -> str:
    archives = sorted(glob.glob(str(home / "cache" / "uv" / "archive-v0" / "*" / "")))
    return os.pathsep.join(archives)


TRANSCRIBE = """
import json
import os
import sys

agent_home = os.environ.get("HERMES_AGENT_HOME", "")
if agent_home:
    sys.path.insert(0, agent_home)

try:
    from tools.transcription_tools import transcribe_audio

    print(json.dumps(transcribe_audio(sys.argv[1]), separators=(",", ":")))
except Exception as exc:
    print(json.dumps({"success": False, "transcript": "", "error": str(exc)}, separators=(",", ":")))
"""


def transcribe(config: Config, path: Path) -> str:
    """Hermes transcribes, with the python the gateway already runs.

    The recording never leaves this machine; what comes back is words.
    """

    home = config.hermes_home
    agent_home = home / "hermes-agent"
    if not (agent_home / "tools" / "transcription_tools.py").is_file():
        raise MediaError(
            501,
            "no_transcription",
            "Hermes has no transcription tools installed on this machine.",
        )
    env = {
        **os.environ,
        "HERMES_AGENT_HOME": str(agent_home),
        "PYTHONPATH": _python_path(home),
    }
    try:
        result = subprocess.run(
            [_hermes_python(home), "-", str(path)],
            input=TRANSCRIBE.encode("utf-8"),
            cwd=str(agent_home),
            env=env,
            capture_output=True,
            timeout=180,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise MediaError(504, "timeout", "The recording took too long to transcribe.") from exc
    except OSError as exc:
        raise MediaError(502, "no_python", f"Could not run Hermes' python: {exc}") from exc

    answer = None
    for line in reversed(result.stdout.decode("utf-8", errors="replace").splitlines()):
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            answer = json.loads(line)
        except ValueError:
            continue
        break
    if not isinstance(answer, dict):
        detail = result.stderr.decode("utf-8", errors="replace").strip().splitlines()
        raise MediaError(
            502,
            "transcription_failed",
            detail[-1] if detail else "The recording could not be transcribed.",
        )
    if not answer.get("success"):
        raise MediaError(
            502,
            "transcription_failed",
            str(answer.get("error") or "The recording could not be transcribed."),
        )
    transcript = str(answer.get("transcript") or "").strip()
    if not transcript:
        raise MediaError(422, "silence", "Nothing was heard in the recording.")
    return transcript


def audio_extension(mime: str) -> str:
    return AUDIO_TYPES.get((mime or "").split(";")[0].strip().lower(), "m4a")
