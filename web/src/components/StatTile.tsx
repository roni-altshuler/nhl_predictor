import type { ReactNode } from 'react'
export default function StatTile({ label, value, note }: { label: string; value: ReactNode; note: string }) {
  return <div className="stat-tile"><p className="eyebrow">{label}</p><p className="stat-value">{value}</p><p className="muted small-text">{note}</p></div>
}
