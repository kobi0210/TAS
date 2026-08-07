'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/api/client'
import { useRoomIdentity } from '@/hooks/useRoomIdentity'
import { RoomCodeCard } from '@/components/lobby/RoomCodeCard'
import { TeamSlotCard } from '@/components/lobby/TeamSlotCard'
import { CaptainProfileCard } from '@/components/lobby/CaptainProfileCard'
import { Toast, type ToastMessage } from '@/components/common/Toast'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { accentBySlot } from '@/lib/auction/visuals'
import type { AuctionRoom, Team } from '@/types/database'
import type { RoomSession } from '@/types/auction'

interface Props {
  room: AuctionRoom
  initialTeams: Team[]
  session: RoomSession
}

export function LobbyClient({ room, initialTeams, session }: Props) {
  const [teams, setTeams] = useState<Team[]>(initialTeams)
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [confirmStart, setConfirmStart] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const router = useRouter()

  const identity = useRoomIdentity(room.room_code, session)
  const myTeam = identity.teamId ? teams.find((t) => t.id === identity.teamId) : undefined
  const ready = myTeam?.is_ready ?? false

  useEffect(() => {
    const channel = supabase
      .channel(`lobby:${room.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `room_id=eq.${room.id}` },
        (payload) => {
          const t = payload.new as Team
          if (!t?.id) return
          setTeams((prev) =>
            (prev.some((x) => x.id === t.id) ? prev.map((x) => (x.id === t.id ? t : x)) : [...prev, t]).sort(
              (a, b) => a.slot_number - b.slot_number
            )
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'auction_rooms', filter: `id=eq.${room.id}` },
        (payload) => {
          const r = payload.new as AuctionRoom
          // 'ready'는 운영자가 전원 입장을 누른 상태 — 모두 같은 순간에 넘어간다
          if (r.status === 'ready' || r.status === 'running' || r.status === 'paused') {
            router.replace(`/room/${room.room_code}/auction`)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [room.id, room.room_code, router])

  // 브로드캐스트가 늦거나 유실돼도 전원이 같이 넘어가도록 방 상태를 주기적으로 확인한다
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(
          `/api/room-state?roomCode=${encodeURIComponent(room.room_code)}`,
          { cache: 'no-store' }
        )
        if (!res.ok) return
        const snap = (await res.json()) as { room?: AuctionRoom; teams?: Team[] }
        if (snap.teams) setTeams([...snap.teams].sort((a, b) => a.slot_number - b.slot_number))
        const status = snap.room?.status
        if (status === 'ready' || status === 'running' || status === 'paused') {
          router.replace(`/room/${room.room_code}/auction`)
        } else if (status === 'completed') {
          router.replace(`/room/${room.room_code}/result`)
        }
      } catch {
        /* 다음 주기에 다시 확인한다 */
      }
    }
    const id = setInterval(check, 2500)
    return () => clearInterval(id)
  }, [room.room_code, router])

  // 팀장 접속 표시 유지
  useEffect(() => {
    if (identity.role !== 'team' || !identity.resolved) return
    const beat = () =>
      apiFetch(room.room_code, '/api/teams', {
        method: 'POST',
        body: JSON.stringify({ roomCode: room.room_code }),
      })
    beat()
    const id = setInterval(beat, 20000)
    return () => clearInterval(id)
  }, [identity.role, identity.resolved, room.room_code])

  const updateTeam = useCallback(
    async (teamId: string, teamName: string, captainName: string) => {
      const result = await apiFetch(room.room_code, '/api/teams', {
        method: 'PATCH',
        body: JSON.stringify({ roomCode: room.room_code, teamId, teamName, captainName }),
      })
      if (!result.ok) setToast({ kind: 'error', text: result.error ?? '수정하지 못했습니다.' })
    },
    [room.room_code]
  )

  /** 팀장 프로필 저장 — 사진과 이름. 저장된 팀 행을 곧바로 반영한다. */
  const saveProfile = useCallback(
    async (input: { captainName: string; teamName: string; avatarUrl?: string | null }) => {
      const result = await apiFetch<{ success: boolean; team?: Team }>(
        room.room_code,
        '/api/teams?action=profile',
        {
          method: 'POST',
          body: JSON.stringify({ roomCode: room.room_code, ...input }),
        }
      )
      if (!result.ok) {
        setToast({ kind: 'error', text: result.error ?? '프로필을 저장하지 못했습니다.' })
        return false
      }
      const saved = result.data?.team
      if (saved) {
        setTeams((prev) => prev.map((t) => (t.id === saved.id ? saved : t)))
      }
      setToast({ kind: 'info', text: '프로필을 저장했습니다.' })
      return true
    },
    [room.room_code]
  )

  async function toggleReady() {
    setLoading(true)
    const result = await apiFetch(room.room_code, '/api/teams', {
      method: 'PUT',
      body: JSON.stringify({ roomCode: room.room_code, ready: !ready }),
    })
    setLoading(false)
    if (!result.ok) setToast({ kind: 'error', text: result.error ?? '변경하지 못했습니다.' })
  }

  /** 운영자: 방을 열어 팀장 전원을 동시에 경매 화면으로 보낸다. */
  async function openRoom() {
    setStarting(true)
    const result = await apiFetch(room.room_code, '/api/auction?action=openRoom', {
      method: 'POST',
      body: JSON.stringify({ roomCode: room.room_code }),
    })
    setStarting(false)
    if (!result.ok) {
      setToast({ kind: 'error', text: result.error ?? '경매를 시작하지 못했습니다.' })
      return
    }
    router.replace(`/room/${room.room_code}/auction`)
  }

  const claimedTeams = teams.filter((t) => t.claimed_at)
  const readyTeams = claimedTeams.filter((t) => t.is_ready)
  const allReady = claimedTeams.length > 0 && readyTeams.length === claimedTeams.length

  const myAccent = myTeam ? accentBySlot(myTeam.slot_number) : null

  return (
    <main className="min-h-screen bg-ink-900 p-4">
      <div className="max-w-3xl mx-auto space-y-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-ink-50 truncate">{room.name}</h1>
            <p className="text-ink-400 text-sm">운영자 {room.host_name}</p>
          </div>
          <Link href="/" className="text-ink-400 hover:text-ink-100 text-sm shrink-0">
            ← 홈
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <RoomCodeCard roomCode={room.room_code} />

          <div className="panel p-4 space-y-2">
            <p className="text-sand-300 text-xs font-bold">경매 규칙</p>
            <ul className="text-xs text-ink-200 space-y-1.5">
              <li className="flex justify-between">
                <span className="text-ink-400">시작 포인트</span>
                <span className="font-mono">{room.starting_points.toLocaleString()}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-ink-400">팀당 최대 선수</span>
                <span className="font-mono">{room.max_players_per_team}명</span>
              </li>
              <li className="flex justify-between">
                <span className="text-ink-400">경매 시간</span>
                <span className="font-mono">{room.auction_duration_seconds}초</span>
              </li>
              <li className="flex justify-between">
                <span className="text-ink-400">입찰 단위</span>
                <span className="font-mono">{room.bid_increment}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-ink-400">연장</span>
                <span className="font-mono">
                  {room.extension_threshold_seconds}초 이내 → +{room.extension_seconds}초
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div>
          <h2 className="text-ink-100 font-bold mb-3 text-sm">팀 목록</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {teams.map((team) => (
              <TeamSlotCard
                key={team.id}
                team={team}
                isHost={identity.role === 'host'}
                isMe={identity.teamId === team.id}
                onUpdate={
                  identity.role === 'host' || identity.teamId === team.id ? updateTeam : undefined
                }
              />
            ))}
          </div>
        </div>

        {identity.role === 'host' && (
          <div className="panel p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sand-300 text-xs font-bold">경매 시작</span>
              <span className="text-xs text-ink-300">
                준비 완료{' '}
                <span className={allReady ? 'text-pine-300 font-bold' : 'text-ink-100 font-bold'}>
                  {readyTeams.length}
                </span>
                {' / '}
                {claimedTeams.length}팀
              </span>
            </div>

            <button
              onClick={() => (allReady ? openRoom() : setConfirmStart(true))}
              disabled={starting || claimedTeams.length === 0}
              className="btn btn-primary w-full h-14 text-base"
            >
              {starting ? '입장 중...' : '경매 시작 — 전원 경매 화면으로'}
            </button>
            <p className="text-ink-500 text-[11px] text-center">
              누르는 즉시 모든 팀장이 같은 경매 화면으로 함께 이동합니다.
            </p>

            <Link href={`/room/${room.room_code}/players`} className="btn btn-ghost w-full h-11">
              선수 명단 관리
            </Link>
          </div>
        )}

        {identity.role === 'team' && myTeam && (
          <CaptainProfileCard team={myTeam} onSave={saveProfile} />
        )}

        {identity.role === 'team' && myTeam && (
          <div className={`panel p-4 space-y-3 border ${myAccent?.border ?? 'border-ink-700'}`}>
            <button
              onClick={toggleReady}
              disabled={loading}
              className={`btn w-full h-12 ${ready ? 'btn-pine' : 'btn-ghost'}`}
            >
              {ready ? '✓ 준비 완료 (다시 눌러 취소)' : '준비 완료'}
            </button>
            <p className="text-ink-500 text-[11px] text-center leading-relaxed">
              {ready
                ? '운영자가 경매를 시작하면 자동으로 경매 화면으로 이동합니다.'
                : '준비 완료를 눌러 운영자에게 알려주세요.'}
            </p>
          </div>
        )}

        {identity.resolved && identity.role === 'team' && identity.source === 'cookie' && (
          <p className="text-[11px] text-sand-200 bg-sand-900/60 border border-sand-700 rounded-lg px-3 py-2">
            팀 정보를 브라우저 공용 쿠키에서 읽었습니다. 한 브라우저에서 여러 팀이 접속하는 경우
            받은 초대 링크를 이 탭에서 다시 열어 주세요.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmStart}
        title="아직 준비하지 않은 팀이 있습니다"
        message={`${claimedTeams.length}팀 중 ${readyTeams.length}팀만 준비 완료 상태입니다. 그래도 지금 시작할까요?`}
        confirmLabel="지금 시작"
        onConfirm={() => {
          setConfirmStart(false)
          openRoom()
        }}
        onCancel={() => setConfirmStart(false)}
      />

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </main>
  )
}
