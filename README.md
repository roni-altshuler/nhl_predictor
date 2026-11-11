# NHL Predictor

Blue Line is an explorable hockey analysis prototype with a responsive React interface and a reproducible offline Python evaluator. Browse sample games, inspect team ratings, compare hypothetical matchups, and follow a transparent accuracy timeline.

> **Maturity: early prototype.** The included example uses artificial teams and outcomes. No actual NHL accuracy benchmark, live prediction service, betting advantage, or production readiness has been established.

## Project status

| Area | Included functionality |
| --- | --- |
| Baselines | Fixed-parameter Elo, an earlier-date home-win-rate baseline, and a constant 50/50 probability reference |
| Evaluation | A dated warmup/holdout split with daily state updates, accuracy, Brier score, log loss, and descriptive accuracy intervals |
| Identity and coverage | Reciprocal home/away row validation, stable source game IDs, and explicit exclusions |
| Example data | Synthetic contract fixtures only; no observed NHL results |
| External data adapter | A provisional MoneyPuck-format CSV contract, tested against synthetic inputs |
| Web interface | Game/day explorer, team profiles, matchup sandbox, cumulative/recent accuracy and coverage notes |
| Actual NHL coverage | Unavailable; no verified real results, original forecast receipts or live feed |
| Hosting | Deployment pending; no verified public website URL yet |

## Explore the web app locally

The interface follows the sports dashboard family with desktop navigation and a compact mobile menu, using original Blue Line branding and hockey-specific analysis. All bundled results are artificial and clearly labeled. Choose **NHL · unavailable** to inspect the real-data empty state; the app never fills it with demonstration statistics.

Use **Node.js 24 LTS** and **Python 3.11**. From the repository root:

```bash
npm --prefix web ci
npm --prefix web run dev
# Open http://127.0.0.1:5173
```

- **Games:** filter by season, evaluation phase, team, ID and date; open a stable game detail URL and inspect earlier-date state.
- **Teams:** sort fixture records and ratings; explore individual rating histories and outcomes. NHL standings points, rosters and overtime splits are unavailable.
- **Matchup lab:** choose two artificial teams and a replay cutoff; compare Elo, the past home rate and a 50/50 reference. This is a hypothetical calculation, not a saved pre-event forecast.
- **Track record:** see correct/scored counts, percentage, cumulative/recent history, per-game picks, Brier score and log loss. Warmup and excluded games never enter the holdout denominator; an empty selection is unavailable.
- **Method & coverage:** inspect the source hash, five exclusion categories, chronological protocol and downloadable synthetic report. Failed or malformed data shows an error with a retry control and no metrics.

A static production build needs no API, keys or server functions:

```bash
npm --prefix web run build
npm --prefix web run preview
# Open http://127.0.0.1:4173
```

`web/dist/version.json` and the footer identify the build commit when built with `APP_COMMIT`, `VERCEL_GIT_COMMIT_SHA` or `GITHUB_SHA`; otherwise they say `local-preview`. The checked-in Vercel configuration describes the static build only. It does not create a hosting project or establish that a deployment is reachable. A public website link will be added after deployment and live browser verification.

## Offline evaluator quick start

Python **3.11** is the tested version. The Python evaluator and tests use the standard library; no API key, account, provider request, or model download is required for the included example.

```bash
git clone https://github.com/roni-altshuler/nhl_predictor.git
cd nhl_predictor
python3.11 -m venv .venv
source .venv/bin/activate

python src/nhl_prototype.py \
  --csv data/synthetic_teams.csv \
  --manifest data/synthetic-manifest.json \
  --holdout-start 2024-07-01 \
  --as-of 2025-07-01 \
  --output-dir outputs/synthetic-demo
```

The command writes `evaluation.json` and `predictions.csv`. The JSON report identifies the input as a synthetic fixture; the CSV contains per-game records. Their numbers demonstrate the software contract; **they are not NHL performance evidence**. Inputs and different prior results are protected from overwrite. An identical run may be repeated safely.

## How it works

```text
Local CSV + source manifest
            |
      Byte-hash check
            |
 Reciprocal game validation
            |
 Coverage and exclusions
            |
 Chronological daily batches
            |
 Past-state probabilities -> after-date state updates
            |
 Holdout scores + per-game records
```

The implementation is a single typed module in [`src/nhl_prototype.py`](src/nhl_prototype.py). It makes no network requests. A manifest identifies the data kind and binds the input bytes with SHA-256; the hash establishes byte identity, not provider authenticity or original publication timing.

For the provisional CSV contract, each game has exactly one home and one away `situation=all` row. Team identities, date, season and reciprocal scores must agree. Source IDs are preserved, including gaps. Conflicting or duplicate rows fail validation. Other situations are counted without becoming extra games.

Only resolved regular-season games with unequal mirrored goal totals are scored. Playoffs, preseason/other game types, future dates, blank scores and tied totals receive explicit exclusion counts. A shootout winner is never guessed from tied goal totals. This selected target must not be presented as accuracy across every NHL game.

## Evaluation protocol

