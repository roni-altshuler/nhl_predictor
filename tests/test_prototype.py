from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from typing import Any

from nhl_prototype import (
    DATA_URL, REQUIRED, TERMS_URL, Game, evaluate, load_games, metrics, run, verify_manifest,
)

ROOT = Path(__file__).resolve().parents[1]


def pair(game_id: str = "2024020001", day: str = "20241001", home: str = "AAA",
         away: str = "BBB", hg: str = "3", ag: str = "1") -> list[dict[str, str]]:
    base = {"gameId": game_id, "season": game_id[:4], "gameDate": day, "situation": "all"}
    return [base | {"playerTeam": home, "opposingTeam": away, "home_or_away": "HOME",
                    "goalsFor": hg, "goalsAgainst": ag},
            base | {"playerTeam": away, "opposingTeam": home, "home_or_away": "AWAY",
                    "goalsFor": ag, "goalsAgainst": hg}]


def encoded(rows: list[dict[str, str]]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=sorted(REQUIRED))
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode()


def manifest(raw: bytes) -> dict[str, Any]:
    return {"schemaVersion": 1, "datasetKind": "synthetic-contract-fixture", "sourceUrl": None,
            "sha256": hashlib.sha256(raw).hexdigest(), "description": "Not observed NHL results"}


def game(n: int, day: int, winner_home: bool = True, home: str = "AAA", away: str = "BBB") -> Game:
    return Game(f"202402{n:04d}", 2024, date(2024, 10, day), home, away,
                3 if winner_home else 1, 1 if winner_home else 3)


