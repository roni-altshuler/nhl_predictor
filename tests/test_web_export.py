from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("export_web_demo", ROOT / "scripts/export_web_demo.py")
assert SPEC is not None and SPEC.loader is not None
EXPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORT)


class WebExportTests(unittest.TestCase):
    def test_export_is_deterministic_and_matches_public_bytes(self) -> None:
        before = (ROOT / "data/synthetic_teams.csv").read_bytes()
        report = EXPORT.build_demo()
        expected = json.dumps(report, sort_keys=True, indent=2, allow_nan=False) + "\n"
        self.assertEqual((ROOT / "web/public/data/demo.json").read_text(), expected)
        self.assertEqual(EXPORT.build_demo(), report)
        self.assertEqual((ROOT / "data/synthetic_teams.csv").read_bytes(), before)
        self.assertFalse(report["livePrediction"])
        self.assertEqual(report["metrics"]["elo"]["correct"], 4)

    def test_export_refuses_unreviewed_or_external_input(self) -> None:
        original: dict[str, Any] = json.loads((ROOT / "data/synthetic-manifest.json").read_text())
        for change in ({"datasetKind": "historical"}, {"sourceUrl": "https://example.com"}, {"sha256": "0" * 64}):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                (root / "data").mkdir()
                (root / "data/synthetic_teams.csv").write_bytes((ROOT / "data/synthetic_teams.csv").read_bytes())
                (root / "data/synthetic-manifest.json").write_text(json.dumps(original | change))
                with patch.object(EXPORT, "ROOT", root), self.assertRaises(ValueError):
                    EXPORT.build_demo()

    def test_original_manifest_cannot_authorize_changed_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "data").mkdir()
            (root / "data/synthetic_teams.csv").write_bytes(b"changed input")
            (root / "data/synthetic-manifest.json").write_bytes((ROOT / "data/synthetic-manifest.json").read_bytes())
            with patch.object(EXPORT, "ROOT", root), self.assertRaises(ValueError):
                EXPORT.build_demo()
