import { useEffect, useRef, type ReactNode } from 'react'
import { dayLabel } from '../lib/model'
import { href, navigate, type Route } from '../lib/router'

const NAV = [
  { path: '/', label: 'Overview', icon: '◯' }, { path: '/games', label: 'Games', icon: '▤' },
  { path: '/teams', label: 'Teams', icon: '▥' }, { path: '/lab', label: 'Matchup lab', icon: '⇄' },
  { path: '/accuracy', label: 'Track record', icon: '→' }, { path: '/method', label: 'Method & coverage', icon: '◇' },
]
function active(path: string, target: string) { return target === '/' ? path === '/' : path === target || path.startsWith(`${target}/`) }

export default function Shell({ route, lastDate, children }: { route: Route; lastDate?: string; children: ReactNode }) {
  const actual = route.params.get('mode') === 'actual', dialog = useRef<HTMLDialogElement>(null)
  const sourceParams = actual ? { mode: 'actual' } : {}, routeKey = `${route.path}?${route.params}`
  useEffect(() => { dialog.current?.close() }, [routeKey])
  return <div className="app-shell"><a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus() }}>Skip to content</a>
    <aside className="sidebar" aria-label="Application sidebar"><a className="brand" href={href('/', sourceParams)}><img src={`${import.meta.env.BASE_URL}mark.svg`} width="34" height="34" alt="" /><span>BLUE LINE<small>NHL analysis prototype</small></span></a><nav aria-label="Primary navigation">{NAV.map(n => <a key={n.path} href={href(n.path, sourceParams)} aria-current={active(route.path, n.path) ? 'page' : undefined}><span aria-hidden="true">{n.icon}</span>{n.label}</a>)}</nav><div className="sidebar-note"><span className="badge neutral">Early prototype</span><p>Keep the source close.<br />Keep the record closer.</p><a href="https://github.com/roni-altshuler/nhl_predictor" target="_blank" rel="noreferrer">Source &amp; documentation →</a></div></aside>
    <div className="app-column"><header className="topbar"><a className="mobile-brand" href={href('/', sourceParams)}><img src={`${import.meta.env.BASE_URL}mark.svg`} width="28" height="28" alt="" /><span>BLUE LINE</span></a><span className="desktop-eyebrow eyebrow">Hockey, with a paper trail</span><div className="topbar-right"><span className="feed-state">No live feed</span><label className="source-select"><span className="sr-only">Data source</span><select aria-label="Data source" value={actual ? 'actual' : 'demo'} onChange={e => { const params = new URLSearchParams(route.params); if (e.target.value === 'actual') params.set('mode', 'actual'); else params.delete('mode'); navigate(route.path, params) }}><option value="demo">Artificial sample</option><option value="actual">NHL · unavailable</option></select></label></div></header>
      <div className={`scope-band ${actual ? 'scope-unavailable' : ''}`} role="status"><strong>{actual ? 'Actual NHL data unavailable' : 'Synthetic demonstration'}</strong><span>{actual ? 'Real results and forecasts are not connected.' : `${lastDate ? `Eligible sample through ${dayLabel(lastDate, true)}. ` : ''}Artificial teams and outcomes · not live NHL predictions.`}</span><a href={href('/method', sourceParams)}>Coverage notes →</a></div>
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer className="site-footer"><div><strong>BLUE LINE</strong><p>Independent, unofficial NHL analysis prototype.<br />Artificial demonstration; real NHL coverage remains unverified.</p></div><div><a href={href('/method', sourceParams)}>Method &amp; data rights</a><a href="https://github.com/roni-altshuler/nhl_predictor" target="_blank" rel="noreferrer">GitHub →</a><a href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.md`}>Dependency licenses</a><span className="build-id" data-testid="build-version" title={__APP_COMMIT__}>App build {__APP_COMMIT__ === 'local-preview' ? 'local preview' : __APP_COMMIT__.slice(0, 8)}</span></div></footer>
    </div>
    <nav className="mobile-nav" aria-label="Mobile primary navigation">{NAV.filter(n => ['/', '/games', '/teams', '/accuracy'].includes(n.path)).map(n => <a key={n.path} href={href(n.path, sourceParams)} aria-current={active(route.path, n.path) ? 'page' : undefined}><span aria-hidden="true">{n.icon}</span>{n.path === '/accuracy' ? 'Record' : n.label}</a>)}<button aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}><span aria-hidden="true">···</span>More</button></nav>
    <dialog ref={dialog} className="navigation-dialog" aria-labelledby="more-title" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close() }}><div className="dialog-content"><div className="section-row"><h2 id="more-title">Explore Blue Line</h2><button className="icon-button" aria-label="Close navigation" onClick={() => dialog.current?.close()}>×</button></div><nav aria-label="More navigation">{NAV.map(n => <a key={n.path} href={href(n.path, sourceParams)} onClick={() => dialog.current?.close()}><span aria-hidden="true">{n.icon}</span>{n.label}<span aria-hidden="true">→</span></a>)}</nav><p className="muted small-text">Synthetic sample only. No live NHL forecast service.</p></div></dialog>
  </div>
}
