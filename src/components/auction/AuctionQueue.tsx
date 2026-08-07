import type { Player, Team } from '@/types/database'
import { formatPoints } from '@/lib/auction/rules'
import { accentBySlot } from '@/lib/auction/visuals'
import { PlayerAvatar } from './PlayerAvatar'
import { PositionGlyph } from './PositionGlyph'

interface Props {
  players: Player[]
  teams: Team[]
  activePlayerId: string | null
}

/** 우측 패널 — 경매순서 / 유찰순서 (자낳대 경매판 우측 구성). */
export function AuctionQueue({ players, teams, activePlayerId }: Props) {
  const queue = players
    .filter((p) => p.status === 'pending' || p.id === activePlayerId)
    .sort((a, b) => a.auction_order - b.auction_order)
  const unsold = players.filter((p) => p.status === 'unsold')
  const sold = players.filter((p) => p.status === 'sold')

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="panel flex flex-col min-h-0 flex-1">
        <div className="panel-head">
          <span>경매순서</span>
          <span className="text-ink-500 font-normal">{queue.length}명 대기</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2.5">
          {queue.length === 0 ? (
            <p className="text-ink-500 text-xs text-center py-6">남은 선수가 없습니다.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(74px,1fr))] gap-2.5">
              {queue.map((p) => {
                const isActive = p.id === activePlayerId
                return (
                  <div key={p.id} className="text-center">
                    <div
                      className={`rounded-lg p-0.5 border ${
                        isActive ? 'border-sand-500 bg-sand-900/40 ring-1 ring-sand-600/50' : 'border-ink-700'
                      }`}
                    >
                      <PlayerAvatar player={p} size="md" className="w-full h-14" />
                    </div>
                    <p
                      className={`mt-1.5 text-xs truncate ${
                        isActive ? 'text-sand-300 font-bold' : 'text-ink-200'
                      }`}
                    >
                      {p.name}
                    </p>
                    <div className="flex items-center justify-center gap-1 text-[10px] text-ink-500 font-mono">
                      <PositionGlyph position={p.position} size={12} className="opacity-80" />
                      <span>#{p.auction_order}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="panel flex flex-col shrink-0 max-h-[30%]">
        <div className="panel-head">
          <span>유찰순서</span>
          <span className="text-ink-500 font-normal">{unsold.length}명</span>
        </div>
        <div className="overflow-y-auto p-2.5">
          {unsold.length === 0 ? (
            <p className="text-ink-500 text-xs text-center py-3">유찰된 선수가 없습니다.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {unsold.map((p) => (
                <div key={p.id} className="w-[68px] text-center">
                  <div className="relative rounded-lg overflow-hidden border border-ink-700">
                    <PlayerAvatar player={p} size="md" className="w-full h-14 grayscale opacity-55" />
                    <span
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        backgroundImage:
                          'repeating-linear-gradient(45deg, rgba(66,59,44,.85) 0 1px, transparent 1px 6px)',
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-ink-500 truncate">{p.name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel shrink-0">
        <div className="panel-head">
          <span>낙찰 현황</span>
          <span className="text-ink-500 font-normal">{sold.length}명</span>
        </div>
        <ul className="max-h-44 overflow-y-auto px-3 py-2 space-y-1.5">
          {sold.length === 0 && (
            <li className="text-ink-500 text-xs text-center py-2">아직 낙찰이 없습니다.</li>
          )}
          {[...sold].reverse().map((p) => {
            const team = teams.find((t) => t.id === p.sold_team_id)
            const accent = team ? accentBySlot(team.slot_number) : null
            return (
              <li key={p.id} className="flex items-center gap-2 text-xs">
                <span className="text-ink-100 truncate">{p.name}</span>
                <span className={`shrink-0 ${accent?.text ?? 'text-ink-400'}`}>
                  {team?.team_name ?? '-'}
                </span>
                <span className="ml-auto shrink-0 font-mono text-sand-300 tabular-nums">
                  {formatPoints(p.sold_price ?? 0)}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
