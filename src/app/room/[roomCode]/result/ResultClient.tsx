'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiFetch, clearRoomToken } from '@/lib/api/client'
import { useRoomIdentity } from '@/hooks/useRoomIdentity'
import { Toast, type ToastMessage } from '@/components/common/Toast'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FinalRoster } from '@/components/result/FinalRoster'
import { formatPoints } from '@/lib/auction/rules'
import { accentBySlot } from '@/lib/auction/visuals'
import type { AuctionRoom, Team, Player } from '@/types/database'
import type { RoomSession } from '@/types/auction'

interface Props {
  room: AuctionRoom
  teams: Team[]
  players: Player[]
  session: RoomSession
}

export function ResultClient({ room, teams, players, session }: Props) {
  const router = useRouter()
  const identity = useRoomIdentity(room.room_code, session)
  const [leaving, setLeaving] = useState(false)
  const [confirmReopen, setConfirmReopen] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  /** 이 방에서 나가 처음 화면으로 — 탭 토큰과 쿠키를 함께 정리한다. */
  async function goHome() {
    setLeaving(true)
    clearRoomToken(room.room_code)
    try {
      await fetch(`/api/session?roomCode=${encodeURIComponent(room.room_code)}`, {
        method: 'DELETE',
      })
    } catch {
      /* 쿠키 정리에 실패해도 홈으로는 나간다 */
    }
    router.replace('/')
  }

  /** 운영자: 같은 방을 로비 상태로 되돌려 다시 진행한다. */
  async function reopenLobby() {
    const result = await apiFetch(room.room_code, '/api/auction?action=reopenLobby', {
      method: 'POST',
      body: JSON.stringify({ roomCode: room.room_code }),
    })
    if (!result.ok) {
      setToast({ kind: 'error', text: result.error ?? '로비로 되돌리지 못했습니다.' })
      return
    }
    router.replace(`/room/${room.room_code}/lobby`)
  }

  const soldPlayers = players.filter((p) => p.status === 'sold')
  const topPlayer = soldPlayers.reduce<Player | null>(
    (max, p) => (max === null || (p.sold_price ?? 0) > (max.sold_price ?? 0) ? p : max),
    null
  )
  const topTeam = topPlayer ? teams.find((t) => t.id === topPlayer.sold_team_id) : null

  function downloadCsv() {
    const header = '팀명,팀장명,선수명,포지션,티어,낙찰가\n'
    const rows = soldPlayers
      .map((p) => {
        const team = teams.find((t) => t.id === p.sold_team_id)
        return [
          team?.team_name ?? '',
          team?.captain_name ?? '',
          p.name,
          p.position ?? '',
          p.tier ?? '',
          p.sold_price ?? 0,
        ].join(',')
      })
      .join('\n')
    // BOM을 붙여 엑셀에서 한글이 깨지지 않게 한다
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8' })
    download(blob, `${room.name}_결과.csv`)
  }

  function downloadJson() {
    const data = teams.map((t) => ({
      team: t.team_name,
      captain: t.captain_name,
      remainingPoints: t.remaining_points,
      players: soldPlayers
        .filter((p) => p.sold_team_id === t.id)
        .map((p) => ({ name: p.name, position: p.position, tier: p.tier, price: p.sold_price })),
    }))
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${room.name}_결과.json`)
  }

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="min-h-screen bg-ink-900 p-4">
      <div className="max-w-5xl mx-auto space-y-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-ink-50">최종 결과</h1>
            <p className="text-ink-400 text-sm truncate">{room.name}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={downloadCsv} className="btn btn-ghost h-9">
              CSV
            </button>
            <button onClick={downloadJson} className="btn btn-ghost h-9">
              JSON
            </button>
            {room.status !== 'completed' && (
              <Link href={`/room/${room.room_code}/auction`} className="btn btn-ghost h-9">
                경매 화면
              </Link>
            )}
            {identity.role === 'host' && (
              <button onClick={() => setConfirmReopen(true)} className="btn btn-ghost h-9">
                로비로 되돌리기
              </button>
            )}
            <button onClick={goHome} disabled={leaving} className="btn btn-primary h-9">
              {leaving ? '나가는 중...' : '처음 화면으로'}
            </button>
          </div>
        </div>

        {topPlayer && (
          <div className="panel border-sand-600 p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sand-300 text-xs font-bold">최고 낙찰</p>
              <p className="text-ink-50 text-xl font-bold mt-0.5">{topPlayer.name}</p>
              {topTeam && <p className="text-ink-300 text-sm">{topTeam.team_name}</p>}
            </div>
            <p className="text-sand-400 text-4xl font-mono font-bold tabular-nums">
              {formatPoints(topPlayer.sold_price ?? 0)}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {teams.map((team) => (
            <FinalRoster key={team.id} team={team} players={players} />
          ))}
        </div>

        <div className="panel p-5">
          <h2 className="text-ink-50 font-bold mb-3 text-sm">전체 낙찰 결과</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-400 text-xs border-b border-ink-700">
                  <th className="text-left py-2 pr-4 font-medium">순서</th>
                  <th className="text-left py-2 pr-4 font-medium">선수</th>
                  <th className="text-left py-2 pr-4 font-medium">포지션</th>
                  <th className="text-left py-2 pr-4 font-medium">티어</th>
                  <th className="text-left py-2 pr-4 font-medium">낙찰팀</th>
                  <th className="text-right py-2 font-medium">낙찰가</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const team = teams.find((t) => t.id === p.sold_team_id)
                  const accent = team ? accentBySlot(team.slot_number) : null
                  return (
                    <tr key={p.id} className="border-b border-ink-800 last:border-0">
                      <td className="py-2 pr-4 text-ink-500 font-mono">{p.auction_order}</td>
                      <td className="py-2 pr-4 text-ink-50">{p.name}</td>
                      <td className="py-2 pr-4 text-ink-300">{p.position ?? '-'}</td>
                      <td className="py-2 pr-4 text-iris-300">{p.tier ?? '-'}</td>
                      <td className="py-2 pr-4">
                        {p.status === 'sold' && team ? (
                          <span className={accent?.text ?? 'text-ink-200'}>{team.team_name}</span>
                        ) : (
                          <span className="text-ink-600">
                            {p.status === 'unsold' ? '유찰' : '미진행'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono text-sand-300 tabular-nums">
                        {p.sold_price ? formatPoints(p.sold_price) : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="pt-2 space-y-3">
          <button onClick={goHome} disabled={leaving} className="btn btn-primary w-full h-14 text-base">
            {leaving ? '나가는 중...' : '처음 화면으로 돌아가기'}
          </button>
          <p className="text-ink-500 text-[11px] text-center">
            나가기 전에 위에서 결과를 CSV 또는 JSON으로 내려받을 수 있습니다.
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReopen}
        title="로비로 되돌리기"
        message="이 방을 다시 로비 상태로 만듭니다. 낙찰 결과는 그대로 남고, 팀들의 준비 상태만 초기화됩니다."
        confirmLabel="되돌리기"
        onConfirm={() => {
          setConfirmReopen(false)
          reopenLobby()
        }}
        onCancel={() => setConfirmReopen(false)}
      />

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </main>
  )
}
