"""Check packaged/source equivalence with artificial data in a temporary folder."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

from build import ROOT, build


def invoke(command: list[str]) -> None:
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)


def main() -> None:
    source = ROOT / "data/synthetic_teams.csv"
    manifest = ROOT / "data/synthetic-manifest.json"
    originals = {path: path.read_bytes() for path in (source, manifest)}
    with tempfile.TemporaryDirectory(prefix="nhl-demo-check-") as folder:
        temporary = Path(folder)
        archive = build(temporary / "application.pyz")
        with zipfile.ZipFile(archive) as bundle:
            if set(bundle.namelist()) != {"__main__.py", "nhl_prototype.py"} or bundle.testzip():
                raise ValueError("The build must contain only its runtime and entry point")
        arguments = ["--csv", str(source), "--manifest", str(manifest),
                     "--holdout-start", "2024-07-01", "--as-of", "2025-07-01"]
        source_dir, packaged_dir = temporary / "source", temporary / "packaged"
        source_command = [sys.executable, str(ROOT / "src/nhl_prototype.py"),
                          *arguments, "--output-dir", str(source_dir)]
        invoke(source_command)
        invoke(source_command)
        invoke([sys.executable, str(archive), *arguments, "--output-dir", str(packaged_dir)])
        for name in ("evaluation.json", "predictions.csv"):
            if (source_dir / name).read_bytes() != (packaged_dir / name).read_bytes():
                raise ValueError(f"Source and packaged output differ: {name}")
        report = json.loads((source_dir / "evaluation.json").read_text())
        if (report["datasetKind"] != "synthetic-contract-fixture"
                or report["source"]["sha256"] != hashlib.sha256(originals[source]).hexdigest()
                or report["coverage"]["observedGameIds"] != 25
                or report["warmupGames"] != 12 or report["holdoutGames"] != 8
                or report["livePrediction"] or report["genuinePreEventPublicationEvidence"]
                or report["verifiedMarketAdvantage"]):
            raise ValueError("Fixture provenance, coverage or historical-only contract changed")
    if any(path.read_bytes() != raw for path, raw in originals.items()):
        raise ValueError("Demo validation changed an input")
    print("Synthetic demo verified: source/package output bytes match; inputs preserved.")
    print("No actual NHL benchmark or live product was evaluated.")


if __name__ == "__main__":
    main()
