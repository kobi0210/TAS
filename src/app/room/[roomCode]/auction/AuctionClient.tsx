'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { useRoomIdentity } from '@/hooks/useRoomIdentity'
import { useRoomState } from '@/hooks/useRoomState'
import { StagePlayerCard } from '@/components/auction/StagePlayerCard'
import { TimeCountBar } from '@/components/auction/TimeCountBar'
import { BidFeed } from '@/components/auction/BidFeed'
import { BidControls } from '@/components/auction/BidControls'
import { HostControls } from '@/components/auction/HostControls'
import { TeamRosterCard } from '@/components/auction/TeamRosterCard'
import { AuctionQueue } from '@/components/auction/AuctionQueue'
import { SoundToggle } from '@/components/auction/SoundToggle'
import { Toast, type ToastMessage } from '@/components/common/Toast'
import { playSound } from '@/lib/audio/auctionSounds'
import { formatPoints } from '@/lib/auction/rules'
import { accentBySlot } from '@/lib/auction/visuals'
import type { AuctionRoom, Team, Player, Auction, Bid } from '@/types/database'
import type { RoomSession, BidErrorCode } from '@/types/auction'

interface Props {
  room: AuctionRoom
  initialTeams: Team[]
  initialPlayers: Player[]
  initialAuction: Auction | null
  initialBids: Bid[]
  session: RoomSession
}

