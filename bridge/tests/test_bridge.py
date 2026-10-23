"""The bridge, exercised against a fake Hermes.

What is checked here is the contract the phone sees: pairing, the refusal of
an unpaired device, the bots that are profiles, the conversations that live in
Hermes, and one turn that streams back.
"""

from __future__ import annotations

import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from dataclasses import replace
from pathlib import Path

import yaml

from hermes_bridge.config import Config, ensure_state
from hermes_bridge.devices import Pairing
from hermes_bridge.server import BridgeServer

from fake_hermes import start as start_fake


class BridgeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.home = root / ".hermes"
        self.state = root / "state"
        (self.home / "profiles" / "nova").mkdir(parents=True)
        (self.home / "profiles" / "nova" / ".env").write_text(
            "API_SERVER_KEY=key-nova\n", encoding="utf-8"
        )
        (self.home / "profiles" / "nova" / "profile.yaml").write_text(
            yaml.safe_dump(
                {
                    "ui_meta": {
                        "hermes-bots": {
                            "title": "Nova",
                            "color": "#2fbfa0",
                            "shape": "goutte",
                        }
                    },
                    "description": "Notes and recall",
                }
            ),
            encoding="utf-8",
        )
        (self.home / ".env").write_text("API_SERVER_KEY=key-primary\n", encoding="utf-8")

        self.fake_server, self.fake = start_fake()
        self.hermes_url = f"http://127.0.0.1:{self.fake_server.server_address[1]}"

        self.config = Config(
            host="127.0.0.1",
            port=0,
            hermes_url=self.hermes_url,
            hermes_home=self.home,
            state_dir=self.state,
        )
        ensure_state(self.config)
        self.server = BridgeServer(self.config)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

        minted = Pairing(self.config).mint()
        status, body = self.call(
            "POST", "/v1/pair", {"code": minted["code"], "name": "iPhone"}, token=False
        )
        self.assertEqual(status, 201, body)
        self.token = body["token"]
        self.device_id = body["device"]["id"]

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.fake_server.shutdown()
        self.fake_server.server_close()
        self.tmp.cleanup()

    # ------------------------------------------------------------ helpers

    def call(self, method, path, body=None, token=True, raw=None, headers=None):
        data = raw
        if data is None and body is not None:
            data = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(self.base + path, data=data, method=method)
        if token:
            request.add_header("Authorization", f"Bearer {self.token if token is True else token}")
        if body is not None:
            request.add_header("Content-Type", "application/json")
        for name, value in (headers or {}).items():
            request.add_header(name, value)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                payload = response.read()
                return response.status, json.loads(payload or b"{}")
        except urllib.error.HTTPError as exc:
            payload = exc.read()
            try:
                return exc.code, json.loads(payload or b"{}")
            except ValueError:
                return exc.code, {"raw": payload.decode("utf-8", "replace")}

    def stream(self, bot, session, body):
        request = urllib.request.Request(
            f"{self.base}/v1/sessions/{bot}/{session}/turns",
            data=json.dumps(body).encode("utf-8"),
            method="POST",
        )
        request.add_header("Authorization", f"Bearer {self.token}")
        request.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.read().decode("utf-8")

    @staticmethod
    def events(raw: str) -> list[tuple[str, dict]]:
        out = []
        for frame in raw.split("\n\n"):
            name = "message"
            data = []
            for line in frame.splitlines():
                if line.startswith("event:"):
                    name = line[6:].strip()
                elif line.startswith("data:"):
                    data.append(line[5:].strip())
            if data:
                out.append((name, json.loads("\n".join(data))))
        return out

    # -------------------------------------------------------------- tests

    def test_the_root_page_says_whether_hermes_answers(self):
        Pairing(self.config).mint()
        with urllib.request.urlopen(self.base + "/", timeout=10) as response:
            body = response.read().decode("utf-8")
            self.assertEqual(response.status, 200)
        self.assertIn("Hermes Bridge", body)
        self.assertIn("Hermes is answering.", body)
        self.assertIn("A pairing code is waiting", body)
        self.assertNotIn("key-primary", body)

    def test_a_browser_gets_a_preflight(self):
        request = urllib.request.Request(self.base + "/v1/bots", method="OPTIONS")
        request.add_header("Origin", "http://localhost:8081")
        request.add_header("Access-Control-Request-Method", "GET")
        request.add_header("Access-Control-Request-Headers", "authorization")
        with urllib.request.urlopen(request, timeout=10) as response:
            self.assertEqual(response.status, 204)
            self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), "*")
            self.assertIn(
                "Authorization", response.headers.get("Access-Control-Allow-Headers", "")
            )

    def test_health_is_public_and_names_hermes(self):
        status, body = self.call("GET", "/v1/health", token=False)
        self.assertEqual(status, 200)
        self.assertEqual(body["service"], "hermes-bridge")
        self.assertTrue(body["hermes"]["ok"])
        self.assertFalse(body["pairing"]["required"])

    def test_a_code_works_once(self):
        minted = Pairing(self.config).mint()
        status, _ = self.call(
            "POST", "/v1/pair", {"code": minted["code"], "name": "iPad"}, token=False
        )
        self.assertEqual(status, 201)
        status, body = self.call(
            "POST", "/v1/pair", {"code": minted["code"], "name": "iPad"}, token=False
        )
        self.assertEqual(status, 401)
        self.assertEqual(body["error"]["code"], "bad_code")

    def test_an_unpaired_device_is_refused(self):
        status, body = self.call("GET", "/v1/bots", token="hbr_nope")
        self.assertEqual(status, 401)
        self.assertEqual(body["error"]["code"], "unauthorized")

    def test_too_many_pair_attempts(self):
        for _ in range(10):
            self.call("POST", "/v1/pair", {"code": "AAAA-BBBB"}, token=False)
        status, body = self.call("POST", "/v1/pair", {"code": "AAAA-BBBB"}, token=False)
        self.assertEqual(status, 429)
        self.assertEqual(body["error"]["code"], "too_many")

    def test_bots_are_the_profiles(self):
        status, body = self.call("GET", "/v1/bots")
        self.assertEqual(status, 200)
        by_id = {bot["id"]: bot for bot in body["bots"]}
        self.assertEqual(set(by_id), {"default", "nova"})
        self.assertTrue(by_id["default"]["primary"])
        self.assertEqual(by_id["nova"]["name"], "Nova")
        self.assertEqual(by_id["nova"]["color"], "#2fbfa0")
        self.assertEqual(by_id["nova"]["shape"], "goutte")
        self.assertTrue(by_id["nova"]["hasKey"])

    def test_creating_a_bot_lays_out_a_profile(self):
        (self.home / "config.yaml").write_text("model: sonnet-4.5\n", encoding="utf-8")
        (self.home / "SOUL.md").write_text("You are Hermes, briefly.\n", encoding="utf-8")
        status, body = self.call(
            "POST",
            "/v1/bots",
            {"name": "atlas", "title": "Atlas", "color": "#4f9d8f", "shape": "capsule"},
        )
        self.assertEqual(status, 201, body)
        self.assertEqual(body["bot"]["name"], "Atlas")
        profile = self.home / "profiles" / "atlas"
        self.assertTrue((profile / "config.yaml").is_file())
        env = (profile / ".env").read_text(encoding="utf-8")
        self.assertIn("API_SERVER_KEY=", env)
        self.assertNotIn("key-primary", env)
        meta = yaml.safe_load((profile / "profile.yaml").read_text(encoding="utf-8"))
        self.assertEqual(meta["ui_meta"]["hermes-bots"]["title"], "Atlas")
        self.assertEqual(
            (profile / "SOUL.md").read_text(encoding="utf-8"),
            "You are Atlas, briefly.\n",
        )
        self.assertTrue((profile / "config.yaml").is_file())

        status, body = self.call("POST", "/v1/bots", {"name": "atlas"})
        self.assertEqual(status, 409)
        status, body = self.call("POST", "/v1/bots", {"name": "Default"})
        self.assertEqual(status, 400)
        status, body = self.call("POST", "/v1/bots", {"name": "not a name"})
        self.assertEqual(status, 400)

    def test_updating_a_bot_writes_the_desktop_metadata(self):
        status, body = self.call(
            "PATCH", "/v1/bots/nova", {"title": "Nova Deux", "color": "#123456"}
        )
        self.assertEqual(status, 200, body)
        meta = yaml.safe_load(
            (self.home / "profiles" / "nova" / "profile.yaml").read_text(encoding="utf-8")
        )
        self.assertEqual(meta["ui_meta"]["hermes-bots"]["title"], "Nova Deux")
        self.assertEqual(meta["ui_meta"]["hermes-bots"]["color"], "#123456")
        self.assertEqual(meta["ui_meta"]["hermes-bots"]["shape"], "goutte")
        status, body = self.call("PATCH", "/v1/bots/nova", {"color": "javascript:"})
        self.assertEqual(status, 400)

    def test_deleting_a_bot_leaves_a_tombstone_and_keeps_the_bytes(self):
        self.call("POST", "/v1/bots", {"name": "rook", "title": "Rook"})
        status, body = self.call("DELETE", "/v1/bots/rook")
        self.assertEqual(status, 200, body)
        self.assertTrue((self.home / "profiles" / ".deleted" / "rook").is_file())
        self.assertTrue(Path(body["trash"]).is_dir())
        status, listing = self.call("GET", "/v1/bots")
        self.assertNotIn("rook", {bot["id"] for bot in listing["bots"]})
        status, body = self.call("DELETE", "/v1/bots/default")
        self.assertEqual(status, 400)

    def test_sessions_come_from_each_bot_with_its_own_key(self):
        status, body = self.call("GET", "/v1/sessions")
        self.assertEqual(status, 200, body)
        self.assertEqual(body["errors"], [])
        bots = {row["bot"] for row in body["sessions"]}
        self.assertEqual(bots, {"default", "nova"})
        self.assertEqual(body["sessions"][0]["bot"], "default")
        self.assertEqual(body["sessions"][0]["lastActive"], 2000)

    def test_a_taken_title_gets_a_suffix(self):
        status, body = self.call("POST", "/v1/sessions", {"bot": "default", "title": "Chief"})
        self.assertEqual(status, 201, body)
        self.assertTrue(body["session"]["title"].startswith("Chief · "), body)
        status, body = self.call("POST", "/v1/sessions", {"bot": "default", "title": "Crew"})
        self.assertEqual(body["session"]["title"], "Crew")

    def test_the_transcript_is_passed_through(self):
        status, body = self.call("GET", "/v1/sessions/default/s-primary-1/messages")
        self.assertEqual(status, 200, body)
        self.assertEqual([row["role"] for row in body["messages"]], ["user", "assistant"])
        self.assertEqual(body["messages"][1]["content"], "hi there")

    def test_renaming_and_deleting_a_conversation(self):
        status, _ = self.call(
            "PATCH", "/v1/sessions/default/s-primary-1", {"title": "Renamed"}
        )
        self.assertEqual(status, 200)
        self.assertEqual(self.fake.sessions["default"][0]["title"], "Renamed")
        status, _ = self.call("DELETE", "/v1/sessions/default/s-primary-1")
        self.assertEqual(status, 200)
        self.assertEqual(self.fake.sessions["default"], [])

    def test_models_are_the_authenticated_ones(self):
        status, body = self.call("GET", "/v1/models?bot=nova")
        self.assertEqual(status, 200, body)
        slugs = [provider["slug"] for provider in body["models"]["providers"]]
        self.assertEqual(slugs, ["anthropic"])
        self.assertEqual(body["models"]["providers"][0]["models"][0]["id"], "sonnet-4.5")
        # The two halves of "anthropic/sonnet-4.5" are what a turn needs.
        self.assertEqual(body["models"]["current"], "sonnet-4.5")
        self.assertEqual(body["models"]["currentProvider"], "anthropic")

    def test_a_turn_streams_and_carries_the_model_lock(self):
        raw = self.stream("default", "s-primary-1", {"message": "status?", "model": "sonnet-4.5"})
        events = self.events(raw)
        self.assertEqual(
            [name for name, _ in events], ["delta", "tool", "delta", "done"]
        )
        text = "".join(
            data.get("text", "") for name, data in events if name == "delta"
        )
        self.assertEqual(text, "Deploy 412 is green.")
        self.assertIn(": keepalive", raw)
        self.assertEqual(events[-1][1]["sessionId"], "s-primary-1")
        self.assertEqual(self.fake.last_turn["authorization"], "Bearer key-primary")
        self.assertTrue(self.fake.last_turn["body"]["require_model_lock"])
        self.assertEqual(self.fake.last_turn["body"]["model"], "sonnet-4.5")
        self.assertEqual(self.fake.last_turn["body"]["message"], "status?")

    def test_a_turn_without_a_key_says_so_before_streaming(self):
        (self.home / "profiles" / "nova" / ".env").write_text("", encoding="utf-8")
        status, body = self.call(
            "POST", "/v1/sessions/nova/s-nova-1/turns", {"message": "hello"}
        )
        self.assertEqual(status, 409)
        self.assertEqual(body["error"]["code"], "no_key")

    def test_an_attachment_lands_in_the_hermes_attachments(self):
        status, body = self.call(
            "POST",
            "/v1/attachments?filename=../notes.txt",
            raw=b"the bytes",
            headers={"Content-Type": "text/plain"},
        )
        self.assertEqual(status, 201, body)
        saved = Path(body["path"])
        self.assertEqual(saved.parent, self.home / "attachments")
        self.assertEqual(saved.name.endswith("notes.txt"), True)
        self.assertEqual(saved.read_bytes(), b"the bytes")
        self.assertEqual(body["bytes"], 9)

    def test_an_upload_over_the_cap_is_refused(self):
        small = Config(
            host="127.0.0.1",
            port=0,
            hermes_url=self.hermes_url,
            hermes_home=self.home,
            state_dir=self.state,
            max_upload_bytes=8,
        )
        server = BridgeServer(small)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            request = urllib.request.Request(
                f"http://127.0.0.1:{server.server_address[1]}/v1/attachments",
                data=b"0123456789",
                method="POST",
            )
            request.add_header("Authorization", f"Bearer {self.token}")
            try:
                urllib.request.urlopen(request, timeout=10)
                self.fail("the upload should have been refused")
            except urllib.error.HTTPError as exc:
                self.assertEqual(exc.code, 413)
                body = json.loads(exc.read())
                self.assertEqual(body["error"]["code"], "too_large")
        finally:
            server.shutdown()
            server.server_close()

    def test_voice_without_hermes_tools_is_honest(self):
        status, body = self.call(
            "POST", "/v1/voice", raw=b"fake audio", headers={"Content-Type": "audio/m4a"}
        )
        self.assertEqual(status, 501)
        self.assertEqual(body["error"]["code"], "no_transcription")

    def test_preferences_are_written_with_the_primary_profile(self):
        status, body = self.call("PUT", "/v1/prefs", {"prefs": {"defaultModel": "Sonnet 4.5"}})
        self.assertEqual(status, 200, body)
        data = yaml.safe_load((self.home / "profile.yaml").read_text(encoding="utf-8"))
        self.assertEqual(data["ui_meta"]["hermes-bot"]["defaultModel"], "Sonnet 4.5")
        status, body = self.call("GET", "/v1/prefs")
        self.assertEqual(body["prefs"], {"defaultModel": "Sonnet 4.5"})

    def test_a_revoked_device_is_locked_out(self):
        status, body = self.call("GET", "/v1/devices")
        self.assertEqual(status, 200)
        self.assertEqual([row["id"] for row in body["devices"]], [self.device_id])
        status, _ = self.call("DELETE", f"/v1/devices/{self.device_id}")
        self.assertEqual(status, 200)
        status, body = self.call("GET", "/v1/bots")
        self.assertEqual(status, 401)


if __name__ == "__main__":
    unittest.main()
