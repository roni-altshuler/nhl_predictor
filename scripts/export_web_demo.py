"""Export only the original artificial fixture for the public web demonstration."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from nhl_prototype import run  # noqa: E402


def build_demo() -> dict[str, Any]:
    raw = (ROOT / "data/synthetic_teams.csv").read_bytes()
    manifest = json.loads((ROOT / "data/synthetic-manifest.json").read_text())
    if manifest.get("datasetKind") != "synthetic-contract-fixture" or manifest.get("sourceUrl") is not None:
        raise ValueError("The website exporter accepts the original synthetic fixture only")
    if manifest.get("sha256") != "8282217d87f23344a6258524450027dba4764bd3c7723e837a0454450fc6911f":
        raise ValueError("Fixture identity changed; review before publishing")
    # No training, provider fetch, original-publication claim, or generated time.
    return run(raw, manifest, date(2024, 7, 1), date(2025, 7, 1))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    target = ROOT / "web/public/data/demo.json"
    payload = json.dumps(build_demo(), sort_keys=True, indent=2, allow_nan=False) + "\n"
    if args.check:
        if not target.is_file() or target.read_text() != payload:
            raise SystemExit("Web demo differs from its reviewed source; regenerate and inspect locally")
        print("Web demo matches the original synthetic input and evaluator")
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(payload)
        print("Exported artificial demonstration only; no actual NHL data")


if __name__ == "__main__":
    main()
