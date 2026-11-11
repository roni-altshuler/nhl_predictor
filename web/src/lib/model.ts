export const MODELS = ['elo', 'past_home_rate', 'coin_flip'] as const
export type Model = typeof MODELS[number]
export const MODEL_NAMES: Record<Model, string> = { elo: 'Elo baseline', past_home_rate: 'Past home rate', coin_flip: '50/50 reference' }
export const TEAMS = ['AAA', 'BBB', 'CCC', 'DDD'] as const
export type Team = typeof TEAMS[number]
export interface Game {
  gameId: string; sourceGameId: string; seasonStartYear: number; date: string
  homeTeam: Team; awayTeam: Team; homeGoals: number; awayGoals: number
  actualHomeWin: number; phase: 'warmup' | 'holdout'; pastEligibleGames: number; pastHomeWins: number
  coldStartHome: boolean; coldStartAway: boolean; homeWinProbability: Record<Model, number>
}
export interface Metrics { games: number; correct: number; accuracy: number; accuracyWilson95: [number, number]; brier: number; logLoss: number }
export interface Demo {
  schemaVersion: number; datasetKind: 'synthetic-contract-fixture'; records: Game[]
  metrics: Record<Model, Metrics>; warmupGames: number; holdoutGames: number; holdoutStart: string; asOfDate: string
  source: { sha256: string; datasetKind: string; sourceUrl: null }
  coverage: { rawRows: number; observedGameIds: number; eligibleRegularSeasonGames: number; excludedGames: Record<string, number>; situations: Record<string, number> }
  attribution: string; limitations: string[]
  livePrediction: false; genuinePreEventPublicationEvidence: false; verifiedMarketAdvantage: false
}

export function isTeam(value: string): value is Team { return (TEAMS as readonly string[]).includes(value) }
export function modelFrom(value: string | null): Model { return MODELS.find(m => m === value) ?? 'elo' }
export function percentage(value: number | null | undefined, digits = 1): string { return value == null ? 'Unavailable' : `${(100 * value).toFixed(digits)}%` }
export function dayLabel(day: string, year = false): string { return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`)) }
export function seasonLabel(year: number): string { return `${year}–${String(year + 1).slice(2)}` }
export function homeProbability(home: number, away: number): number { return 1 / (1 + 10 ** Math.max(-15, Math.min(15, (away - home) / 400))) }
export function correct(game: Game, model: Model): boolean { return Number(game.homeWinProbability[model] >= .5) === game.actualHomeWin }
export function winner(game: Game): Team { return game.actualHomeWin ? game.homeTeam : game.awayTeam }
export function pick(game: Game, model: Model): Team { return game.homeWinProbability[model] >= .5 ? game.homeTeam : game.awayTeam }

/** Identical binary scoring/threshold to the offline evaluator; empty is unavailable. */
export function score(games: Game[], model: Model): Metrics | null {
  const n = games.length
  if (!n) return null
  const hits = games.filter(g => correct(g, model)).length, p = hits / n, z = 1.959963984540054
  const d = 1 + z * z / n, center = (p + z * z / (2 * n)) / d
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
  const brier = games.reduce((sum, g) => sum + (g.homeWinProbability[model] - g.actualHomeWin) ** 2, 0) / n
  const logLoss = -games.reduce((sum, g) => {
    const probability = g.homeWinProbability[model], outcome = g.actualHomeWin
    return sum + outcome * Math.log(Math.max(1e-15, Math.min(1 - 1e-15, probability))) + (1 - outcome) * Math.log(Math.max(1e-15, Math.min(1 - 1e-15, 1 - probability)))
  }, 0) / n
  return { games: n, correct: hits, accuracy: p, accuracyWilson95: [Math.max(0, center - half), Math.min(1, center + half)], brier, logLoss }
}

export function timeline(games: Game[], model: Model, recent = 4) {
  return games.map((game, index) => {
    const cumulative = score(games.slice(0, index + 1), model)!
    const window = score(games.slice(Math.max(0, index + 1 - recent), index + 1), model)!
    return { game, ...cumulative, recent: window }
  })
}

/** Update only after every game on a date has received its prior-state probability. */
export function replay(games: Game[]) {
  const ratings: Partial<Record<Team, number>> = {}, history: { date: string; ratings: Record<Team, number> }[] = []
  const days = [...new Set(games.map(g => g.date))].sort()
  let homeWins = 0, played = 0
  for (const date of days) {
    const batch = games.filter(g => g.date === date), changes: Partial<Record<Team, number>> = {}
    for (const g of batch) {
      const p = homeProbability(ratings[g.homeTeam] ?? 1500, ratings[g.awayTeam] ?? 1500)
      const delta = 20 * (g.actualHomeWin - p)
      changes[g.homeTeam] = (changes[g.homeTeam] ?? 0) + delta
      changes[g.awayTeam] = (changes[g.awayTeam] ?? 0) - delta
    }
    for (const team of TEAMS) if (changes[team] != null) ratings[team] = (ratings[team] ?? 1500) + changes[team]!
    homeWins += batch.reduce((sum, g) => sum + g.actualHomeWin, 0); played += batch.length
    history.push({ date, ratings: Object.fromEntries(TEAMS.map(t => [t, ratings[t] ?? 1500])) as Record<Team, number> })
  }
  return { ratings, history, played, homeWins, homeRate: (homeWins + 1) / (played + 2) }
}

export function teamSummary(records: Game[], team: Team) {
  const games = records.filter(g => g.homeTeam === team || g.awayTeam === team)
  const wins = games.filter(g => winner(g) === team).length
  const goalsFor = games.reduce((sum, g) => sum + (g.homeTeam === team ? g.homeGoals : g.awayGoals), 0)
  const goalsAgainst = games.reduce((sum, g) => sum + (g.homeTeam === team ? g.awayGoals : g.homeGoals), 0)
  return { team, games: games.length, wins, losses: games.length - wins, goalsFor, goalsAgainst, differential: goalsFor - goalsAgainst }
}

export function filterGames(records: Game[], params: URLSearchParams, includeDate = true) {
  const phase = params.get('phase') ?? 'holdout', team = params.get('team'), season = params.get('season'), date = params.get('date'), query = (params.get('q') ?? '').trim().toLowerCase()
  return records.filter(g =>
    (phase === 'all' || g.phase === phase) && (!team || g.homeTeam === team || g.awayTeam === team) &&
    (!season || String(g.seasonStartYear) === season) && (!includeDate || !date || g.date === date) &&
    (!query || [g.homeTeam, g.awayTeam, g.sourceGameId, g.date].some(s => s.toLowerCase().includes(query))),
  )
}