class ImportTests(unittest.TestCase):
    def test_one_identity_per_reciprocal_pair_and_no_gap_renumbering(self) -> None:
        games, coverage = load_games(encoded(pair() + pair("2024020042", "20241003")), date(2025, 7, 1))
        self.assertEqual([g.identity for g in games], ["nhl:2024020001", "nhl:2024020042"])
        self.assertEqual(coverage["observedGameIds"], 2)
        self.assertEqual(coverage["rawRows"], 4)

    def test_row_order_does_not_change_games_or_coverage(self) -> None:
        rows = pair() + pair("2024020002", "20241002", "CCC", "DDD")
        self.assertEqual(load_games(encoded(rows), date(2025, 7, 1)),
                         load_games(encoded(list(reversed(rows))), date(2025, 7, 1)))

    def test_other_situations_do_not_duplicate_games_or_supply_winners(self) -> None:
        rows = pair() + [r | {"situation": "5on5", "goalsFor": "99"} for r in pair()]
        games, coverage = load_games(encoded(rows), date(2025, 7, 1))
        self.assertEqual(len(games), 1)
        self.assertEqual(games[0].home_goals, 3)
        self.assertEqual(coverage["situations"], {"5on5": 2, "all": 2})

    def test_playoffs_preseason_future_and_unresolved_are_accounted_for(self) -> None:
        rows = pair()
        rows += pair("2024030001", "20250501") + pair("2024010001", "20240901")
        rows += pair("2025020001", "20251001")
        rows += pair("2024020010", "20250401", hg="2", ag="2")
        rows += pair("2024020011", "20250402", hg="", ag="")
        games, coverage = load_games(encoded(rows), date(2025, 7, 1))
        self.assertEqual(len(games), 1)
        self.assertEqual(coverage["observedGameIds"], 6)
        self.assertEqual(coverage["excludedGames"], {
            "playoffs": 1, "preseason": 1, "after_as_of_date": 1,
            "tied_totals_outcome_unresolved": 1, "unsettled_score": 1,
        })

    def test_ties_are_unresolved_not_away_wins_or_half_wins(self) -> None:
        games, coverage = load_games(encoded(pair(hg="2", ag="2")), date(2025, 7, 1))
        self.assertEqual(games, [])
        self.assertEqual(coverage["excludedGames"], {"tied_totals_outcome_unresolved": 1})

    def test_integral_decimal_scores_are_supported(self) -> None:
        games, _ = load_games(encoded(pair(hg="3.0", ag="1.000")), date(2025, 7, 1))
        self.assertEqual((games[0].home_goals, games[0].away_goals), (3, 1))

    def test_invalid_scores_fail(self) -> None:
        for bad in ["-1", "1.5", "NaN", "inf", "won", "1e1"]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                load_games(encoded(pair(hg=bad)), date(2025, 7, 1))

    def test_missing_duplicate_or_same_side_pairs_fail(self) -> None:
        for rows in [pair()[:1], pair() + pair()[:1], [pair()[0], pair()[0]]]:
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                load_games(encoded(rows), date(2025, 7, 1))

    def test_contradictory_pair_identity_or_result_fails(self) -> None:
        for field, value in [("opposingTeam", "CCC"), ("gameDate", "20241002"),
                             ("goalsAgainst", "8"), ("playerTeam", "DDD")]:
            rows = pair()
            rows[1][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                load_games(encoded(rows), date(2025, 7, 1))

    def test_missing_and_duplicate_headers_fail(self) -> None:
        for raw in [b"gameId,season\n2024020001,2024\n", b"gameId,gameId\n1,1\n"]:
            with self.assertRaises(ValueError):
                load_games(raw, date(2025, 7, 1))

    def test_bad_id_season_date_team_and_side_fail(self) -> None:
        for field, value in [("gameId", "2024020001.0"), ("season", "2023"),
                             ("gameDate", "2024101"), ("gameDate", "20240230"),
                             ("playerTeam", ""), ("home_or_away", "NEUTRAL")]:
            rows = pair()
            rows[0][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                load_games(encoded(rows), date(2025, 7, 1))

    def test_no_all_situation_rows_fails_closed(self) -> None:
        with self.assertRaises(ValueError):
            load_games(encoded([r | {"situation": "5on5"} for r in pair()]), date(2025, 7, 1))


class ChronologyTests(unittest.TestCase):
    def test_first_predictions_and_next_date_use_only_past(self) -> None:
        result = evaluate([game(1, 1), game(2, 2)], date(2024, 10, 2), date(2024, 10, 31))
        first, second = result["records"]
        self.assertEqual(first["homeWinProbability"]["elo"], 0.5)
        self.assertEqual(first["pastEligibleGames"], 0)
        self.assertAlmostEqual(second["homeWinProbability"]["elo"], 1 / (1 + 10 ** (-20 / 400)))
        self.assertAlmostEqual(second["homeWinProbability"]["past_home_rate"], 2 / 3)
        self.assertEqual(second["pastEligibleGames"], 1)

    def test_same_date_results_do_not_leak(self) -> None:
        games = [game(1, 1), game(2, 2), game(3, 2, home="AAA", away="CCC")]
        a = evaluate(games, date(2024, 10, 2), date(2024, 10, 31))
        games[1] = game(2, 2, winner_home=False)
        b = evaluate(games, date(2024, 10, 2), date(2024, 10, 31))
        self.assertEqual(a["records"][2]["homeWinProbability"], b["records"][2]["homeWinProbability"])
        self.assertEqual(a["records"][1]["pastEligibleGames"], a["records"][2]["pastEligibleGames"])

    def test_future_result_changes_cannot_change_earlier_predictions(self) -> None:
        games = [game(1, 1), game(2, 2), game(3, 3)]
        a = evaluate(games, date(2024, 10, 2), date(2024, 10, 31))
        games[2] = game(3, 3, winner_home=False)
        b = evaluate(games, date(2024, 10, 2), date(2024, 10, 31))
        self.assertEqual(a["records"][:2], b["records"][:2])
        self.assertEqual(a["records"][2]["homeWinProbability"], b["records"][2]["homeWinProbability"])

    def test_past_holdout_result_can_update_later_state(self) -> None:
        a = evaluate([game(1, 1), game(2, 2), game(3, 3)], date(2024, 10, 2), date(2024, 10, 31))
        b = evaluate([game(1, 1), game(2, 2, False), game(3, 3)], date(2024, 10, 2), date(2024, 10, 31))
        self.assertNotEqual(a["records"][2]["homeWinProbability"], b["records"][2]["homeWinProbability"])

    def test_reversing_input_does_not_change_replay(self) -> None:
        games = [game(1, 1), game(2, 2), game(3, 2, home="CCC", away="DDD")]
        self.assertEqual(evaluate(games, date(2024, 10, 2), date(2024, 10, 31)),
                         evaluate(list(reversed(games)), date(2024, 10, 2), date(2024, 10, 31)))

    def test_no_eligible_holdout_and_no_warmup_do_not_report_zero_accuracy(self) -> None:
        no_test = evaluate([game(1, 1)], date(2024, 10, 2), date(2024, 10, 31))
        no_train = evaluate([game(1, 1)], date(2024, 10, 1), date(2024, 10, 31))
        empty = evaluate([], date(2024, 10, 1), date(2024, 10, 31))
        self.assertEqual(no_test["status"], "no-eligible-holdout")
        self.assertEqual(no_train["status"], "insufficient-warmup")
        for value in [no_test, no_train, empty]:
            self.assertIsNone(value["metrics"])
            self.assertEqual(value["perSeasonHoldoutMetrics"], {})

    def test_empty_start_new_teams_are_explicit_cold_starts(self) -> None:
        result = evaluate([game(1, 1), game(2, 2, home="CCC", away="DDD")],
                          date(2024, 10, 2), date(2024, 10, 31))
        self.assertTrue(result["records"][1]["coldStartHome"])
        self.assertTrue(result["records"][1]["coldStartAway"])
        self.assertEqual(result["records"][1]["homeWinProbability"]["elo"], 0.5)

    def test_duplicate_ids_future_records_and_bad_cutoff_are_rejected(self) -> None:
        for games, cutoff, as_of in [([game(1, 1), game(1, 2)], date(2024, 10, 1), date(2024, 10, 31)),
                                    ([game(1, 2)], date(2024, 10, 1), date(2024, 10, 1)),
                                    ([], date(2025, 1, 1), date(2024, 10, 1))]:
            with self.assertRaises(ValueError):
                evaluate(games, cutoff, as_of)


class MetricTests(unittest.TestCase):
    def test_known_probability_scores(self) -> None:
        result = metrics([(0.8, 1), (0.2, 0)])
        assert result is not None
        self.assertAlmostEqual(result["brier"], 0.04)
        self.assertAlmostEqual(result["logLoss"], -math.log(0.8))
        self.assertEqual((result["games"], result["correct"], result["accuracy"]), (2, 2, 1))
        self.assertLess(result["accuracyWilson95"][0], 1)

    def test_coin_flip_is_quarter_brier_and_natural_log_two(self) -> None:
        result = metrics([(0.5, 1), (0.5, 0)])
        assert result is not None
        self.assertEqual(result["brier"], 0.25)
        self.assertEqual(result["accuracy"], 0.5)
        self.assertAlmostEqual(result["logLoss"], math.log(2))

    def test_invalid_inputs_do_not_serialize_nan(self) -> None:
        for p, y in [(float("nan"), 1), (float("inf"), 0), (-0.01, 0), (1.01, 1), (0.5, 2)]:
            with self.assertRaises(ValueError):
                metrics([(p, y)])

    def test_empty_is_unavailable_and_boundary_log_loss_is_finite(self) -> None:
        self.assertIsNone(metrics([]))
        result = metrics([(0.0, 1), (1.0, 0)])
        assert result is not None
        self.assertTrue(math.isfinite(result["logLoss"]))
        self.assertEqual(result["brier"], 1.0)


class ProvenanceAndCliTests(unittest.TestCase):
    def test_hash_kind_and_required_actual_manifest_fields(self) -> None:
        raw = encoded(pair())
        valid = manifest(raw)
        verify_manifest(valid, raw)
        for value in [valid | {"sha256": "0" * 64}, valid | {"datasetKind": "live"},
                      valid | {"sourceUrl": DATA_URL}, valid | {"schemaVersion": True}]:
            with self.assertRaises(ValueError):
                verify_manifest(value, raw)
        declared_actual = valid | {"datasetKind": "historical-moneypuck-download",
                                   "sourceUrl": DATA_URL, "termsUrl": TERMS_URL,
                                   "noncommercialUse": True, "retrievedAtUtc": "2024-01-01T00:00:00Z"}
        verify_manifest(declared_actual, raw)  # metadata contract only, not actual NHL data
        for value in [declared_actual | {"noncommercialUse": False},
                      declared_actual | {"retrievedAtUtc": "2024-01-01T00:00:00"},
                      declared_actual | {"retrievedAtUtc": "2099-01-01T00:00:00Z"},
                      declared_actual | {"sourceUrl": "https://example.com/guessed.csv"}]:
            with self.assertRaises(ValueError):
                verify_manifest(value, raw)

    def test_result_is_explicitly_historical_and_fixture_is_not_provider_data(self) -> None:
        raw = encoded(pair() + pair("2024020002", "20241002"))
        result = run(raw, manifest(raw), date(2024, 10, 2), date(2025, 7, 1))
        self.assertEqual(result["datasetKind"], "synthetic-contract-fixture")
        self.assertFalse(result["livePrediction"])
        self.assertFalse(result["genuinePreEventPublicationEvidence"])
        self.assertFalse(result["verifiedMarketAdvantage"])
        self.assertIn("not observed NHL", result["attribution"])
        json.dumps(result, allow_nan=False)

    def test_cli_is_reproducible_and_preserves_different_prior_results(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            raw = encoded(pair() + pair("2024020002", "20241002"))
            (root / "source.csv").write_bytes(raw)
            (root / "manifest.json").write_text(json.dumps(manifest(raw)))
            command = [sys.executable, str(ROOT / "src/nhl_prototype.py"), "--csv", str(root / "source.csv"),
                       "--manifest", str(root / "manifest.json"), "--holdout-start", "2024-10-02",
                       "--as-of", "2025-07-01", "--output-dir", str(root / "output")]
            first = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(first.returncode, 0, first.stderr)
            data = (root / "output/evaluation.json").read_bytes()
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual((root / "output/evaluation.json").read_bytes(), data)
            (root / "output/predictions.csv").write_text("preserve prior result")
            failed = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("Refusing to overwrite", failed.stderr)
            self.assertEqual((root / "output/predictions.csv").read_text(), "preserve prior result")
            self.assertEqual((root / "source.csv").read_bytes(), raw)

    def test_missing_real_data_cannot_create_metrics(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            command = [sys.executable, str(ROOT / "src/nhl_prototype.py"), "--csv", str(Path(tmp) / "missing.csv"),
                       "--manifest", str(Path(tmp) / "missing.json"), "--holdout-start", "2024-10-02",
                       "--as-of", "2025-07-01", "--output-dir", str(Path(tmp) / "output")]
            result = subprocess.run(command, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((Path(tmp) / "output").exists())


if __name__ == "__main__":
    unittest.main()
