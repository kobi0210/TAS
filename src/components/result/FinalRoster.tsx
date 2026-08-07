import type { Team, Player } from '@/types/database'
import { formatPoints } from '@/lib/auction/rules'
import { accentBySlot } from '@/lib/auction/visuals'

interface Props {
  team: Team
  players: Player[]
}

export function FinalRoster({ team, players }: Props) {
  const sold = players
    .filter((p) => p.sold_team_id === team.id && p.status === 'sold')
    .sort((a, b) => (b.sold_price ?? 0) - (a.sold_price ?? 0))
  const totalSpent = team.starting_points - team.remaining_points
  const accent = accentBySlot(team.slot_number)

  return (
    <div className="panel p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className={`w-1.5 h-6 rounded-full ${accent.bg}`} />
        <div>
          <h3 className={`font-bold text-lg leading-tight ${accent.text}`}>{team.team_name}</h3>
          <p className="text-ink-400 text-sm">{team.captain_name}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm mb-4">
        <div className="bg-ink-900 border border-ink-700 rounded-lg p-2 text-center">
          <div className="text-ink-400 text-[11px]">사용</div>
          <div className="text-ink-50 font-mono font-bold">{formatPoints(totalSpent)}</div>
        </div>
        <div className="bg-ink-900 border border-ink-700 rounded-lg p-2 text-center">
          <div className="text-ink-400 text-[11px]">잔여</div>
          <div className="text-ink-50 font-mono font-bold">{formatPoints(team.remaining_points)}</div>
        </div>
      </div>
      <ul className="space-y-1.5">
        {sold.length === 0 && (
          <li className="text-ink-500 text-sm text-center py-2">낙찰 선수 없음</li>
        )}
        {sold.map((p) => (
          <li key={p.id} className="flex items-center justify-between text-sm gap-2">
            <div className="min-w-0">
              <span className="text-ink-50">{p.name}</span>
              {p.position && <span className="text-ink-500 ml-1 text-xs">{p.position}</span>}
              {p.tier && <span className="text-iris-300 ml-1 text-xs">{p.tier}</span>}
            </div>
            <span className="text-sand-300 font-mono tabular-nums shrink-0">
              {formatPoints(p.sold_price ?? 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