- Elo starts unseen source team codes at 1500, with K=20 and scale=400. It has no home offset or offseason reset. Source code changes stay separate without a verified franchise mapping.
- The home-rate probability uses Beta(1,1) smoothing over eligible games from earlier provider dates. The constant 50/50 probability reference uses the same deterministic threshold rule as the other baselines: pick home at probability 0.5 or above.
- All probabilities on a date are computed before any result from that date updates state. Earlier completed holdout dates may update later state: this is an online chronological replay, with fixed parameters and no shuffled split or holdout tuning.
- Accuracy is a fraction with correct/total counts; Brier is binary mean squared probability error; log loss uses natural logarithms with clipping at `1e-15`. The Wilson accuracy interval is descriptive and does not account for team/date dependence.
- No eligible holdout or no warmup produces unavailable scored metrics, not a zero-accuracy claim. Per-game records expose phase, probabilities, outcomes and cold starts.

Historical replay does not establish that inputs were available before each real game. Original result-availability times and later source corrections are unknown. Coverage is observed-file coverage, not independently reconciled schedule completeness. See [`docs/EVALUATION.md`](docs/EVALUATION.md).

## Data sources and licensing

The bundled CSV contains artificial teams `AAA`, `BBB`, `CCC` and `DDD`, artificial outcomes, and identifiers shaped for the schema contract. It is not a provider download. Its 25 artificial game identities produce 20 eligible fixture games: 12 warmup, 8 holdout and 5 excluded cases. These are test counts only.

The optional adapter targets a team-game download listed on [MoneyPuck's data page](https://moneypuck.com/data.htm). MoneyPuck's published terms allow noncommercial use with clear MoneyPuck.com attribution and restrict unapproved scraping. No external dataset is distributed here, and this project does not assert permission to redistribute one. Review current provider terms before obtaining or using actual data.

**Compatibility with a current MoneyPuck file, its winner semantics, and actual NHL coverage remain unverified.** The repository includes no downloader and makes no actual NHL benchmark claim. See [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) for the input contract and provenance requirements.

No project-wide reuse license has been assigned to this code or its synthetic fixtures. Public visibility does not establish an open-source license or a license to third-party data. Web runtime dependencies retain their MIT licenses, recorded in [`web/public/THIRD_PARTY_NOTICES.md`](web/public/THIRD_PARTY_NOTICES.md). Developer tools retain their upstream licenses; dependency directories and build output are not committed. See [`docs/LICENSING.md`](docs/LICENSING.md).

## Development and verification

After modifying the evaluator or original artificial fixture, regenerate its website snapshot explicitly and inspect the diff. The exporter refuses external data or a changed fixture identity. Normal checks compare bytes without rewriting the input or snapshot.

```bash
python scripts/export_web_demo.py
python scripts/export_web_demo.py --check
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web test
npm --prefix web run build
# First install the pinned Playwright browser for browser QA:
cd web
npx playwright install chromium
npm run test:browser
cd ..
```

Browser QA starts a temporary production preview automatically. It covers desktop, tablet and narrow mobile layouts, accessible controls, filters, record exploration, dialogs, back/forward/reload, unavailable/corrupt data, retry, and interrupted loading. Screenshots and accessibility reports go to ignored `web/test-results/`. Set `PLAYWRIGHT_EXECUTABLE_PATH` only when deliberately using an installed Chromium; CI uses Playwright's pinned browser.

```bash
# Full standard-library test suite
PYTHONPATH=src python -m unittest discover -s tests -v

# Optional pinned development tools from PyPI
python -m pip install -r requirements-dev.txt
python -m ruff check src tests scripts
python -m mypy --strict src tests scripts

# Build a standalone standard-library zip application
python scripts/build.py

# Verify source and packaged commands produce identical fixture outputs
python scripts/verify_demo.py
```

The zip application is `dist/nhl-prototype.pyz` and accepts the same arguments as the source command. Generated outputs and build artifacts are ignored by Git. CI runs Python tests, lint, strict types, compilation and packaged-demo verification on Python 3.11, plus frontend tests, lint, strict types, production build, deterministic data check and responsive browser QA on Node.js 24. A passing CI run validates the included code and fixtures; it does not validate an external data corpus or a live product.

Tests cover stable identities, conflicting rows, unavailable outcomes, future and same-day leakage, scoring formulas, provenance hashes, reproducible CLI output and preservation of prior results. See [CONTRIBUTING.md](CONTRIBUTING.md) for the review process.

## Repository layout

```text
src/nhl_prototype.py       Import, validation, replay, scoring and CLI
tests/test_prototype.py   Analytic, temporal, data-contract and CLI tests
data/                    Synthetic fixtures and input documentation
scripts/                 Build, verification and synthetic web exporter
web/                     React/TypeScript app, static sample and browser tests
docs/                    Evaluation, data and licensing notes
.github/workflows/ci.yml  Python and web checks
```

## Contributing and security

Contributions should include a clear target, reproducible tests and honest coverage/provenance limits. Do not commit externally sourced data, private reports, credentials or private generated evaluations. The public web snapshot is an explicit, deterministic derivative of the original synthetic fixture only. New data adapters require explicit rights review and real schema validation before compatibility is claimed.

For security-sensitive reports, follow [SECURITY.md](SECURITY.md). There is no advertised dedicated confidential disclosure channel in this repository; never put secrets or private data in a public issue.
