/** Original abstract rink illustration; no league/team artwork. */
export default function Rink() {
  return <svg className="rink" viewBox="0 0 520 270" fill="none" aria-hidden="true">
    <rect x="10" y="10" width="500" height="250" rx="100" className="rink-border" />
    <path d="M170 12v246M350 12v246" className="rink-blue" /><path d="M260 12v246M56 45v180M464 45v180" className="rink-red" />
    <circle cx="260" cy="135" r="40" className="rink-border" /><circle cx="260" cy="135" r="5" className="rink-dot" />
    {[110, 410].flatMap(x => [76, 194].map(y => <g key={`${x}-${y}`}><circle cx={x} cy={y} r="29" className="rink-red" /><circle cx={x} cy={y} r="3" className="rink-red-fill" /></g>))}
    <path d="M56 112a23 23 0 0 1 0 46M464 112a23 23 0 0 0 0 46" className="rink-blue" />
    <circle cx="321" cy="122" r="10" className="puck" /><path d="m316 128-36 19-37 1" className="puck-trail" />
  </svg>
}
