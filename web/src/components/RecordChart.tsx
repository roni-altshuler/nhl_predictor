import { dayLabel, percentage, type Game, type Model, timeline } from '../lib/model'
import { href } from '../lib/router'

export default function RecordChart({ games, model, index, onIndex, recent = 4 }: { games: Game[]; model: Model; index: number; onIndex: (index: number) => void; recent?: number }) {
  const points = timeline(games, model, recent)
  if (!points.length) return <div className="empty-inline">No scored games in this selection. Accuracy is unavailable.</div>
  const selected = points[Math.min(index, points.length - 1)]
  const x = (i: number) => points.length === 1 ? 330 : 48 + i * 562 / (points.length - 1)
  const y = (p: number) => 208 - p * 166
  const line = points.map((p, i) => `${x(i)},${y(p.accuracy)}`).join(' ')
  return <div className="record-chart">
    <figure aria-label="Cumulative correct-winner percentage across selected artificial holdout games">
      <svg viewBox="0 0 650 255" aria-hidden="true">
        {[0, .25, .5, .75, 1].map(p => <g key={p}><line x1="48" x2="610" y1={y(p)} y2={y(p)} className="chart-grid" /><text x="35" y={y(p) + 4} textAnchor="end" className="chart-label">{Math.round(p * 100)}%</text></g>)}
        <polyline points={line} className="chart-line" />
        {points.map((p, i) => <g key={p.game.gameId}><circle cx={x(i)} cy={y(p.accuracy)} r={i === index ? 6 : 4} className={i === index ? 'chart-selected' : 'chart-dot'} />{(i === 0 || i === points.length - 1) && <text x={x(i)} y="238" textAnchor="middle" className="chart-label">{dayLabel(p.game.date)}</text>}</g>)}
      </svg>
      <figcaption>Each point includes this game and earlier selected holdout games. No warmup game enters the percentage.</figcaption>
    </figure>
    <label className="range-label">Inspect game <strong>{Math.min(index, points.length - 1) + 1} of {points.length}</strong><input aria-label="Inspect record game" type="range" min="0" max={points.length - 1} value={Math.min(index, points.length - 1)} onChange={e => onIndex(Number(e.target.value))} /></label>
    <div className="point-detail" data-testid="point-detail"><div><span className="eyebrow">{dayLabel(selected.game.date, true)}</span><p>Cumulative <strong>{selected.correct}/{selected.games} · {percentage(selected.accuracy)}</strong></p><p className="muted small-text">Recent {selected.recent.games}: {selected.recent.correct}/{selected.recent.games} · {percentage(selected.recent.accuracy)}</p></div><a className="text-link" href={href(`/games/${encodeURIComponent(selected.game.gameId)}`, { model })}>Inspect {selected.game.awayTeam} at {selected.game.homeTeam} →</a></div>
    <details className="disclosure"><summary>All chart values</summary><div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable analysis table"><table><caption className="sr-only">Cumulative and recent artificial holdout results</caption><thead><tr><th>Date</th><th>Game</th><th>Correct / scored</th><th>Cumulative</th><th>Recent</th></tr></thead><tbody>{points.map(p => <tr key={p.game.gameId}><td>{dayLabel(p.game.date)}</td><td><a href={href(`/games/${encodeURIComponent(p.game.gameId)}`, { model })}>{p.game.awayTeam} at {p.game.homeTeam}</a></td><td>{p.correct}/{p.games}</td><td>{percentage(p.accuracy)}</td><td>{p.recent.correct}/{p.recent.games}</td></tr>)}</tbody></table></div></details>
  </div>
}
