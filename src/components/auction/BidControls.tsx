'use client'

import { useState } from 'react'
import { calcMaxAffordable, formatPoints } from '@/lib/auction/rules'
import { BID_ERROR_MESSAGES, type BidErrorCode } from '@/types/auction'
import type { Auction, AuctionRoom, Team, Player } from '@/types/database'

interface Props {
  auction: Auction
  player: Player
  room: AuctionRoom
  myTeam: Team
  soldPlayers: number
  onBid: (amount: number) => Promise<{ success: boolean; code?: BidErrorCode }>
  disabled?: boolean
}

export function BidControls({
  auction,
  player,
  room,
  myTeam,
  soldPlayers,
  onBid,
  disabled,
}: Props) {
  const [customAmount, setCustomAmount] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 첫 입찰은 선수 시작가, 이후는 직전 입찰가 + 입찰 단위
  const minBid =
    auction.current_bid === null ? player.starting_bid : auction.current_bid + room.bid_increment

  const remainingSlots = myTeam.max_players - soldPlayers
  const maxAffordable = calcMaxAffordable(
    myTeam.remaining_points,
    remainingSlots,
    room.default_starting_bid
  )

  const isHighest = auction.highest_team_id === myTeam.id && !room.allow_self_raise
  const isActive = auction.status === 'active'
  const rosterFull = remainingSlots <= 0
  const cannotBid = pending || !isActive || isHighest || disabled || rosterFull

  async function submit(amount: number) {
    if (cannotBid) return
    setPending(true)
    setError(null)
    try {
      const result = await onBid(amount)
      if (!result.success && result.code) {
        setError(BID_ERROR_MESSAGES[result.code] ?? '입찰에 실패했습니다.')
      }
    } finally {
      setPending(false)
    }
  }

  function handleCustomBid() {
    const amt = parseInt(customAmount.replace(/[^0-9]/g, ''), 10)
    if (!Number.isFinite(amt)) {
      setError('올바른 금액을 입력하세요.')
      return
    }
    submit(amt)
    setCustomAmount('')
  }

  // 최소가에서 입찰 단위만큼 올려가는 빠른 버튼
  const steps = [0, 1, 3, 10]
  const quickBids = Array.from(
    new Set(steps.map((s) => minBid + s * room.bid_increment))
  ).filter((amt) => amt <= maxAffordable)

  return (
    <div className="panel p-3 space-y-2.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-ink-400">
          최소 <span className="text-sand-300 font-mono font-bold">{formatPoints(minBid)}</span>
          {' · '}
          최대 <span className="text-sand-300 font-mono font-bold">{formatPoints(maxAffordable)}</span>
        </span>
        <span className="text-ink-400">
          보유 <span className="text-ink-50 font-mono">{formatPoints(myTeam.remaining_points)}</span>
          {' · '}
          자리 <span className="text-ink-50">{remainingSlots}</span>
        </span>
      </div>

      {rosterFull && (
        <p className="text-xs text-center text-ink-300 bg-ink-800 rounded-lg py-1.5">
          팀 정원이 가득 찼습니다.
        </p>
      )}
      {isHighest && !rosterFull && (
        <p className="text-xs text-center text-pine-200 bg-pine-900/60 border border-pine-700 rounded-lg py-1.5">
          현재 최고 입찰자입니다
        </p>
      )}
      {error && (
        <p className="text-xs text-center text-mauve-200 bg-mauve-900/60 border border-mauve-700 rounded-lg py-1.5">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        {quickBids.map((amt, i) => (
          <button
            key={amt}
            onClick={() => submit(amt)}
            disabled={cannotBid || amt > maxAffordable}
            className={`btn ${i === 0 ? 'btn-primary' : 'btn-ghost'} px-2`}
          >
            <span className="font-mono">{formatPoints(amt)}</span>
          </button>
        ))}
        {quickBids.length === 0 && (
          <p className="col-span-2 text-xs text-center text-ink-400 py-2">
            남은 포인트로 최소 입찰가를 맞출 수 없습니다.
          </p>
        )}
      </div>

      <div className="flex gap-1.5">
        <input
          type="number"
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCustomBid()}
          placeholder="직접 입력"
          min={minBid}
          max={maxAffordable}
          className="field flex-1 font-mono"
          disabled={cannotBid}
        />
        <button
          onClick={handleCustomBid}
          disabled={cannotBid || !customAmount}
          className="btn btn-pine px-5"
        >
          {pending ? '…' : '입찰'}
        </button>
      </div>
    </div>
  )
}
