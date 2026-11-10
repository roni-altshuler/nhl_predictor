# Evaluation contract and limitations

The implementation performs a historical, date-batched online replay. It is not a record of forecasts published before real NHL games.

## Chronology

Choose a holdout start and fixed as-of date before comparing models. Rows before the holdout start warm up state. Eligible rows on or after that date form the holdout. Every game on a provider date uses state from earlier dates only. Results update state after the whole date's probabilities are computed. Completed earlier holdout dates may influence subsequent dates; parameters remain fixed.

This prevents same-date result leakage under the recorded date convention. It cannot establish original result-availability times, the timing of historical corrections, or independence between games. A later-acquired dataset is not contemporaneous publication evidence.

## Declared models

- Elo: initial rating 1500, K=20, scale=400, zero home offset, no offseason reset.
- Past home rate: `(earlier home wins + 1) / (earlier eligible games + 2)`.
- Constant reference: home probability 0.5. The shared threshold rule picks home for ties at 0.5; its accuracy is not the realized accuracy of randomly sampled coin flips.

Source team-code changes are not silently merged. New codes start at 1500 and are marked as cold starts. Home is the provider's designation, not proof of a physical home-ice advantage.

## Scoring target

The provisional importer scores regular-season games with validated reciprocal, unequal goal totals. It excludes tied totals instead of inventing a shootout result. Missing scores, future dates, playoffs and other game types are separately counted. Exclusions alter the sample; a result for this subset must not be labeled all-game NHL accuracy.

For actual data, first verify final-score/shootout semantics and reconcile observed source coverage. File counts alone do not prove official schedule completeness. Never manufacture an outcome or renumber source games to hide a gap.

## Reported measures

Correct/total and accuracy use the declared 0.5 threshold. Binary Brier measures squared probability error; log loss uses natural logarithms and clips probabilities at `1e-15`. Both are lower-is-better. Accuracy Wilson intervals are descriptive and ignore temporal/team dependence.

Without eligible holdout games or historical warmup, scored metrics are unavailable. Outputs expose actual sample size, phase, dates, per-game probabilities/outcomes and cold starts. The bundled fixture is artificial; no reported fixture score is evidence about NHL prediction quality, calibration, market advantage or betting returns.
