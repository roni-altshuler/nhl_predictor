# Data sources and provenance

## Included data

`data/synthetic_teams.csv` is an artificial schema fixture. Teams, outcomes and nominal IDs were created for tests. It contains no observed NHL results or third-party dataset rows. `data/synthetic-manifest.json` binds those bytes and explicitly identifies their synthetic origin.

## Optional external input contract

The adapter targets the all-team game-level CSV linked from [MoneyPuck's data page](https://moneypuck.com/data.htm). Required columns are:

```text
gameId, season, gameDate, playerTeam, opposingTeam,
home_or_away, situation, goalsFor, goalsAgainst
```

These are a provisional contract tested with synthetic fixtures. A current actual source file has not been validated for this repository. Do not infer compatible schema, winner semantics, complete coverage or provenance from a successful synthetic test.

For each selected `situation=all` game, the importer requires a home and away row whose identities and reciprocal scores agree. Stable IDs encode the declared season and supported game type. Missing or conflicting pairs fail rather than being deduplicated or renumbered. Source dates are calendar dates, not verified start/result-availability timestamps.

## Before using an actual file

1. Confirm the provider's current terms permit the intended use and any redistribution. MoneyPuck requires clear attribution for permitted noncommercial use and restricts unapproved scraping. This repository supplies neither a dataset license nor a downloader.
2. Preserve the lawfully acquired original bytes, source URL and actual timezone-aware retrieval time. Calculate SHA-256 from that file; do not substitute a hash of reformatted or manually copied content.
3. Create a manifest identifying `historical-moneypuck-download`, the listed download URL, terms URL, noncommercial use, actual retrieval time and raw-byte hash. The program checks those fields and bytes; it cannot authenticate a declared provider origin.
4. Inspect actual headers, paired identities, score/shootout semantics, date ranges, duplicates, season counts and exclusions. Reconcile to an authoritative schedule before claiming complete coverage. Do not guess missing winners.
5. Predeclare evaluation dates and settings. Run to a new output directory and review the coverage report before interpreting metrics. Keep external data and generated results outside version control.

Every report based on actual MoneyPuck input includes MoneyPuck.com credit. Provider conditions still apply independently of any future code license.
