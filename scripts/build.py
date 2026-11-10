"""Build only the included runtime module into a standard-library zip app."""
from __future__ import annotations

import argparse
import os
import tempfile
import zipapp
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build(destination: Path) -> Path:
    destination = destination.resolve()
    if destination.is_relative_to(ROOT / "src"):
        raise ValueError("Build output cannot be inside the runtime source directory")
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".nhl-build-", dir=destination.parent)
    os.close(fd)
    staged_output = Path(temporary)
    try:
        with tempfile.TemporaryDirectory(prefix="nhl-runtime-") as folder:
            staging = Path(folder)
            (staging / "nhl_prototype.py").write_bytes((ROOT / "src/nhl_prototype.py").read_bytes())
            zipapp.create_archive(staging, target=staged_output, main="nhl_prototype:main")
        os.replace(staged_output, destination)
    finally:
        staged_output.unlink(missing_ok=True)
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist/nhl-prototype.pyz")
    args = parser.parse_args()
    print(build(args.output))


if __name__ == "__main__":
    main()
