# Contributing

This is an early historical-analysis prototype with no established actual NHL benchmark. Keep that distinction visible in code, reports and documentation.

## Local checks

Use Python 3.11 and a virtual environment. Install the optional pinned tools with `python -m pip install -r requirements-dev.txt`, then run:

```bash
PYTHONPATH=src python -m unittest discover -s tests -v
python -m ruff check src tests scripts
python -m mypy --strict src tests scripts
python -m compileall -q src tests scripts
python scripts/verify_demo.py
```

All applicable checks must pass on the final tree before committing or pushing. CI repeats them. The project has no browser UI or deployed service; browser interaction checks are not a substitute for CLI/data validation and are not currently applicable to a product UI.

## Pull requests

Explain the problem, resulting behavior, scope and validation. Add meaningful regressions for changed identity, temporal, scoring or error behavior. Keep patches bounded and avoid implementation-mirroring tests. Preserve existing inputs and prior results. Use a draft PR while review or checks remain pending.

No new data source is supported until its rights, actual schema, identities, completeness and timing are verified. Never use post-game fields as pre-game features, silently repair conflicting rows, fabricate timestamps/outcomes, or label retrospective replay as published forecast accuracy.

## Publication hygiene

Do not commit provider datasets, private evaluations, notebooks with private output, credentials, `.env` files, transfer links, tokens, caches or generated builds/results. Check the staged file list and diff before each commit and push. A future license choice requires an explicit maintainer decision; do not assume one from public visibility.
