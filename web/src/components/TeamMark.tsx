import type { Team } from '../lib/model'
export default function TeamMark({ team, small = false }: { team: Team; small?: boolean }) {
  return <span className={`team-mark team-${team}${small ? ' small' : ''}`} aria-hidden="true">{team}</span>
}
