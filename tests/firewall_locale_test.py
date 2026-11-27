from pathlib import Path
import re
import subprocess
import unittest

REPO_ROOT = Path(__file__).resolve().parent.parent
LOCALES_DIR = REPO_ROOT / "src" / "lib" / "locales"
EXPECTED_LOCALES = ("de", "en", "es", "fr", "it", "ja", "ko", "zh", "zh-TW")


def extract_firewall_entries(locale_text: str):
    sidebar_match = re.search(r"^\s+firewall:\s*(.+?),?\s*$", locale_text, re.M)
    block_match = re.search(r"^\s+firewall:\s*\{\n([\s\S]*?)^\s+\},?\s*$", locale_text, re.M)
    return sidebar_match, block_match


class FirewallLocaleAndScriptTests(unittest.TestCase):
    def test_all_nine_locales_share_identical_single_quoted_firewall_keys(self):
        locale_files = sorted(p.stem for p in LOCALES_DIR.glob("*.ts"))
        self.assertEqual(tuple(locale_files), EXPECTED_LOCALES)

        key_sets = {}
        for name in EXPECTED_LOCALES:
            path = LOCALES_DIR / f"{name}.ts"
            text = path.read_text(encoding="utf-8")
            sidebar_match, block_match = extract_firewall_entries(text)
            self.assertIsNotNone(sidebar_match, f"missing sidebar.firewall in {path.name}")
            sidebar_val = sidebar_match.group(1).strip()
            self.assertTrue(
                sidebar_val.startswith("'") and sidebar_val.endswith("'"),
                f"sidebar.firewall must use single quotes in {path.name}: {sidebar_val}",
            )

            self.assertIsNotNone(block_match, f"missing firewall block in {path.name}")
            keys = []
            for raw_line in block_match.group(1).splitlines():
                line = raw_line.strip()
                if not line:
                    continue
                entry = re.fullmatch(r"([A-Za-z][A-Za-z0-9]*):\s*'((?:\\'|[^'])*)',?", line)
                self.assertIsNotNone(entry, f"firewall entry must use single quotes in {path.name}: {line}")
                self.assertNotIn("’", entry.group(2), f"curly quote in {path.name}: {line}")
                keys.append(entry.group(1))
            self.assertEqual(len(keys), len(set(keys)), f"duplicate firewall keys in {path.name}")
            key_sets[name] = set(keys)

        reference = key_sets["en"]
        self.assertIn("permissionDenied", reference)
        self.assertIn("install", reference)
        for name, keys in key_sets.items():
            self.assertEqual(keys, reference, f"firewall key mismatch in {name}.ts")

    def test_packaging_scripts_pass_bash_syntax_check(self):
        for rel in ("scripts/pf/setup.sh", "launcher/bundle.sh", "deploy.sh"):
            res = subprocess.run(["bash", "-n", str(REPO_ROOT / rel)], capture_output=True, text=True)
            self.assertEqual(res.returncode, 0, f"{rel}: {res.stderr}")


if __name__ == "__main__":
    unittest.main()
