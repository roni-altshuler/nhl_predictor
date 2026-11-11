import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import Shell from './components/Shell'
import PageHeader from './components/PageHeader'
import Overview from './pages/Overview'
import Games from './pages/Games'
import GameDetail from './pages/GameDetail'
import Teams from './pages/Teams'
import TeamDetail from './pages/TeamDetail'
import Lab from './pages/Lab'
import Record from './pages/Record'
import Method from './pages/Method'
import { fetchDemo } from './lib/data'
import { isTeam } from './lib/model'
import { href, useRoute } from './lib/router'

function decoded(value: string) { try { return decodeURIComponent(value) } catch { return '' } }
const TITLES: Record<string, string> = { '/': 'Overview', '/games': 'Games', '/teams': 'Teams', '/lab': 'Matchup lab', '/accuracy': 'Track record', '/method': 'Method & coverage' }

export default function App() {
  const route = useRoute(), actual = route.params.get('mode') === 'actual'
  const query = useQuery({ queryKey: ['demonstration', actual ? 'actual' : 'synthetic'], queryFn: ({ signal }) => fetchDemo(signal), enabled: !actual, retry: false, staleTime: Infinity })
  const data = actual ? undefined : query.data
  useEffect(() => {
    const key = route.path.split('/').filter(Boolean)[0]
    document.title = `${TITLES[route.path] ?? TITLES[`/${key}`] ?? 'View unavailable'} · Blue Line`
    document.getElementById('main-content')?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [route.path])
  let content
  if (route.path === '/method') content = <Method data={data} />
  else if (actual) content = <><PageHeader eyebrow="Real data stays separate" title={TITLES[route.path] ?? 'NHL coverage'}>Actual NHL results, teams and pre-event forecasts are not connected.</PageHeader><section className="empty-state"><span className="empty-mark" aria-hidden="true">—</span><h2>Real NHL coverage is unavailable</h2><p>No games, accuracy values or current league standings are inferred. You can still explore the fully working artificial demonstration.</p><a className="button primary" href={href(route.path === '/' || TITLES[route.path] ? route.path : '/')}>Explore the artificial sample</a><a className="text-link" href={href('/method', { mode: 'actual' })}>What is missing? →</a></section></>
  else if (query.isPending) content = <section className="loading-state" role="status"><span className="loading-mark" aria-hidden="true">◯</span><h1>Opening the notebook</h1><p>Loading the artificial demonstration…</p><a className="text-link" href={href('/method')}>Read the method while you wait →</a></section>
  else if (query.isError || !data) content = <section className="empty-state" role="alert"><span className="empty-mark" aria-hidden="true">—</span><h1>The demonstration could not be loaded</h1><p>No scores or probabilities are shown from unavailable or unverified data.</p><button className="button primary" onClick={() => { void query.refetch() }}>Try again</button><a className="text-link" href={href('/method')}>Read coverage notes →</a></section>
  else if (route.path === '/') content = <Overview data={data} />
  else if (route.path === '/games') content = <Games data={data} route={route} />
  else if (route.path.startsWith('/games/')) {
    const id = decoded(route.path.slice('/games/'.length)), game = data.records.find(g => g.gameId === id)
    content = game ? <GameDetail data={data} game={game} route={route} /> : <Missing />
  } else if (route.path === '/teams') content = <Teams data={data} route={route} />
  else if (route.path.startsWith('/teams/')) {
    const team = decoded(route.path.slice('/teams/'.length))
    content = isTeam(team) ? <TeamDetail data={data} team={team} /> : <Missing />
  } else if (route.path === '/lab') content = <Lab data={data} route={route} />
  else if (route.path === '/accuracy') content = <Record data={data} route={route} />
  else content = <Missing />
  return <Shell route={route} lastDate={data?.records.at(-1)?.date}>{content}</Shell>
}

function Missing() { return <section className="empty-state"><span className="empty-mark" aria-hidden="true">—</span><h1>That view is not in the sample</h1><p>The game or team could not be matched to a stable fixture identity.</p><a className="button primary" href={href('/games')}>Browse sample games</a></section> }
