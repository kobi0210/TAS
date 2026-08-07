'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import type { Auction, AuctionRoom, Player } from '@/types/database'

interface Props {
  room: AuctionRoom
  activeAuction: Auction | null
  pendingPlayers: Player[]
  unsoldCount: number
  autoAdvance: boolean
  nextInSeconds: number | null
  busy: string | null
  onStartAuto: () => void
  onStopAuto: () => void
  onStartNext: () => void
  onStartPlayer: (playerId: string) => void
  onPause: () => void
  onResume: () => void
  onForceFinalize: () => void
  onCancelAuction: () => void
  onRequeueUnsold: () => void
  onCompleteRoom: () => void
}

/**
 * 운영자 조작 바.
 *
 * 모든 버튼은 눌린 즉시 그 버튼만 비활성화되고(busy), 결과·실패 사유는 상위에서
 * 알림으로 보여준다. 예전처럼 "눌러도 아무 일도 안 일어나는" 상태가 없도록.
 */
export function HostControls({
  room,
  activeAuction,
  pendingPlayers,
  unsoldCount,
  autoAdvance,
  nextInSeconds,
  busy,
  onStartAuto,
  onStopAuto,
  onStartNext,
  onStartPlayer,
  onPause,
  onResume,
  onForceFinalize,
  onCancelAuction,
  onRequeueUnsold,
  onCompleteRoom,
}: Props) {
  const [confirm, setConfirm] = useState<null | 'forceFinalize' | 'cancel' | 'complete'>(null)
  const [selectedPlayer, setSelectedPlayer] = useState('')

  const isActive = activeAuction?.status === 'active'
  const isPaused = activeAuction?.status === 'paused'
  const isLive = isActive || isPaused
  const noPending = pendingPlayers.length === 0

  return (
    <div className="panel p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide text-sand-300">운영자 조작</h3>
        <div className="flex items-center gap-2 text-[11px] text-ink-400">
          <span>대기 {pendingPlayers.length}명</span>
          {autoAdvance && (
            <span className="text-pine-300 font-bold">
              자동 진행 중{nextInSeconds != null ? ` · ${nextInSeconds}초 후 다음` : ''}
            </span>
          )}
        </div>
      </div>

      {/* 진행 조작 */}
      <div className="flex flex-wrap gap-2">
        {!autoAdvance ? (
          <button
            onClick={onStartAuto}
            disabled={busy === 'auto' || noPending}
            className="btn btn-primary"
            title="남은 선수를 무작위 순번으로 섞고 자동으로 이어서 경매합니다"
          >
            {busy === 'auto' ? '시작 중...' : '무작위 자동 경매 시작'}
          </button>
        ) : (
          <button onClick={onStopAuto} disabled={busy === 'auto'} className="btn btn-ghost">
            자동 진행 중지
          </button>
        )}

        {!isLive && (
          <button
            onClick={onStartNext}
            disabled={busy === 'start' || noPending}
            className="btn btn-pine"
          >
            {busy === 'start' ? '시작 중...' : '다음 선수 시작'}
          </button>
        )}

        {isActive && (
          <button onClick={onPause} disabled={busy === 'pause'} className="btn btn-ghost">
            일시정지
          </button>
        )}
        {isPaused && (
          <button onClick={onResume} disabled={busy === 'resume'} className="btn btn-pine">
            재개
          </button>
        )}
        {isLive && (
          <>
            <button
              onClick={() => setConfirm('forceFinalize')}
              disabled={busy === 'finalize'}
              className="btn btn-iris"
            >
              즉시 낙찰
            </button>
            <button
              onClick={() => setConfirm('cancel')}
              disabled={busy === 'cancel'}
              className="btn btn-mauve"
            >
              경매 취소
            </button>
          </>
        )}

        {unsoldCount > 0 && !isLive && (
          <button onClick={onRequeueUnsold} disabled={busy === 'requeue'} className="btn btn-ghost">
            유찰 {unsoldCount}명 재경매
          </button>
        )}

        {!isLive && room.status !== 'completed' && (
          <button
            onClick={() => setConfirm('complete')}
            disabled={busy === 'complete'}
            className="btn btn-ghost ml-auto"
          >
            전체 경매 종료
          </button>
        )}
      </div>

      {/* 특정 선수 지목 */}
      {!isLive && !noPending && (
        <div className="flex gap-2">
          <select
            value={selectedPlayer}
            onChange={(e) => setSelectedPlayer(e.target.value)}
            className="field flex-1"
          >
            <option value="">선수를 지목해 시작</option>
            {pendingPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.auction_order}. {p.name}
                {p.nickname ? ` (${p.nickname})` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={() => onStartPlayer(selectedPlayer)}
            disabled={!selectedPlayer || busy === 'start'}
            className="btn btn-ghost"
          >
            지목 시작
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirm === 'forceFinalize'}
        title="즉시 낙찰"
        message="현재 최고 입찰자에게 지금 바로 낙찰합니다. 입찰이 없으면 유찰 처리됩니다."
        confirmLabel="즉시 낙찰"
        onConfirm={() => {
          setConfirm(null)
          onForceFinalize()
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        title="경매 취소"
        message="현재 경매를 취소하고 선수를 대기 상태로 되돌립니다. 이 선수의 입찰 기록은 사라집니다."
        confirmLabel="취소하기"
        onConfirm={() => {
          setConfirm(null)
          onCancelAuction()
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'complete'}
        title="전체 경매 종료"
        message="모든 경매를 마치고 결과 화면으로 이동합니다."
        confirmLabel="종료"
        onConfirm={() => {
          setConfirm(null)
          onCompleteRoom()
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
