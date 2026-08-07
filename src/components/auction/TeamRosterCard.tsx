import type { Team, Player } from '@/types/database'
import { formatPoints } from '@/lib/auction/rules'
import { accentBySlot } from '@/lib/auction/visuals'
import { CaptainAvatar } from '@/components/common/CaptainAvatar'
import { PlayerAvatar } from './PlayerAvatar'
import { PositionGlyph, slotPosition } from './PositionGlyph'

interface Props {
  team: Team
  players: Player[]
  isHighestBidder: boolean
  isMe: boolean
}

/**
 * 좌측 팀 보드 한 칸.
 *
 * 팀 정원만큼 슬롯을 깔아 두고 낙찰된 선수를 채워 넣는다. 빈 슬롯도 어떤
 * 자리인지 보이도록 포지션 기호를 남겨, 판 전체가 한눈에 읽히게 한다.
 * 잔여 포인트는 팀 색으로 채운 큰 칩으로 띄워 가장 먼저 눈에 들어오게 한다.
 */
export function TeamRosterCard({ team, players, isHighestBidder, isMe }: Props) {
  const accent = accentBySlot(team.slot_number)
  const roster = players
    .filter((p) => p.sold_team_id === team.id && p.status === 'sold')
    .sort((a, b) => a.auction_order - b.auction_order)

  const slots = Array.from({ length: team.max_players }, (_, i) => roster[i] ?? null)

  return (
    <div
      className={`rounded-xl border bg-ink-850 transition-colors ${
        isHighestBidder ? `${accent.border} bg-ink-800` : 'border-ink-700'
      }`}
    >
      {/* 머리: 팀명 왼쪽, 잔여 포인트는 팀 색으로 채운 칩 */}
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-ink-700/70">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-6 rounded-full shrink-0 ${accent.bg}`} />
          <span className="font-bold text-base truncate text-ink-50">{team.team_name}</span>
          {isMe && (
            <span className="text-[11px] font-bold text-ink-950 bg-ink-200 rounded px-2 py-0.5 shrink-0">
              나
            </span>
          )}
          {isHighestBidder && (
            <span className="text-[11px] font-bold text-ink-950 bg-sand-400 rounded px-2 py-0.5 shrink-0">
              최고가
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-ink-400 leading-tight text-right">
            잔여
            <br />
            포인트
          </span>
          <span
            className={`font-mono font-bold text-xl tabular-nums rounded-lg px-3 py-1 text-ink-950 ${accent.bg}`}
          >
            {formatPoints(team.remaining_points)}
          </span>
        </div>
      </div>

      <div className="flex gap-2 p-3 items-start">
        <div className="flex gap-2 min-w-0 flex-1 overflow-x-auto">
          {slots.map((player, i) => (
            <div key={player?.id ?? `empty-${i}`} className="relative shrink-0 w-[68px]">
              {player ? (
                <>
                  <div className={`rounded-lg border ${accent.border} p-0.5`}>
                    <PlayerAvatar player={player} size="md" className="w-full h-14" />
                  </div>
                  {/* 가로 스크롤 상자 안이라 밖으로 내밀면 잘린다 — 안쪽 모서리에 붙인다 */}
                  <span className="absolute top-1 left-1 text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-sand-500 text-ink-950 shadow">
                    {player.sold_price ?? 0}
                  </span>
                  <div className="mt-1.5 flex items-center justify-center gap-1">
                    <PositionGlyph position={player.position} size={13} className="opacity-90" />
                    <span className="text-xs text-ink-100 truncate">{player.name}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-lg border border-dashed border-ink-700 h-[64px] flex items-center justify-center">
                    <PositionGlyph position={slotPosition(i)} size={30} className="opacity-45" />
                  </div>
                  <p className="mt-1.5 text-xs text-ink-600 text-center">빈 자리</p>
                </>
              )}
            </div>
          ))}
        </div>

        {/* 팀장 — 선수 슬롯과 구분되도록 오른쪽 끝에 세워 둔다 */}
        <div className="shrink-0 w-[84px] pl-3 border-l border-ink-700/70 self-stretch">
          <CaptainAvatar
            name={team.captain_name}
            avatarUrl={team.captain_avatar_url}
            className={`w-full h-[64px] rounded-lg border ${
              isHighestBidder ? accent.border : 'border-ink-700'
            }`}
          />
          <p className="mt-1.5 text-xs text-ink-200 text-center truncate">{team.captain_name}</p>
        </div>
      </div>

      {/* 팀장 이름은 사진 아래에 붙였으므로 여기는 확보 인원만 남긴다 */}
      <div className="flex items-center justify-end px-3.5 pb-2.5 text-xs text-ink-400">
        <span className="font-mono">
          확보 {roster.length} / {team.max_players}
        </span>
      </div>
    </div>
  )
}
