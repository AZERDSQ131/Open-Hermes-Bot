"""Hermes Bridge — the door between Hermes and a phone.

Lives next to Hermes, answers on loopback, and is published to the tailnet by
`tailscale serve`. It holds no conversations: the sessions, the bots and the
preferences are Hermes'.
"""

from __future__ import annotations

__version__ = "1.0.0"
