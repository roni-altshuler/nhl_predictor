import { correct, dayLabel, percentage, pick, type Game, type Model } from '../lib/model'
import { href } from '../lib/router'
import TeamMark from './TeamMark'

export default function GameCard({ game, model = 'elo', params }: { game: Game; model?: Model; params?: URLSearchParams }) {
  const matched = correct(game, model)
  return <a className="game-card" href={href(`/games/${encodeURIComponent(game.gameId)}`, params)}>
    <div className="game-meta"><span>{dayLabel(game.date, true)}</span><span className={`badge ${game.phase === 'warmup' ? 'neutral' : ''}`}>{game.phase === 'warmup' ? 'Warmup' : 'Holdout replay'}</span></div>
    <div className="game-team"><TeamMark team={game.awayTeam} small /><span>Team {game.awayTeam}<small>Away</small></span><strong className="score">{game.awayGoals}</strong></div>
    <div className="game-team"><TeamMark team={game.homeTeam} small /><span>Team {game.homeTeam}<small>Home</small></span><strong className="score">{game.homeGoals}</strong></div>
    <div className="game-probability"><span>Replay home chance</span><strong>{percentage(game.homeWinProbability[model])}</strong></div>
    <div className="game-bottom"><span>{game.phase === 'warmup' ? 'Not in scored record' : `Pick ${pick(game, model)} · ${matched ? 'matched' : 'missed'}`}</span><span aria-hidden="true">→</span></div>
  </a>
}
