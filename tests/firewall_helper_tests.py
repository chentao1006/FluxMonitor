import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import textwrap
from typing import Optional
import unittest
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parent.parent
HELPER_PATH = REPO_ROOT / "scripts" / "pf" / "fluxmonitor-pf"
SETUP_SCRIPT_PATH = REPO_ROOT / "scripts" / "pf" / "setup.sh"


def load_helper():
    prev = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        loader = importlib.machinery.SourceFileLoader("fluxmonitor_pf", str(HELPER_PATH))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        module = importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        return module
    finally:
        sys.dont_write_bytecode = prev


def create_fake_pfctl(directory: Path, initial_state: Optional[dict] = None):
    state_path = directory / "pf_state.json"
    state = {
        "attached": True,
        "force_disabled": False,
        "references": [],
        "next_token": 1001,
        "anchor_rules": [],
        "fail_dry_run": False,
        "fail_apply": False,
        "calls": [],
    }
    if initial_state:
        state.update(initial_state)
    state_path.write_text(json.dumps(state))

    script_path = directory / "fake-pfctl"
    script_body = textwrap.dedent(
        f"""\
        #!{sys.executable}
        import json
        from pathlib import Path
        import sys

        STATE_PATH = Path({str(state_path)!r})
        state = json.loads(STATE_PATH.read_text())
        args = sys.argv[1:]
        body = sys.stdin.read() if ("-f" in args and "-" in args) else None
        state["calls"].append(args)

        def save():
            STATE_PATH.write_text(json.dumps(state))

        if args == ["-s", "info"]:
            status = "Enabled" if (state["references"] and not state["force_disabled"]) else "Disabled"
            print(f"Status: {{status}} for 0 days 00:01:00")
            save()
            sys.exit(0)

        if args == ["-s", "rules"]:
            if state["attached"]:
                print('anchor "com.apple/*" all')
            save()
            sys.exit(0)

        if args == ["-s", "Anchors"]:
            print("com.apple")
            save()
            sys.exit(0)

        if args == ["-a", "com.apple", "-s", "Anchors"]:
            if state["anchor_rules"]:
                print("com.apple/000.ct106.flux-monitor")
            save()
            sys.exit(0)

        if len(args) == 4 and args[0] == "-a" and args[2:] == ["-s", "rules"]:
            for line in state["anchor_rules"]:
                print(line)
            save()
            sys.exit(0)

        if args == ["-s", "References"]:
            for idx, tok in enumerate(state["references"]):
                print(f"{{idx}} 0 {{tok}}")
            save()
            sys.exit(0)

        if args == ["-E"]:
            tok = str(state["next_token"])
            state["next_token"] += 1
            state["references"].append(tok)
            state["force_disabled"] = False
            print("pf enabled")
            print(f"Token : {{tok}}")
            save()
            sys.exit(0)

        if len(args) == 2 and args[0] == "-X":
            tok = args[1]
            if tok in state["references"]:
                state["references"].remove(tok)
            save()
            sys.exit(0)

        if len(args) == 5 and args[0] == "-n" and args[1] == "-a" and args[3:] == ["-f", "-"]:
            if state["fail_dry_run"]:
                save()
                print("syntax error in pf rules", file=sys.stderr)
                sys.exit(1)
            save()
            sys.exit(0)

        if len(args) == 4 and args[0] == "-a" and args[2:] == ["-f", "-"]:
            if state["fail_apply"]:
                save()
                print("pfctl failed to load anchor", file=sys.stderr)
                sys.exit(1)
            rules = [
                line.strip()
                for line in (body or "").splitlines()
                if line.strip().startswith(("block ", "pass ", "anchor ", "match "))
            ]
            state["anchor_rules"] = rules
            save()
            sys.exit(0)

        save()
        print(f"unsupported fake-pfctl args: {{args}}", file=sys.stderr)
        sys.exit(1)
        """
    )
    script_path.write_text(script_body)
    script_path.chmod(0o755)
    return script_path, state_path


class FirewallHelperTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.mod = load_helper()
        self.mod.DATA = self.root / "data"
        self.mod.TOKEN = self.root / "pf.token"
        self.pfctl_path, self.state_path = create_fake_pfctl(self.root)
        self.mod.PFCTL = str(self.pfctl_path)
        self.if_patcher = mock.patch.object(
            self.mod.socket,
            "if_nameindex",
            return_value=[(1, "lo0"), (2, "en0"), (3, "en1")],
        )
        self.if_patcher.start()

    def tearDown(self):
        self.if_patcher.stop()
        self.tmp.cleanup()

    def read_pf_state(self):
        return json.loads(self.state_path.read_text())

    def update_pf_state(self, **updates):
        state = self.read_pf_state()
        state.update(updates)
        self.state_path.write_text(json.dumps(state))

    def write_management(self, payload):
        self.mod.DATA.mkdir(parents=True, exist_ok=True)
        (self.mod.DATA / "management.json").write_text(json.dumps(payload))

    def test_port_ranges_merge_and_validate(self):
        self.assertEqual(self.mod.format_ports(self.mod.port_ranges("80, 443, 81-83, 80")), "80-83,443")
        self.assertEqual(self.mod.format_ports(self.mod.port_ranges("1-65535")), "*")
        self.assertEqual(self.mod.format_ports(self.mod.port_ranges("*")), "*")

        for bad in ("", "0", "65536", "443-80", "http", "80,", "1-" + "9" * 6, "80," * 1000):
            with self.subTest(bad=bad):
                with self.assertRaises(self.mod.Invalid) as ctx:
                    self.mod.port_ranges(bad)
                self.assertEqual(str(ctx.exception), "port")

    def test_sources_normalization_and_strict_cidr_rejection(self):
        self.assertEqual(self.mod.normalize_sources(["any"]), ["any"])
        self.assertEqual(
            self.mod.normalize_sources(["2001:0db8::1", "192.0.2.5", "192.0.2.0/24", "192.0.2.5"]),
            ["192.0.2.0/24", "192.0.2.5/32", "2001:db8::1/128"],
        )

        for bad in (["192.168.1.5/24"], ["010.0.0.1"], ["2001:db8::1/64"], ["any", "192.0.2.1"], ["192.0.2.1;rm"]):
            with self.subTest(bad=bad):
                with self.assertRaises(self.mod.Invalid) as ctx:
                    self.mod.normalize_sources(bad)
                self.assertEqual(str(ctx.exception), "source_address")

        with self.assertRaises(self.mod.Invalid) as ctx:
            self.mod.normalize_sources([])
        self.assertEqual(str(ctx.exception), "sources")

        with self.assertRaises(self.mod.Invalid) as ctx:
            self.mod.normalize_sources([f"10.0.0.{i}" for i in range(129)])
        self.assertEqual(str(ctx.exception), "sources")

    def test_schema_rejects_legacy_and_malformed_policies(self):
        for bad in (
            {"enabled": False, "rules": []},
            {"version": 2, "enabled": False, "rules": []},
            {"version": True, "enabled": False, "rules": []},
            {"version": 1, "enabled": False, "rules": [], "extra": 1},
        ):
            with self.subTest(bad=bad):
                with self.assertRaises(self.mod.Invalid) as ctx:
                    self.mod.policy(bad)
                self.assertEqual(str(ctx.exception), "policy")

        with self.assertRaises(self.mod.Invalid) as ctx:
            self.mod.policy(
                {
                    "version": 1,
                    "enabled": True,
                    "rules": [
                        {
                            "action": "deny",
                            "protocol": "tcp",
                            "sources": ["any"],
                            "ports": "80",
                            "unknown": True,
                        }
                    ],
                }
            )
        self.assertEqual(str(ctx.exception), "rule")

    def test_blocked_prefixes_longest_prefix_allow_over_deny(self):
        rules = [
            {"action": "allow", "sources": ["198.51.100.10/32"]},
            {"action": "deny", "sources": ["198.51.100.0/24"]},
            {"action": "allow", "sources": ["198.51.100.11/32"]},
        ]
        self.assertEqual(
            self.mod.blocked_prefixes(rules),
            ("198.51.100.0/24", "!198.51.100.10/32"),
        )

        allow_over_any = [
            {"action": "allow", "sources": ["198.51.100.10/32"]},
            {"action": "deny", "sources": ["any"]},
        ]
        self.assertEqual(
            self.mod.blocked_prefixes(allow_over_any),
            ("0.0.0.0/0", "!198.51.100.10/32", "::/0"),
        )

    def test_render_excludes_loopback_and_handles_no_interfaces(self):
        pol = self.mod.policy(
            {
                "version": 1,
                "enabled": True,
                "rules": [
                    {
                        "enabled": True,
                        "action": "deny",
                        "protocol": "tcp",
                        "sources": ["203.0.113.0/24"],
                        "ports": "8080",
                        "description": "block test subnet",
                    },
                    {
                        "enabled": False,
                        "action": "deny",
                        "protocol": "udp",
                        "sources": ["any"],
                        "ports": "53",
                        "description": "disabled rule",
                    },
                ],
            }
        )
        body, labels = self.mod.render(pol)
        self.assertIn("pass out on ! lo0 proto tcp from (en0) port 8080 to <", body)
        self.assertIn("pass out on ! lo0 proto tcp from (en1) port 8080 to <", body)
        self.assertIn("to (en0) port 8080", body)
        self.assertIn("to (en1) port 8080", body)
        self.assertNotIn("(lo0)", body)
        self.assertNotIn("proto udp", body)
        self.assertEqual(len(labels), 4)

        with mock.patch.object(self.mod.socket, "if_nameindex", return_value=[(1, "lo0")]):
            empty_body, empty_labels = self.mod.render(pol)
        self.assertEqual(empty_body, "\n")
        self.assertEqual(empty_labels, set())

    def test_apply_without_management_json_and_directory_mode(self):
        initial = self.mod.handle({"action": "status"})
        self.assertEqual(initial["policy"], {"version": 1, "enabled": False, "rules": []})
        self.assertFalse(initial["pfEnabled"])
        self.assertTrue(initial["attached"])
        self.assertTrue(initial["inSync"])
        self.assertEqual(stat.S_IMODE(self.mod.DATA.stat().st_mode), 0o700)

        applied = self.mod.handle(
            {
                "action": "apply",
                "revision": initial["revision"],
                "policy": {
                    "version": 1,
                    "enabled": True,
                    "rules": [
                        {
                            "enabled": True,
                            "action": "deny",
                            "protocol": "tcp",
                            "sources": ["any"],
                            "ports": "22,4210",
                            "description": "no management.json required",
                        }
                    ],
                },
            }
        )
        self.assertTrue(applied["pfEnabled"])
        self.assertTrue(applied["inSync"])
        self.assertEqual(len(self.read_pf_state()["anchor_rules"]), 8)
        self.assertTrue((self.mod.DATA / "policy.json").exists())

    def test_management_lockout_and_ipv4_mapped_and_zone_unwrapping(self):
        self.write_management({"address": "198.51.100.10", "sshPort": 22, "panelPort": 4210})
        initial = self.mod.handle({"action": "status"})

        deny_all_22 = {
            "version": 1,
            "enabled": True,
            "rules": [
                {"action": "deny", "protocol": "tcp", "sources": ["any"], "ports": "22"},
            ],
        }
        with self.assertRaises(self.mod.Invalid) as ctx:
            self.mod.handle({"action": "apply", "revision": initial["revision"], "policy": deny_all_22})
        self.assertEqual(str(ctx.exception), "management_access")

        allow_mgmt_deny_panel = {
            "version": 1,
            "enabled": True,
            "rules": [
                {"action": "allow", "protocol": "tcp", "sources": ["198.51.100.10"], "ports": "22,4210"},
                {"action": "allow", "protocol": "tcp", "sources": ["192.0.2.0/24", "fe80::/64"], "ports": "4210"},
                {"action": "deny", "protocol": "tcp", "sources": ["any"], "ports": "4210"},
            ],
        }

        with self.assertRaises(self.mod.Invalid) as ctx:
            self.mod.handle(
                {
                    "action": "apply",
                    "revision": initial["revision"],
                    "policy": allow_mgmt_deny_panel,
                    "client": "::ffff:203.0.113.9",
                }
            )
        self.assertEqual(str(ctx.exception), "management_access")

        for client in ("::ffff:127.0.0.1", "::ffff:192.0.2.5", "fe80::1%en0"):
            with self.subTest(client=client):
                cur = self.mod.handle({"action": "status"})
                res = self.mod.handle(
                    {
                        "action": "apply",
                        "revision": cur["revision"],
                        "policy": allow_mgmt_deny_panel,
                        "client": client,
                    }
                )
                self.assertTrue(res["inSync"])

        (self.mod.DATA / "management.json").write_text('{"address": "not-an-ip", "sshPort": 22, "panelPort": 4210}')
        with self.assertRaises(RuntimeError):
            self.mod.handle({"action": "status"})

    def test_optimistic_concurrency_conflict(self):
        initial = self.mod.handle({"action": "status"})
        first = self.mod.handle(
            {
                "action": "apply",
                "revision": initial["revision"],
                "policy": {
                    "version": 1,
                    "enabled": True,
                    "rules": [{"action": "deny", "protocol": "tcp", "sources": ["203.0.113.5"], "ports": "80"}],
                },
            }
        )
        with self.assertRaises(self.mod.Conflict):
            self.mod.handle(
                {
                    "action": "apply",
                    "revision": initial["revision"],
                    "policy": {"version": 1, "enabled": False, "rules": []},
                }
            )
        after = self.mod.handle({"action": "status"})
        self.assertEqual(after["revision"], first["revision"])
        self.assertTrue(after["policy"]["enabled"])

    def test_rollback_on_dry_run_apply_and_persist_failure(self):
        initial = self.mod.handle({"action": "status"})
        baseline = self.mod.handle(
            {
                "action": "apply",
                "revision": initial["revision"],
                "policy": {
                    "version": 1,
                    "enabled": True,
                    "rules": [{"action": "deny", "protocol": "tcp", "sources": ["203.0.113.1"], "ports": "80"}],
                },
            }
        )
        baseline_rules = list(self.read_pf_state()["anchor_rules"])
        next_policy = {
            "version": 1,
            "enabled": True,
            "rules": [{"action": "deny", "protocol": "tcp", "sources": ["203.0.113.2"], "ports": "443"}],
        }

        self.update_pf_state(fail_dry_run=True)
        with self.assertRaises(RuntimeError):
            self.mod.handle({"action": "apply", "revision": baseline["revision"], "policy": next_policy})
        self.update_pf_state(fail_dry_run=False)
        self.assertEqual(self.read_pf_state()["anchor_rules"], baseline_rules)
        self.assertEqual(self.mod.handle({"action": "status"})["revision"], baseline["revision"])

        self.update_pf_state(fail_apply=True)
        with self.assertRaises(RuntimeError):
            self.mod.handle({"action": "apply", "revision": baseline["revision"], "policy": next_policy})
        self.update_pf_state(fail_apply=False)
        self.assertEqual(self.read_pf_state()["anchor_rules"], baseline_rules)

        with mock.patch.object(self.mod, "write_atomic", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                self.mod.handle({"action": "apply", "revision": baseline["revision"], "policy": next_policy})
        self.assertEqual(self.read_pf_state()["anchor_rules"], baseline_rules)
        self.assertEqual(self.mod.handle({"action": "status"})["revision"], baseline["revision"])

    def test_restore_converges_after_reboot_and_is_idempotent(self):
        initial = self.mod.handle({"action": "status"})
        self.mod.handle(
            {
                "action": "apply",
                "revision": initial["revision"],
                "policy": {
                    "version": 1,
                    "enabled": True,
                    "rules": [{"action": "deny", "protocol": "tcp", "sources": ["198.51.100.0/24"], "ports": "8080"}],
                },
            }
        )

        self.update_pf_state(anchor_rules=[], references=[], calls=[])
        self.assertFalse(self.mod.handle({"action": "status"})["inSync"])

        self.mod.handle(None, restore=True)
        restored_status = self.mod.handle({"action": "status"})
        self.assertTrue(restored_status["pfEnabled"])
        self.assertTrue(restored_status["inSync"])
        self.assertEqual(len(self.read_pf_state()["references"]), 1)

        self.update_pf_state(calls=[])
        self.mod.handle(None, restore=True)
        second_calls = self.read_pf_state()["calls"]
        self.assertFalse(any("-f" in call or call == ["-E"] for call in second_calls))
        self.assertEqual(len(self.read_pf_state()["references"]), 1)

    def test_outbound_state_rules_and_restore_from_missing_pass_out(self):
        self.write_management({"address": "198.51.100.10", "sshPort": 22, "panelPort": 4210})
        initial = self.mod.handle({"action": "status"})
        default_deny = {
            "version": 1,
            "enabled": True,
            "rules": [
                {"action": "allow", "protocol": "tcp/udp", "ports": "*", "sources": ["198.51.100.10"]},
                {"action": "deny", "protocol": "tcp/udp", "ports": "*", "sources": ["any"]},
            ],
        }
        with mock.patch.object(self.mod.socket, "if_nameindex", return_value=[(1, "lo0"), (2, "utun7")]):
            saved = self.mod.handle({"action": "apply", "revision": initial["revision"], "policy": default_deny})
            expected_rules = list(self.read_pf_state()["anchor_rules"])
            body, _ = self.mod.render(saved["policy"])
            table = next(line.split()[1] for line in body.splitlines() if line.startswith("table "))
            local = "(utun7) port 1:65535"
            for proto in ("tcp", "udp"):
                self.assertTrue(
                    any(
                        line.startswith(f"pass out on ! lo0 proto {proto} from {local} to {table} keep state")
                        for line in expected_rules
                    )
                )
                self.assertTrue(
                    any(
                        line.startswith(f"block drop in quick on ! lo0 proto {proto} from {table} to {local}")
                        for line in expected_rules
                    )
                )
            self.update_pf_state(anchor_rules=[r for r in expected_rules if not r.startswith("pass out ")])
            self.assertFalse(self.mod.handle({"action": "status"})["inSync"])
            self.mod.handle(None, restore=True)
            self.assertEqual(self.read_pf_state()["anchor_rules"], expected_rules)
            self.assertEqual(self.mod.handle({"action": "status"}), saved)

    @unittest.skipUnless(sys.platform == "darwin", "requires the macOS PF parser")
    def test_macos_pfctl_parser(self):
        pol = self.mod.policy(
            {
                "version": 1,
                "enabled": True,
                "rules": [
                    {"action": "allow", "protocol": "tcp", "ports": "80", "sources": ["192.0.2.0/24", "2001:db8::/32"]},
                    {"action": "deny", "protocol": "tcp", "ports": "80", "sources": ["any"]},
                    {"action": "deny", "protocol": "udp", "ports": "53", "sources": ["203.0.113.0/24"]},
                ],
            }
        )
        with mock.patch.object(self.mod.socket, "if_nameindex", return_value=[(1, "lo0"), (2, "en0")]):
            body, _ = self.mod.render(pol)
        result = subprocess.run(
            ["/sbin/pfctl", "-nvf", "-"],
            input=body,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        lines = result.stdout.splitlines()
        for proto, port, state in (("tcp", 80, "flags S/SA keep state"), ("udp", 53, "keep state")):
            local = f"(en0) port = {port}"
            block = next(
                (line for line in lines if f"proto {proto} from <" in line and f"to {local} label" in line),
                None,
            )
            self.assertIsNotNone(block, result.stdout)
            peers = block.split(" from ")[1].split()[0]
            self.assertTrue(
                any(
                    f"pass out on ! lo0 proto {proto} from {local} to {peers} {state}" in line
                    for line in lines
                ),
                result.stdout,
            )

    def test_converge_reenables_pf_when_externally_disabled_and_handles_corrupt_policy_and_status_limit(self):
        initial = self.mod.handle({"action": "status"})
        self.mod.handle(
            {
                "action": "apply",
                "revision": initial["revision"],
                "policy": {
                    "version": 1,
                    "enabled": True,
                    "rules": [{"action": "deny", "protocol": "tcp", "sources": ["198.51.100.0/24"], "ports": "8080"}],
                },
            }
        )
        self.update_pf_state(force_disabled=True)
        self.assertFalse(self.mod.handle({"action": "status"})["inSync"])
        self.mod.handle(None, restore=True)
        restored = self.mod.handle({"action": "status"})
        self.assertTrue(restored["pfEnabled"])
        self.assertTrue(restored["inSync"])

        with mock.patch.object(self.mod, "render", side_effect=self.mod.Invalid("rule_limit")):
            degraded = self.mod.handle({"action": "status"})
        self.assertEqual(degraded["policy"]["version"], 1)
        self.assertFalse(degraded["inSync"])

        (self.mod.DATA / "policy.json").write_text("{corrupt")
        with self.assertRaises(RuntimeError):
            self.mod.handle({"action": "status"})

    def test_cli_main_protocol_and_error_envelopes(self):
        def run_main(argv, stdin_bytes):
            buf = io.BytesIO(stdin_bytes)
            stdin = mock.Mock(buffer=buf)
            out = io.StringIO()
            err = io.StringIO()
            with mock.patch.object(self.mod.sys, "argv", ["fluxmonitor-pf", *argv]), \
                mock.patch.object(self.mod.sys, "stdin", stdin), \
                mock.patch.object(self.mod.sys, "stdout", out), \
                mock.patch.object(self.mod.sys, "stderr", err):
                code = self.mod.main()
            return code, out.getvalue().strip(), err.getvalue().strip()

        code, out, _ = run_main(["--unknown"], b"")
        self.assertEqual(code, 2)
        self.assertEqual(out, "")

        code, out, _ = run_main([], b"x" * (self.mod.LIMIT + 1))
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(out), {"error": "invalid", "detail": "request_size"})

        code, out, _ = run_main([], json.dumps({"action": "status"}).encode())
        self.assertEqual(code, 0)
        parsed = json.loads(out)
        self.assertEqual(parsed["policy"]["version"], 1)

        code, out, _ = run_main(
            [],
            json.dumps(
                {
                    "action": "apply",
                    "revision": "stale",
                    "policy": {"version": 1, "enabled": False, "rules": []},
                }
            ).encode(),
        )
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(out), {"error": "conflict"})

        self.write_management({"address": "198.51.100.10", "sshPort": 22, "panelPort": 4210})
        (self.mod.DATA / "policy.json").write_text(
            json.dumps(
                {
                    "version": 1,
                    "enabled": True,
                    "rules": [{"action": "deny", "protocol": "tcp", "sources": ["any"], "ports": "22"}],
                }
            )
        )
        code, out, err = run_main(["--restore"], b"")
        self.assertEqual(code, 1)
        self.assertEqual(out, "")
        self.assertIn("management_access", err)

    def test_setup_script_syntax_and_cli_guards(self):
        syntax = subprocess.run(["bash", "-n", str(SETUP_SCRIPT_PATH)], capture_output=True, text=True)
        self.assertEqual(syntax.returncode, 0, syntax.stderr)

        help_res = subprocess.run(["/bin/bash", str(SETUP_SCRIPT_PATH), "--help"], capture_output=True, text=True)
        self.assertEqual(help_res.returncode, 0, help_res.stderr)
        self.assertIn("install", help_res.stdout)
        self.assertIn("uninstall", help_res.stdout)
        self.assertIn("--clear-management", help_res.stdout)

        bad_res = subprocess.run(["/bin/bash", str(SETUP_SCRIPT_PATH), "--bogus"], capture_output=True, text=True)
        self.assertEqual(bad_res.returncode, 2)

        if os.geteuid() != 0:
            non_root = subprocess.run(
                ["/bin/bash", str(SETUP_SCRIPT_PATH), "install"],
                capture_output=True,
                text=True,
            )
            self.assertEqual(non_root.returncode, 1)
            self.assertIn("root", non_root.stderr)


if __name__ == "__main__":
    unittest.main()
