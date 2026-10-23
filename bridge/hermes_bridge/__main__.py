"""The bridge's command line: serve it, pair a phone, look at it."""

from __future__ import annotations

import argparse
import logging
import signal
import sys
import threading
import time
from dataclasses import replace

from . import __version__, config as config_module
from .config import load
from .devices import Devices, Pairing
from .hermes import Hermes
from .profiles import list_bots
from .server import BridgeServer

log = logging.getLogger("hermes_bridge")


def _stamp(epoch: int) -> str:
    return time.strftime("%Y-%m-%d %H:%M", time.localtime(epoch))


def cmd_serve(args: argparse.Namespace) -> int:
    config = load(args.config)
    if args.host:
        config = replace(config, host=args.host)
    if args.port:
        config = replace(config, port=args.port)
    config_module.ensure_state(config)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        stream=sys.stderr,
    )

    devices = Devices(config)
    pairing = Pairing(config)
    if devices.count() == 0 and not pairing.status()["pending"]:
        minted = pairing.mint()
        log.info(
            "No device paired yet. Open the app and pair with the code: %s (valid until %s)",
            minted["code"],
            _stamp(minted["expiresAt"]),
        )

    server = BridgeServer(config)
    stopping = threading.Event()

    def stop(signum, _frame) -> None:
        if stopping.is_set():
            return
        stopping.set()
        log.info("Stopping (signal %s)", signum)
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    bots = list_bots(config)
    log.info(
        "Hermes Bridge %s on http://%s:%d (Hermes at %s, %d bot%s)",
        __version__,
        config.host,
        config.port,
        config.hermes_url,
        len(bots),
        "" if len(bots) == 1 else "s",
    )
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()
    return 0


def cmd_pair(args: argparse.Namespace) -> int:
    config = load(args.config)
    config_module.ensure_state(config)
    minted = Pairing(config).mint()
    print(f"Pairing code: {minted['code']}")
    print(f"Valid until:  {_stamp(minted['expiresAt'])}")
    print("Type it in the app's Setup screen. It works once.")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    config = load(args.config)
    hermes = Hermes(config)
    health = hermes.health()
    devices = Devices(config).list()
    pairing = Pairing(config).status()
    bots = list_bots(config)
    print(f"Bridge:   {config.state_dir}")
    print(f"Hermes:   {config.hermes_url} — {'answering' if health['ok'] else 'not answering'}")
    print(f"Key:      primary profile {'has one' if health['primaryKey'] else 'has none'}")
    print(f"Bots:     {len(bots)}")
    for bot in bots:
        print(f"          {bot['id']:<24} {bot['name']}  {'' if bot['hasKey'] else '(no key)'}")
    print(f"Devices:  {len(devices)}")
    for device in devices:
        seen = _stamp(device['lastSeenAt']) if device['lastSeenAt'] else "never"
        print(f"          {device['id']}  {device['name']}  last seen {seen}")
    print(f"Pairing:  {'a code is waiting' if pairing['pending'] else 'no code'}")
    return 0


def cmd_devices(args: argparse.Namespace) -> int:
    config = load(args.config)
    rows = Devices(config).list()
    if not rows:
        print("No device paired yet.")
        return 0
    for row in rows:
        print(f"{row['id']}  {row['name']}")
    return 0


def cmd_revoke(args: argparse.Namespace) -> int:
    config = load(args.config)
    if not Devices(config).remove(args.device):
        print(f"No device called {args.device}", file=sys.stderr)
        return 1
    print(f"Revoked {args.device}. That device must pair again.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="hermes_bridge", description=__doc__)
    parser.add_argument("--config", type=str, default=None, help="Path to config.json")
    sub = parser.add_subparsers(dest="command", required=True)

    serve = sub.add_parser("serve", help="Run the bridge")
    serve.add_argument("--host", default="")
    serve.add_argument("--port", type=int, default=0)
    serve.add_argument("-v", "--verbose", action="store_true")
    serve.set_defaults(handler=cmd_serve)

    pair = sub.add_parser("pair", help="Mint a pairing code for a phone")
    pair.set_defaults(handler=cmd_pair)

    status = sub.add_parser("status", help="What the bridge sees")
    status.set_defaults(handler=cmd_status)

    devices = sub.add_parser("devices", help="List paired devices")
    devices.set_defaults(handler=cmd_devices)

    revoke = sub.add_parser("revoke", help="Forget a device")
    revoke.add_argument("device")
    revoke.set_defaults(handler=cmd_revoke)

    args = parser.parse_args(argv)
    return int(args.handler(args))


if __name__ == "__main__":
    raise SystemExit(main())
