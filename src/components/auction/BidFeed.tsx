'use client'

import { useEffect, useRef } from 'react'
import type { Bid, Team, Player } from '@/types/database'
import { formatPoints } from '@/lib/auction/rules'
import { accentBySlot } from '@/lib/auction/visuals'
import { BID_ERROR_MESSAGES, type BidErrorCode } from '@/types/auction'

interface Props {
  bids: Bid[]
  teams: Team[]
  players: Player[]
  /** 실패한 입찰까지 보여줄지 (운영자에게만 유용) */
  showRejected?: boolean
}

/** 중앙 하단 입찰 로그 (자낳대 경매판의 채팅형 로그). */
export function BidFeed({ bids, teams, players, showRejected = false }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const visible = (showRejected ? bids : bids.filter((b) => b.accepted)).slice(0, 40)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [bids.length])

  return (
    <div className="panel flex flex-col min-h-0 h-full">
      <div className="panel-head">
        <span>입찰 로그</span>
        <span className="text-ink-500 font-normal">{visible.length}건</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1 min-h-[120px]">
        {visible.length === 0 && (
          <p className="text-ink-500 text-xs text-center py-6">아직 입찰이 없습니다.</p>
        )}
        {/* 최신이 위로 오도록 그대로 그린다 */}
        {visible.map((bid) => {
          const team = teams.find((t) => t.id === bid.team_id)
          const player = players.find((p) => p.id === bid.player_id)
          const accent = team ? accentBySlot(team.slot_number) : null
          return (
            <div
              key={bid.id}
              className="flex items-center gap-2 text-xs py-1 border-b border-ink-800 last:border-0 animate-flash-in"
            >
              <span className={`font-bold shrink-0 ${accent?.text ?? 'text-ink-300'}`}>
                {team?.team_name ?? '알 수 없음'}
              </span>
              <span className="text-ink-600">·</span>
              <span className="text-ink-300 truncate">{player?.name ?? '선수'}</span>
              <span className="ml-auto shrink-0 font-mono font-bold tabular-nums">
                {bid.accepted ? (
                  <span className="text-sand-300">{formatPoints(bid.amount)} P</span>
                ) : (
                  <span className="text-mauve-400" title={reasonOf(bid.rejection_reason)}>
                    {formatPoints(bid.amount)} P · 실패
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function reasonOf(code: string | null): string {
  if (!code) return '실패'
  return BID_ERROR_MESSAGES[code as BidErrorCode] ?? code
}
