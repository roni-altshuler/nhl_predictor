/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseDemo } from '../src/lib/data.ts'
import { MODELS, filterGames, homeProbability, percentage, replay, score, teamSummary, timeline } from '../src/lib/model.ts'
import { href, parseRoute, patch } from '../src/lib/router.ts'

const raw: unknown = JSON.parse(readFileSync(new URL('../public/data/demo.json', import.meta.url), 'utf8'))
const data = parseDemo(raw), held = data.records.filter(g => g.phase === 'holdout')
function near(actual: number, expected: number) { assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`) }

test('cross-language evaluator agreement: all models and Wilson intervals', () => {
  for (const model of MODELS) assert.deepEqual(score(held, model), data.metrics[model])
  assert.equal(score(held, 'elo')?.correct, 4)
  assert.equal(score(held, 'past_home_rate')?.correct, 5)
  assert.equal(score(held, 'coin_flip')?.correct, 5)
  near(score(held, 'elo')!.brier, .25455251938158757)
  near(score(held, 'elo')!.logLoss, .702580127258375)
  near(score(held, 'elo')!.accuracyWilson95[0], .21521606221387757)
  near(score(held, 'coin_flip')!.logLoss, Math.log(2))
})
test('unscored and empty are distinct from zero accuracy', () => {
  for (const m of MODELS) assert.equal(score([], m), null)
  assert.equal(percentage(null), 'Unavailable')
  assert.equal(percentage(0), '0.0%')
  assert.equal(timeline([], 'elo').length, 0)
})
test('exact final Elo and global home-rate state', () => {
  const s = replay(data.records)
  near(s.ratings.AAA!, 1531.722868707666)
  near(s.ratings.BBB!, 1487.2565610989586)
  near(s.ratings.CCC!, 1486.0679703329502)
  near(s.ratings.DDD!, 1494.9525998604254)
  near(Object.values(s.ratings).reduce((a,b) => a + b, 0), 6000)
  assert.equal(s.played, 20); assert.equal(s.homeWins, 13); near(s.homeRate, 14/22)
  near(homeProbability(s.ratings.AAA!, s.ratings.BBB!), .5636450379100767)
  near(homeProbability(s.ratings.BBB!, s.ratings.AAA!), 1 - .5636450379100767)
})
test('cold start and same-date batches never depend on row order', () => {
  assert.equal(replay([]).homeRate, .5)
  assert.equal(homeProbability(1500, 1500), .5)
  const template = data.records[0]
  const first = [
    {...template, gameId:'nhl:2024029001', homeTeam:'AAA' as const, awayTeam:'BBB' as const, actualHomeWin:1},
    {...template, gameId:'nhl:2024029002', homeTeam:'AAA' as const, awayTeam:'CCC' as const, actualHomeWin:0},
  ]
  assert.deepEqual(replay(first).ratings, replay([...first].reverse()).ratings)
  assert.deepEqual(replay(first).ratings, {AAA:1500,BBB:1490,CCC:1510})
  assert.equal(replay(first).history.length,1)
  assert.equal(replay(first).played,2)
})
test('team records use the correct home and away sides', () => {
  assert.deepEqual(teamSummary(data.records, 'AAA'), {team:'AAA',games:10,wins:7,losses:3,goalsFor:21,goalsAgainst:19,differential:2})
  const all = ['AAA','BBB','CCC','DDD'].map(t => teamSummary(data.records, t as 'AAA'))
  assert.equal(all.reduce((n,t) => n+t.wins,0), 20)
  assert.equal(all.reduce((n,t) => n+t.goalsFor-t.goalsAgainst,0), 0)
})
test('chronological cumulative/recent metrics agree at every point', () => {
  for (const model of MODELS) for (const window of [4,8]) {
    const points = timeline(held, model, window)
    points.forEach((p,i) => {
      assert.deepEqual(p.recent, score(held.slice(Math.max(0,i+1-window),i+1),model))
      assert.equal(p.games,i+1)
      assert.equal(p.correct,held.slice(0,i+1).filter(g=>Number(g.homeWinProbability[model]>=.5)===g.actualHomeWin).length)
    })
  }
})
test('phase, season, day, identity and team filtering retain coverage', () => {
  assert.equal(filterGames(data.records,new URLSearchParams()).length,8)
  assert.equal(filterGames(data.records,new URLSearchParams('phase=all')).length,20)
  assert.equal(filterGames(data.records,new URLSearchParams('phase=warmup')).length,12)
  assert.equal(filterGames(data.records,new URLSearchParams('phase=all&season=2023')).length,12)
  assert.equal(filterGames(data.records,new URLSearchParams('phase=all&team=AAA')).length,10)
  assert.equal(filterGames(data.records,new URLSearchParams('phase=all&q=2024020008')).length,1)
  assert.equal(filterGames(data.records,new URLSearchParams('q=nonexistent')).length,0)
  assert.equal(filterGames(data.records,new URLSearchParams('date=1900-01-01')).length,0)
  assert.equal(filterGames(data.records,new URLSearchParams('date=1900-01-01'),false).length,8)
})
test('URL state round trips stable IDs, zero selection, explicit all phase', () => {
  const url = href('/games/nhl:2024020008',{phase:'all',through:'0',q:'AAA & BBB'})
  const route = parseRoute(url)
  assert.equal(route.path,'/games/nhl:2024020008')
  assert.equal(route.params.get('q'),'AAA & BBB'); assert.equal(route.params.get('through'),'0')
  let replaced = ''
  Object.assign(globalThis,{window:{history:{replaceState:(_a:unknown,_b:unknown,c:string)=>{replaced=c}},dispatchEvent:()=>true},HashChangeEvent:class {}})
  patch(parseRoute('#/games?team=AAA&phase=holdout'),{phase:'all',team:'all'})
  assert.equal(replaced,'#/games?phase=all')
  assert.equal(parseRoute('#http://[').path,'/invalid-route')
})

const mutations: Record<string,(o: Record<string, any>)=>void> = {
  'real dataset':o=>o.datasetKind='historical', 'missing provenance':o=>delete o.source,
  'false live claim':o=>o.livePrediction=true, 'unverified source hash':o=>o.source.sha256='0'.repeat(64),
  'external source':o=>o.source.sourceUrl='https://example.com', 'missing game':o=>o.records.pop(),
  'duplicate ID':o=>o.records[1].gameId=o.records[0].gameId, 'wrong source ID':o=>o.records[0].sourceGameId='2024999999',
  'same team':o=>o.records[0].awayTeam=o.records[0].homeTeam, 'unresolved score':o=>o.records[0].awayGoals=o.records[0].homeGoals,
  'mismatched outcome':o=>o.records[0].actualHomeWin=1-o.records[0].actualHomeWin,
  'bad date':o=>o.records[0].date='2023-02-31', 'future score':o=>o.asOfDate='2024-01-01',
  'shuffled chronology':o=>o.records.reverse(), 'wrong season':o=>o.records[0].seasonStartYear=2022,
  'warmup scored':o=>o.records[0].phase='holdout', 'probability out of range':o=>o.records[0].homeWinProbability.elo=1.1,
  'probability missing':o=>delete o.records[0].homeWinProbability.elo, 'future leakage':o=>o.records[0].pastEligibleGames=1,
  'tampered replay':o=>o.records[5].homeWinProbability.elo=.99, 'wrong cold start':o=>o.records[0].coldStartHome=false,
  'metrics mislabeled':o=>o.metrics.elo.brier=o.metrics.elo.logLoss, 'wrong held count':o=>o.holdoutGames++,
  'hidden coverage gap':o=>o.coverage.observedGameIds++, 'negative exclusion':o=>o.coverage.excludedGames.playoffs=-1,
  'nonfinite score':o=>o.metrics.elo.brier=NaN,
  'row count disagrees':o=>o.coverage.rawRows=0, 'situation count disagrees':o=>o.coverage.situations.all=1,
}
for (const [name,change] of Object.entries(mutations)) test(`fail closed: ${name}`,()=>{
  const copy=structuredClone(raw) as Record<string, any>; change(copy); assert.throws(()=>parseDemo(copy))
})
