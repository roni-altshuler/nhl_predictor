"""Offline noncommercial historical replay; no network or live forecasts.

MoneyPuck.com must be credited when its data is used. The CSV adapter's schema
contract remains provisional until a lawfully acquired actual file is validated.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import itertools
import json
import math
import re
from collections import Counter, defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

DATA_URL = "https://moneypuck.com/moneypuck/playerData/careers/gameByGame/all_teams.csv"
TERMS_URL = "https://moneypuck.com/data.htm"
ATTRIBUTION = "Data source: MoneyPuck.com. Noncommercial historical analysis with attribution."
EPSILON = 1e-15
REQUIRED = {
    "gameId", "season", "gameDate", "playerTeam", "opposingTeam",
    "home_or_away", "situation", "goalsFor", "goalsAgainst",
}
MODELS = ("elo", "past_home_rate", "coin_flip")


@dataclass(frozen=True)
class Game:
    source_id: str
    season: int
    day: date
    home: str
    away: str
    home_goals: int
    away_goals: int

    def __post_init__(self) -> None:
        if (not re.fullmatch(r"20[0-9]{8}", self.source_id)
                or self.source_id[4:6] != "02" or int(self.source_id[6:]) == 0
                or self.season != int(self.source_id[:4])
                or self.day.year not in (self.season, self.season + 1)
                or any(not re.fullmatch(r"[A-Z][A-Z0-9]{1,4}", t) for t in (self.home, self.away))
                or self.home == self.away or self.home_goals == self.away_goals
                or any(type(s) is not int or s < 0 for s in (self.home_goals, self.away_goals))):
            raise ValueError("Game must have a stable regular-season identity and resolved unequal totals")

    @property
    def identity(self) -> str:
        return f"nhl:{self.source_id}"

    @property
    def home_win(self) -> int:
        return int(self.home_goals > self.away_goals)


@dataclass(frozen=True)
class TeamRow:
    source_id: str
    season: int
    day: date
    team: str
    opponent: str
    side: str
    goals_for: int | None
    goals_against: int | None


def _score(value: str) -> int | None:
    if not value.strip():
        return None
    # Preserve integer totals even when a CSV represents them as e.g. 2.0.
    if not re.fullmatch(r"[0-9]+(?:\.0+)?", value):
        raise ValueError(f"Invalid goal total: {value!r}")
    return int(value.split(".")[0])


def _parse_row(row: dict[str, str]) -> TeamRow:
    game_id = row["gameId"]
    if not re.fullmatch(r"20[0-9]{8}", game_id) or int(game_id[6:]) == 0:
        raise ValueError(f"Invalid stable game ID: {game_id!r}")
    if not re.fullmatch(r"20[0-9]{2}", row["season"]):
        raise ValueError("Invalid season start year")
    season = int(row["season"])
    if season != int(game_id[:4]):
        raise ValueError("Game ID and season disagree")
    if not re.fullmatch(r"[0-9]{8}", row["gameDate"]):
        raise ValueError("Expected provider date YYYYMMDD")
    day = datetime.strptime(row["gameDate"], "%Y%m%d").date()
    if day.year not in (season, season + 1):
        raise ValueError("Game date and season disagree")
    team, opponent = row["playerTeam"], row["opposingTeam"]
    if any(not re.fullmatch(r"[A-Z][A-Z0-9]{1,4}", t) for t in (team, opponent)):
        raise ValueError("Missing or malformed source team code")
    if team == opponent:
        raise ValueError("A team cannot play itself")
    side = row["home_or_away"]
    if side not in ("HOME", "AWAY"):
        raise ValueError("Unknown home/away designation")
    return TeamRow(game_id, season, day, team, opponent, side,
                   _score(row["goalsFor"]), _score(row["goalsAgainst"]))


def load_games(raw: bytes, as_of: date) -> tuple[list[Game], dict[str, Any]]:
    """Validate reciprocal team rows; retain only resolved regular-season games.

    Source goal totals do not establish a winner when tied. In particular, no
    shootout winner is inferred. IDs are never renumbered to close schedule gaps.
    """
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig"), newline=""))
    fields = reader.fieldnames or []
    if len(fields) != len(set(fields)) or not REQUIRED.issubset(fields):
        raise ValueError("Missing or duplicate required CSV columns")
    pairs: dict[str, list[TeamRow]] = defaultdict(list)
    rows = 0
    situations: Counter[str] = Counter()
    for source_row in reader:
        rows += 1
        if None in source_row or any(v is None for v in source_row.values()):
            raise ValueError(f"Malformed CSV row {rows}")
        row: dict[str, str] = source_row
        situations[row["situation"]] += 1
        if row["situation"] != "all":
            continue
        record = _parse_row(row)
        pairs[record.source_id].append(record)
    if not pairs:
        raise ValueError("No all-situation rows; source schema/coverage is unverified")

    games: list[Game] = []
    excluded: Counter[str] = Counter()
    seasons: dict[int, dict[str, Any]] = {}
    for game_id, group in sorted(pairs.items()):
        if len(group) != 2 or {r.side for r in group} != {"HOME", "AWAY"}:
            raise ValueError(f"Game {game_id} needs exactly one home and one away row")
        home = next(r for r in group if r.side == "HOME")
        away = next(r for r in group if r.side == "AWAY")
        if (home.season != away.season or home.day != away.day
                or home.team != away.opponent or away.team != home.opponent
                or home.goals_for != away.goals_against
                or away.goals_for != home.goals_against):
            raise ValueError(f"Conflicting identity or reciprocal results for {game_id}")
        season = seasons.setdefault(home.season, {
            "observedGames": 0, "eligibleGames": 0, "exclusions": {},
            "firstObservedDate": home.day.isoformat(), "lastObservedDate": home.day.isoformat(),
            "teamCodes": set(),
        })
        season["observedGames"] += 1
        season["firstObservedDate"] = min(season["firstObservedDate"], home.day.isoformat())
        season["lastObservedDate"] = max(season["lastObservedDate"], home.day.isoformat())
        season["teamCodes"].update((home.team, away.team))
        reason = None
        if game_id[4:6] != "02":
            reason = {"01": "preseason", "03": "playoffs"}.get(game_id[4:6], "other_game_type")
        elif home.day > as_of:
            reason = "after_as_of_date"
        elif home.goals_for is None or away.goals_for is None:
            reason = "unsettled_score"
        elif home.goals_for == away.goals_for:
            reason = "tied_totals_outcome_unresolved"
        if reason:
            excluded[reason] += 1
            season["exclusions"][reason] = season["exclusions"].get(reason, 0) + 1
            continue
        assert home.goals_for is not None and away.goals_for is not None
        season["eligibleGames"] += 1
        games.append(Game(game_id, home.season, home.day, home.team, away.team,
                          home.goals_for, away.goals_for))
    for summary in seasons.values():
        summary["teamCodes"] = sorted(summary["teamCodes"])
    games.sort(key=lambda g: (g.day, g.source_id))
    coverage = {
        "rawRows": rows, "situations": dict(sorted(situations.items())),
        "observedGameIds": len(pairs), "eligibleRegularSeasonGames": len(games),
        "excludedGames": dict(sorted(excluded.items())),
        "seasons": {str(year): value for year, value in sorted(seasons.items())},
        "coverageBasis": "Observed source rows only; expected schedule completeness is not verified.",
        "winnerTarget": "Home/away winner only where mirrored all-situation goal totals are unequal.",
        "dateGranularity": "Provider calendar date; no exact start or result-availability time.",
    }
    return games, coverage


def metrics(samples: Sequence[tuple[float, int]]) -> dict[str, Any] | None:
    if not samples:
        return None
    for p, y in samples:
        if not math.isfinite(p) or not 0 <= p <= 1 or type(y) is not int or y not in (0, 1):
            raise ValueError("Invalid probability/outcome for scoring")
    n = len(samples)
    correct = sum(int(p >= 0.5) == y for p, y in samples)
    fraction = correct / n
    z = 1.959963984540054
    denominator = 1 + z * z / n
    center = (fraction + z * z / (2 * n)) / denominator
    half = z * math.sqrt(fraction * (1 - fraction) / n + z * z / (4 * n * n)) / denominator
    return {
        "games": n, "correct": correct, "accuracy": fraction,
        "accuracyWilson95": [max(0.0, center - half), min(1.0, center + half)],
        "brier": sum((p - y) ** 2 for p, y in samples) / n,
        "logLoss": -sum(y * math.log(max(EPSILON, min(1 - EPSILON, p)))
                        + (1 - y) * math.log(max(EPSILON, min(1 - EPSILON, 1 - p)))
                        for p, y in samples) / n,
    }


def evaluate(games: Sequence[Game], cutoff: date, as_of: date) -> dict[str, Any]:
    """Fixed-parameter online replay, frozen within each provider date."""
    if cutoff > as_of:
        raise ValueError("Holdout start must not be after the as-of date")
    if len({g.identity for g in games}) != len(games):
        raise ValueError("Duplicate game identity")
    for g in games:
        if g.day > as_of or g.home_goals == g.away_goals or g.home == g.away:
            raise ValueError("Evaluation received an ineligible game")
    ratings: dict[str, float] = {}
    played = home_wins = warmup_count = 0
    records: list[dict[str, Any]] = []
    samples: dict[str, list[tuple[float, int]]] = {model: [] for model in MODELS}
    per_season: dict[int, dict[str, list[tuple[float, int]]]] = {}
    holdout_home_wins = 0
    for day, batch_iter in itertools.groupby(sorted(games, key=lambda g: (g.day, g.source_id)),
                                             key=lambda g: g.day):
        batch = list(batch_iter)
        changes: dict[str, float] = defaultdict(float)
        past_home_rate = (home_wins + 1) / (played + 2)
        for game in batch:
            home_rating = ratings.get(game.home, 1500.0)
            away_rating = ratings.get(game.away, 1500.0)
            exponent = max(-15.0, min(15.0, (away_rating - home_rating) / 400.0))
            probabilities = {"elo": 1 / (1 + 10 ** exponent),
                             "past_home_rate": past_home_rate, "coin_flip": 0.5}
            holdout = day >= cutoff
            records.append({
                "gameId": game.identity, "sourceGameId": game.source_id,
                "seasonStartYear": game.season, "date": day.isoformat(),
                "homeTeam": game.home, "awayTeam": game.away,
                "homeGoals": game.home_goals, "awayGoals": game.away_goals,
                "actualHomeWin": game.home_win, "phase": "holdout" if holdout else "warmup",
                "pastEligibleGames": played, "pastHomeWins": home_wins,
                "coldStartHome": game.home not in ratings, "coldStartAway": game.away not in ratings,
                "homeWinProbability": probabilities,
            })
            if holdout:
                season_samples = per_season.setdefault(game.season, {m: [] for m in MODELS})
                holdout_home_wins += game.home_win
                for model, probability in probabilities.items():
                    samples[model].append((probability, game.home_win))
                    season_samples[model].append((probability, game.home_win))
            else:
                warmup_count += 1
            change = 20.0 * (game.home_win - probabilities["elo"])
            changes[game.home] += change
            changes[game.away] -= change
        # No same-date outcome influences another game's probability.
        for team, change in changes.items():
            ratings[team] = ratings.get(team, 1500.0) + change
        played += len(batch)
        home_wins += sum(g.home_win for g in batch)
    count = len(samples["elo"])
    status = "evaluated" if warmup_count and count else (
        "no-eligible-holdout" if not count else "insufficient-warmup")
    scored = {m: metrics(v) for m, v in samples.items()} if status == "evaluated" else None
    return {
        "status": status, "warmupGames": warmup_count, "holdoutGames": count,
        "holdoutStart": cutoff.isoformat(), "asOfDate": as_of.isoformat(),
        "metrics": scored,
        "perSeasonHoldoutMetrics": {str(year): {m: metrics(v) for m, v in values.items()}
                                    for year, values in sorted(per_season.items())}
        if status == "evaluated" else {},
        "observedHoldoutHomeWinRate": holdout_home_wins / count if count else None,
        "method": {
            "elo": {"initialRating": 1500, "kFactor": 20, "scale": 400, "homeOffset": 0,
                    "offseasonReset": False},
            "homeRate": "Beta(1,1) smoothed designated-home wins from eligible earlier dates only",
            "coinFlip": 0.5, "pickRule": "Home if probability >= 0.5; otherwise away",
            "updates": "Parameters fixed; both warmup and past holdout outcomes update state after each date",
            "units": "Accuracy fraction; binary Brier; natural-log loss clipped at 1e-15",
            "intervalLimit": "Wilson accuracy interval is descriptive and ignores team/date dependence",
            "neutralVenue": "Home is a source designation, not verified physical home advantage",
        },
        "records": records,
    }


def verify_manifest(manifest: dict[str, Any], raw: bytes) -> None:
    if type(manifest.get("schemaVersion")) is not int or manifest["schemaVersion"] != 1:
        raise ValueError("Unsupported source manifest")
    digest = manifest.get("sha256")
    if (not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest)
            or digest != hashlib.sha256(raw).hexdigest()):
        raise ValueError("Source SHA-256 is missing or does not match the CSV bytes")
    kind = manifest.get("datasetKind")
    if kind == "synthetic-contract-fixture":
        if manifest.get("sourceUrl") is not None:
            raise ValueError("A synthetic fixture cannot claim a provider download URL")
    elif kind == "historical-moneypuck-download":
        if (manifest.get("sourceUrl") != DATA_URL or manifest.get("termsUrl") != TERMS_URL
                or manifest.get("noncommercialUse") is not True
                or not isinstance(manifest.get("retrievedAtUtc"), str)):
            raise ValueError("Actual data needs the listed source, terms, scope and retrieval time")
        timestamp = datetime.fromisoformat(manifest["retrievedAtUtc"].replace("Z", "+00:00"))
        if timestamp.utcoffset() is None or timestamp > datetime.now(timezone.utc):
            raise ValueError("Source retrieval time must be timezone-aware and not in the future")
    else:
        raise ValueError("Unknown dataset kind; fixture and actual observations must remain distinct")


def run(raw: bytes, manifest: dict[str, Any], cutoff: date, as_of: date) -> dict[str, Any]:
    verify_manifest(manifest, raw)
    games, coverage = load_games(raw, as_of)
    result = evaluate(games, cutoff, as_of)
    result.update({
        "schemaVersion": 1, "datasetKind": manifest["datasetKind"],
        "source": manifest, "coverage": coverage,
        "attribution": ATTRIBUTION if manifest["datasetKind"] == "historical-moneypuck-download"
        else "Synthetic contract fixtures, created for tests; not observed NHL results.",
        "livePrediction": False, "genuinePreEventPublicationEvidence": False,
        "verifiedMarketAdvantage": False,
        "limitations": [
            "Historical replay from later-acquired data; original availability/correction times are unknown.",
            "Only this file's schema/counts are checked; official schedule completeness is not verified.",
            "Manifest source identity is declared; a byte hash does not authenticate provider origin.",
            "Only unequal mirrored goal totals are scored; no shootout outcome is invented from tied totals.",
            "Excluding tied/unsettled totals changes the sample; this is not all-game NHL winner accuracy.",
            "No odds comparison, betting-return estimate, tuning on the holdout or live provider integration.",
            "Source team-code changes remain separate entities; franchise aliases are not inferred.",
        ],
    })
    return result


def _prediction_csv(records: list[dict[str, Any]]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(["game_id", "date", "season", "phase", "home", "away", "actual_home_win",
                     "past_games", "p_elo_home", "p_past_home_rate", "p_coin_flip"])
    for row in records:
        writer.writerow([row["gameId"], row["date"], row["seasonStartYear"], row["phase"],
                         row["homeTeam"], row["awayTeam"], row["actualHomeWin"],
                         row["pastEligibleGames"], *[row["homeWinProbability"][m] for m in MODELS]])
    return stream.getvalue().encode("utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--holdout-start", type=date.fromisoformat, required=True)
    parser.add_argument("--as-of", type=date.fromisoformat, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict):
            raise ValueError("Manifest must be an object")
        report = run(args.csv.read_bytes(), manifest, args.holdout_start, args.as_of)
        payloads = {
            args.output_dir / "evaluation.json": (json.dumps(report, indent=2, sort_keys=True,
                                                            allow_nan=False) + "\n").encode("utf-8"),
            args.output_dir / "predictions.csv": _prediction_csv(report["records"]),
        }
        for target, payload in payloads.items():
            if target.resolve() in (args.csv.resolve(), args.manifest.resolve()):
                raise ValueError("Outputs cannot overwrite source inputs")
            if target.exists() and target.read_bytes() != payload:
                raise ValueError(f"Refusing to overwrite different prior results: {target}")
        args.output_dir.mkdir(parents=True, exist_ok=True)
        for target, payload in payloads.items():
            target.write_bytes(payload)
        print(f"{report['datasetKind']}: {report['status']}; {report['holdoutGames']} holdout games")
        print("Historical prototype only; no live forecast or verified market advantage.")
    except (OSError, ValueError, UnicodeError) as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    main()