export function AuctionClient({
  room: initialRoom,
  initialTeams,
  initialPlayers,
  initialAuction,
  initialBids,
  session,
}: Props) {
  const router = useRouter()
  const roomCode = initialRoom.room_code

  // 이 탭의 신원 (쿠키가 아니라 탭 토큰으로 확정한다)
  const identity = useRoomIdentity(roomCode, session)

  const {
    room,
    teams,
    players,
    activeAuction,
    recentBids,
    connected,
    serverOffsetMs,
    refresh,
    applyAuctionResult,
  } = useRoomState({
    room: initialRoom,
    teams: initialTeams,
    players: initialPlayers,
    activeAuction: initialAuction,
    recentBids: initialBids,
  })

  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [nextInSeconds, setNextInSeconds] = useState<number | null>(null)

  const isHost = identity.role === 'host'
  const myTeam = identity.teamId ? teams.find((t) => t.id === identity.teamId) : undefined
  const activePlayer = activeAuction
    ? players.find((p) => p.id === activeAuction.player_id) ?? null
    : null
  const highestTeam =
    activeAuction?.highest_team_id
      ? teams.find((t) => t.id === activeAuction.highest_team_id) ?? null
      : null

  const pendingPlayers = useMemo(() => players.filter((p) => p.status === 'pending'), [players])
  const unsoldCount = players.filter((p) => p.status === 'unsold').length
  const soldCount = players.filter((p) => p.status === 'sold').length
  const auctionLive =
    !!activeAuction && (activeAuction.status === 'active' || activeAuction.status === 'paused')

  const myTeamSoldCount = myTeam
    ? players.filter((p) => p.sold_team_id === myTeam.id && p.status === 'sold').length
    : 0

  // 방이 끝나면 결과 화면으로
  useEffect(() => {
    if (room.status === 'completed') router.push(`/room/${roomCode}/result`)
  }, [room.status, roomCode, router])

  // 낙찰이 확정되면 낙찰음을 한 번 낸다.
  // 이미 낙찰된 상태로 화면에 들어온 경우(새로고침)에는 울리지 않도록,
  // 처음 받은 경매가 낙찰이면 그 경매는 이미 알린 것으로 둔다.
  const announcedSold = useRef<string | null>(
    initialAuction?.status === 'sold' ? initialAuction.id : null
  )
  const auctionId = activeAuction?.id ?? null
  const auctionStatus = activeAuction?.status ?? null

  useEffect(() => {
    if (!auctionId || auctionStatus !== 'sold') return
    if (announcedSold.current === auctionId) return
    announcedSold.current = auctionId
    playSound('sold')
  }, [auctionId, auctionStatus])

  /** 운영자 조작 공통 처리 — 실패 사유를 항상 화면에 띄운다. */
  const runAction = useCallback(
    async (
      key: string,
      path: string,
      body: Record<string, unknown>,
      okMessage?: string
    ): Promise<boolean> => {
      setBusy(key)
      try {
        const result = await apiFetch(roomCode, path, {
          method: 'POST',
          body: JSON.stringify({ roomCode, ...body }),
        })
        if (!result.ok) {
          setToast({ kind: 'error', text: result.error ?? '요청을 처리하지 못했습니다.' })
          await refresh()
          return false
        }
        applyAuctionResult(result.data)
        if (okMessage) setToast({ kind: 'info', text: okMessage })
        // 응답 반영 후 실제 상태로 한 번 더 맞춘다
        refresh()
        return true
      } finally {
        setBusy(null)
      }
    },
    [roomCode, refresh, applyAuctionResult]
  )

  // --- 경매 종료 확정 -------------------------------------------------------
  const finalizingRef = useRef<string | null>(null)
  const handleExpired = useCallback(async () => {
    const auctionId = activeAuction?.id
    if (!auctionId) return
    // 입찰로 시간이 연장되면 같은 경매라도 다시 확정을 시도해야 한다
    const key = `${auctionId}:${activeAuction?.ends_at ?? ''}`
    if (finalizingRef.current === key) return
    finalizingRef.current = key
    const result = await apiFetch(roomCode, '/api/auction?action=finalize', {
      method: 'POST',
      body: JSON.stringify({ roomCode, auctionId, force: false }),
    })
    applyAuctionResult(result.data)
    refresh()
  }, [activeAuction?.id, activeAuction?.ends_at, roomCode, refresh, applyAuctionResult])

  // --- 입찰 ----------------------------------------------------------------
  const handleBid = useCallback(
    async (amount: number): Promise<{ success: boolean; code?: BidErrorCode }> => {
      if (!activeAuction) return { success: false, code: 'AUCTION_NOT_FOUND' }
      const result = await apiFetch<{ success: boolean; code?: BidErrorCode }>(
        roomCode,
        '/api/auction?action=bid',
        {
          method: 'POST',
          body: JSON.stringify({ roomCode, auctionId: activeAuction.id, amount }),
        }
      )
      // 브로드캐스트를 기다리지 않고 곧바로 최신 상태를 당겨온다
      refresh()
      if (result.data) return result.data
      return { success: false, code: 'INTERNAL_ERROR' }
    },
    [activeAuction, roomCode, refresh]
  )

  // --- 자동 진행 ------------------------------------------------------------
  const startingRef = useRef(false)

  const startNext = useCallback(async (): Promise<void> => {
    if (startingRef.current) return
    startingRef.current = true
    setBusy('start')
    try {
      const result = await apiFetch<{ success: boolean; code?: string }>(
        roomCode,
        '/api/auction?action=startNext',
        { method: 'POST', body: JSON.stringify({ roomCode }) }
      )
      if (!result.ok) {
        const code = result.data?.code
        if (code === 'NO_PENDING_PLAYERS') {
          setToast({ kind: 'info', text: '모든 선수의 경매가 끝났습니다.' })
          await apiFetch(roomCode, '/api/auction?action=auto', {
            method: 'POST',
            body: JSON.stringify({ roomCode, enabled: false }),
          })
        } else if (code !== 'AUCTION_ALREADY_RUNNING') {
          setToast({ kind: 'error', text: result.error ?? '다음 경매를 시작하지 못했습니다.' })
        }
        await refresh()
        return
      }
      applyAuctionResult(result.data)
      refresh()
    } finally {
      startingRef.current = false
      setBusy(null)
    }
  }, [roomCode, refresh, applyAuctionResult])

  const autoArmed = isHost && room.auto_advance && !auctionLive

  useEffect(() => {
    if (!autoArmed) {
      setNextInSeconds(null)
      return
    }
    const delayMs = Math.max(0, room.auto_delay_seconds) * 1000
    const deadline = Date.now() + delayMs
    setNextInSeconds(Math.ceil(delayMs / 1000))

    const id = setInterval(() => {
      const left = deadline - Date.now()
      if (left <= 0) {
        clearInterval(id)
        setNextInSeconds(null)
        startNext()
      } else {
        setNextInSeconds(Math.ceil(left / 1000))
      }
    }, 250)

    return () => clearInterval(id)
  }, [autoArmed, room.auto_delay_seconds, startNext])

  // --- 운영자 액션 ----------------------------------------------------------
  const startAuto = async () => {
    setBusy('auto')
    try {
      const shuffled = await apiFetch(roomCode, '/api/auction?action=shuffle', {
        method: 'POST',
        body: JSON.stringify({ roomCode }),
      })
      if (!shuffled.ok) {
        setToast({ kind: 'error', text: shuffled.error ?? '순번을 섞지 못했습니다.' })
        return
      }
      const enabled = await apiFetch(roomCode, '/api/auction?action=auto', {
        method: 'POST',
        body: JSON.stringify({ roomCode, enabled: true }),
      })
      if (!enabled.ok) {
        setToast({ kind: 'error', text: enabled.error ?? '자동 진행을 켜지 못했습니다.' })
        return
      }
      setToast({ kind: 'info', text: '순번을 무작위로 섞었습니다. 곧 경매가 시작됩니다.' })
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  const stopAuto = () =>
    runAction('auto', '/api/auction?action=auto', { enabled: false }, '자동 진행을 멈췄습니다.')

  const startPlayer = (playerId: string) =>
    runAction('start', '/api/auction?action=start', { playerId })

  const pause = () =>
    activeAuction &&
    runAction('pause', '/api/auction?action=control', {
      auctionId: activeAuction.id,
      action: 'pause',
    })

  const resume = () =>
    activeAuction &&
    runAction('resume', '/api/auction?action=control', {
      auctionId: activeAuction.id,
      action: 'resume',
    })

  const forceFinalize = () =>
    activeAuction &&
    runAction('finalize', '/api/auction?action=finalize', {
      auctionId: activeAuction.id,
      force: true,
    })

  const cancelAuction = () =>
    activeAuction &&
    runAction(
      'cancel',
      '/api/auction?action=control',
      { auctionId: activeAuction.id, action: 'cancel' },
      '경매를 취소했습니다.'
    )

  const requeueUnsold = () =>
    runAction('requeue', '/api/auction?action=requeueUnsold', {}, '유찰 선수를 대기열로 되돌렸습니다.')

  const completeRoom = async () => {
    const ok = await runAction('complete', '/api/auction?action=completeRoom', {})
    if (ok) router.push(`/room/${roomCode}/result`)
  }

  const myAccent = myTeam ? accentBySlot(myTeam.slot_number) : null

  return (
    <main className="h-screen flex flex-col gap-3 p-3 bg-ink-900 overflow-hidden">
      {/* 헤더 */}
      <header className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="text-lg font-bold text-ink-50 truncate">{room.name}</h1>
          <span className="text-xs text-ink-400 shrink-0">
            낙찰 {soldCount} · 대기 {pendingPlayers.length} · 유찰 {unsoldCount}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md ${
              connected ? 'text-pine-200 bg-pine-900/60' : 'text-ink-300 bg-ink-800'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-pine-300' : 'bg-ink-500'}`} />
            {connected ? '실시간 연결됨' : '동기화 중'}
          </span>

          <SoundToggle />

          {isHost ? (
            <Link href={`/room/${roomCode}/players`} className="btn btn-ghost h-8 text-xs">
              선수 관리
            </Link>
          ) : myTeam ? (
            <div
              className={`flex items-center gap-3 px-3 py-1.5 rounded-lg bg-ink-850 border ${
                myAccent?.border ?? 'border-ink-700'
              }`}
            >
              <p className={`text-sm font-bold leading-tight ${myAccent?.text ?? 'text-ink-100'}`}>
                {myTeam.team_name}
              </p>
              <div className="text-right leading-none">
                <p className="text-[10px] text-ink-400 mb-0.5">잔여 포인트</p>
                <p className="text-xl font-mono font-bold text-sand-300 tabular-nums">
                  {formatPoints(myTeam.remaining_points)}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {/* 같은 브라우저에서 여러 팀이 접속했을 때의 안내 */}
      {identity.resolved && identity.role === 'team' && identity.source === 'cookie' && (
        <p className="shrink-0 text-[11px] text-sand-200 bg-sand-900/60 border border-sand-700 rounded-lg px-3 py-2">
          이 탭은 팀 정보를 브라우저 공용 쿠키에서 읽었습니다. 여러 팀이 같은 브라우저를 쓰는 경우
          다른 팀으로 인식될 수 있으니, 받은 초대 링크를 이 탭에서 다시 한 번 열어 주세요.
        </p>
      )}

      {/* 본문 3단 */}
      {/* 좌:중앙:우 = 2:1:2 — 팀 보드와 경매순서를 크게 보고, 무대는 좁게 압축한다 */}
      <div className="flex-1 min-h-0 grid gap-3 grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)_minmax(0,2fr)]">
        {/* 좌 — 팀 보드 */}
        <section className="min-h-0 overflow-y-auto space-y-2 pr-0.5">
          {teams.map((team) => (
            <TeamRosterCard
              key={team.id}
              team={team}
              players={players}
              isHighestBidder={activeAuction?.highest_team_id === team.id}
              isMe={identity.teamId === team.id}
            />
          ))}
        </section>

        {/* 중앙 — 무대 */}
        <section className="min-h-0 flex flex-col gap-3">
          {activePlayer && activeAuction ? (
            <StagePlayerCard
              player={activePlayer}
              auction={activeAuction}
              highestTeam={highestTeam}
            />
          ) : (
            <div className="panel flex flex-col items-center justify-center py-10 gap-2">
              <p className="text-ink-300 text-sm">
                {pendingPlayers.length === 0
                  ? '모든 선수의 경매가 끝났습니다.'
                  : '경매 대기 중입니다.'}
              </p>
              {isHost && pendingPlayers.length > 0 && !room.auto_advance && (
                <p className="text-ink-500 text-xs">
                  아래 &lsquo;무작위 자동 경매 시작&rsquo;을 누르면 순번을 섞어 자동으로 진행합니다.
                </p>
              )}
            </div>
          )}

          <TimeCountBar
            auction={activeAuction}
            offsetMs={serverOffsetMs}
            onExpired={handleExpired}
            nextInSeconds={nextInSeconds}
          />

          {identity.role === 'team' && myTeam && activeAuction && activePlayer && (
            <BidControls
              auction={activeAuction}
              player={activePlayer}
              room={room}
              myTeam={myTeam}
              soldPlayers={myTeamSoldCount}
              onBid={handleBid}
            />
          )}

          {identity.resolved && isHost && (
            <HostControls
              room={room}
              activeAuction={activeAuction}
              pendingPlayers={pendingPlayers}
              unsoldCount={unsoldCount}
              autoAdvance={room.auto_advance}
              nextInSeconds={nextInSeconds}
              busy={busy}
              onStartAuto={startAuto}
              onStopAuto={stopAuto}
              onStartNext={startNext}
              onStartPlayer={startPlayer}
              onPause={pause}
              onResume={resume}
              onForceFinalize={forceFinalize}
              onCancelAuction={cancelAuction}
              onRequeueUnsold={requeueUnsold}
              onCompleteRoom={completeRoom}
            />
          )}

          <div className="flex-1 min-h-0">
            <BidFeed bids={recentBids} teams={teams} players={players} showRejected={isHost} />
          </div>
        </section>

        {/* 우 — 경매순서 */}
        <section className="min-h-0 hidden xl:flex flex-col">
          <AuctionQueue
            players={players}
            teams={teams}
            activePlayerId={activePlayer?.id ?? null}
          />
        </section>
      </div>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </main>
  )
}
