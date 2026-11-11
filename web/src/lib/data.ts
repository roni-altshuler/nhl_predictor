import { MODELS, TEAMS, homeProbability, isTeam, replay, score, type Demo, type Game, type Metrics, type Model } from './model'

const FIXTURE_SHA = '8282217d87f23344a6258524450027dba4764bd3c7723e837a0454450fc6911f'
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid demonstration data')
  return value as Record<string, unknown>
}
function integer(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid demonstration count'); return value }
function text(value: unknown): string { if (typeof value !== 'string') throw new Error('Invalid demonstration label'); return value }
function date(value: unknown): string { const s = text(value); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) throw new Error('Invalid demonstration date'); return s }
function probability(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid probability'); return value }
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') throw new Error('Invalid demonstration state'); return value }
function numbers(value: unknown): Record<string, number> { return Object.fromEntries(Object.entries(object(value)).map(([k, v]) => [k, integer(v)])) }

function game(value: unknown): Game {
  const o = object(value), homeTeam = text(o.homeTeam), awayTeam = text(o.awayTeam), gameId = text(o.gameId), sourceGameId = text(o.sourceGameId)
  if (!isTeam(homeTeam) || !isTeam(awayTeam) || homeTeam === awayTeam || !/^20\d{2}02\d{4}$/.test(sourceGameId) || gameId !== `nhl:${sourceGameId}`) throw new Error('Invalid game identity')
  if (o.phase !== 'warmup' && o.phase !== 'holdout') throw new Error('Invalid evaluation phase')
  const homeGoals = integer(o.homeGoals), awayGoals = integer(o.awayGoals), outcome = integer(o.actualHomeWin)
  if (homeGoals === awayGoals || outcome !== Number(homeGoals > awayGoals)) throw new Error('Invalid artificial outcome')
  const p = object(o.homeWinProbability)
  return { gameId, sourceGameId, homeTeam, awayTeam, homeGoals, awayGoals, actualHomeWin: outcome,
    date: date(o.date), seasonStartYear: integer(o.seasonStartYear), phase: o.phase,
    coldStartHome: boolean(o.coldStartHome), coldStartAway: boolean(o.coldStartAway),
    pastEligibleGames: integer(o.pastEligibleGames), pastHomeWins: integer(o.pastHomeWins),
    homeWinProbability: Object.fromEntries(MODELS.map(m => [m, probability(p[m])])) as Record<Model, number> }
}

/** Fail closed before displaying any counts/probabilities from a corrupt or real-data payload. */
export function parseDemo(value: unknown): Demo {
  const o = object(value), source = object(o.source), coverage = object(o.coverage)
  if (o.schemaVersion !== 1 || o.datasetKind !== 'synthetic-contract-fixture' || source.datasetKind !== o.datasetKind || source.sha256 !== FIXTURE_SHA || source.sourceUrl !== null || o.livePrediction !== false || o.genuinePreEventPublicationEvidence !== false || o.verifiedMarketAdvantage !== false || !Array.isArray(o.records)) throw new Error('Unverified demonstration source')
  const records = o.records.map(game), cutoff = date(o.holdoutStart), asOf = date(o.asOfDate), metrics = object(o.metrics)
  if (records.length !== 20 || new Set(records.map(r => r.gameId)).size !== records.length || cutoff > asOf) throw new Error('Incomplete demonstration')
  const holdout = records.filter(g => g.phase === 'holdout')
  if (integer(o.holdoutGames) !== holdout.length || integer(o.warmupGames) !== records.length - holdout.length) throw new Error('Evaluation counts disagree')
  records.forEach((g, i) => {
    if (g.date > asOf || (g.date >= cutoff) !== (g.phase === 'holdout') || String(g.seasonStartYear) !== g.sourceGameId.slice(0, 4) || ![g.seasonStartYear, g.seasonStartYear + 1].includes(Number(g.date.slice(0, 4))) || i > 0 && records[i - 1].date > g.date) throw new Error('Chronology disagrees')
    const prior = records.filter(r => r.date < g.date), state = replay(prior)
    const expected = { elo: homeProbability(state.ratings[g.homeTeam] ?? 1500, state.ratings[g.awayTeam] ?? 1500), past_home_rate: state.homeRate, coin_flip: .5 }
    if (g.pastEligibleGames !== prior.length || g.pastHomeWins !== state.homeWins || g.coldStartHome !== (state.ratings[g.homeTeam] == null) || g.coldStartAway !== (state.ratings[g.awayTeam] == null) || MODELS.some(m => Math.abs(g.homeWinProbability[m] - expected[m]) > 1e-10)) throw new Error('Replay provenance disagrees')
  })
  const checked: Partial<Record<Model, Metrics>> = {}
  for (const model of MODELS) {
    const stored = object(metrics[model]), computed = score(holdout, model)
    if (!computed || ['games', 'correct', 'accuracy', 'brier', 'logLoss'].some(key => typeof stored[key] !== 'number' || !Number.isFinite(stored[key]) || Math.abs(Number(stored[key]) - computed[key as keyof Omit<Metrics, 'accuracyWilson95'>]) > 1e-10)) throw new Error('Holdout scoring disagrees')
    checked[model] = computed
  }
  const situations = numbers(coverage.situations), rawRows = integer(coverage.rawRows)
  const excludedGames = numbers(coverage.excludedGames), eligible = integer(coverage.eligibleRegularSeasonGames), observed = integer(coverage.observedGameIds)
  if (eligible !== records.length || observed !== eligible + Object.values(excludedGames).reduce((a, b) => a + b, 0)) throw new Error('Coverage disagrees')
  if (rawRows !== Object.values(situations).reduce((a, b) => a + b, 0) || situations.all !== 2 * observed) throw new Error('Row coverage disagrees')
  if (!Array.isArray(o.limitations) || o.limitations.some(s => typeof s !== 'string') || TEAMS.some(t => !records.some(r => r.homeTeam === t || r.awayTeam === t))) throw new Error('Incomplete source context')
  return { schemaVersion: 1, datasetKind: 'synthetic-contract-fixture', records, metrics: checked as Record<Model, Metrics>,
    warmupGames: integer(o.warmupGames), holdoutGames: integer(o.holdoutGames), holdoutStart: cutoff, asOfDate: asOf,
    source: { sha256: FIXTURE_SHA, datasetKind: 'synthetic-contract-fixture', sourceUrl: null },
    coverage: { rawRows, observedGameIds: observed, eligibleRegularSeasonGames: eligible, excludedGames, situations },
    attribution: text(o.attribution), limitations: o.limitations as string[], livePrediction: false, genuinePreEventPublicationEvidence: false, verifiedMarketAdvantage: false }
}

export async function fetchDemo(signal: AbortSignal): Promise<Demo> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/demo.json`, { signal })
  if (!response.ok) throw new Error('Demonstration unavailable')
  return parseDemo(await response.json())
}
