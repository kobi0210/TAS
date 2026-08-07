import type { Player, Auction, Team } from '@/types/database'
import { formatPoints } from '@/lib/auction/rules'
import { accentBySlot } from '@/lib/auction/visuals'
import { PlayerAvatar } from './PlayerAvatar'
import { PositionGlyph } from './PositionGlyph'

interface Props {
  player: Player
  auction: Auction
  highestTeam: Team | null
}

/**
 * 중앙 무대 — 지금 경매 중인 선수.
 * 좌우 보드를 넓게 쓰느라 중앙이 좁으므로 세로로 쌓아 배치한다.
 */
export function StagePlayerCard({ player, auction, highestTeam }: Props) {
  const accent = highestTeam ? accentBySlot(highestTeam.slot_number) : null
  const bid = auction.current_bid ?? player.starting_bid
  const settled = auction.status === 'sold' || auction.status === 'unsold'

  return (
    <div
      className={`panel overflow-hidden transition-colors ${
        auction.status === 'sold' ? 'border-sand-600' : ''
      }`}
    >
      <div className="p-4 flex flex-col items-center text-center">
        <PlayerAvatar player={player} size="lg" className="w-24 h-24 rounded-xl" />

        <div className="flex items-center gap-1.5 flex-wrap justify-center mt-3">
          {player.tier && (
            <span className="text-xs font-bold bg-iris-900 text-iris-200 px-2 py-0.5 rounded-md">
              {player.tier}
            </span>
          )}
          {player.position && (
            <span className="inline-flex items-center gap-1 text-xs font-bold bg-pine-900 text-pine-200 px-2 py-0.5 rounded-md">
              <PositionGlyph position={player.position} size={13} />
              {player.position}
            </span>
          )}
          <span className="text-xs text-ink-400 font-mono">#{player.auction_order}</span>
        </div>

        <h2 className="text-2xl font-bold text-ink-50 truncate leading-tight mt-1.5 w-full">
          {player.name}
        </h2>
        {player.nickname && <p className="text-ink-300 text-sm truncate w-full">{player.nickname}</p>}
        {player.description && (
          <p className="text-ink-400 text-xs mt-1.5 line-clamp-2">{player.description}</p>
        )}

        <div className="w-full border-t border-ink-700 mt-3 pt-3">
          <p className="text-xs text-ink-400">
            {settled ? '최종 낙찰가' : '현재 최고 입찰가'}
          </p>
          <p className="text-4xl font-mono font-bold text-sand-400 tabular-nums leading-none mt-1">
            {formatPoints(bid)}
          </p>
          {highestTeam ? (
            <p className={`text-sm font-bold mt-1.5 ${accent?.text ?? 'text-ink-100'}`}>
              {highestTeam.team_name}
            </p>
          ) : (
            <p className="text-sm text-ink-500 mt-1.5">입찰 없음</p>
          )}
          <p className="text-[11px] text-ink-500 mt-1">
            시작가 {formatPoints(player.starting_bid)}
          </p>
        </div>
      </div>

      {settled && (
        <div
          className={`px-4 py-2 text-center text-sm font-bold ${
            auction.status === 'sold' ? 'bg-sand-500 text-ink-950' : 'bg-ink-800 text-ink-300'
          }`}
        >
          {auction.status === 'sold'
            ? `낙찰 — ${highestTeam?.team_name ?? '알 수 없음'} · ${formatPoints(bid)}`
            : '유찰'}
        </div>
      )}
    </div>
  )
}
