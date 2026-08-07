'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { PlayerForm } from '@/components/players/PlayerForm'
import { PlayerTable } from '@/components/players/PlayerTable'
import { CsvImportDialog } from '@/components/players/CsvImportDialog'
import { Toast, type ToastMessage } from '@/components/common/Toast'
import type { AuctionRoom, Player } from '@/types/database'

interface Props {
  room: AuctionRoom
  initialPlayers: Player[]
}

interface PlayerInput {
  name: string
  nickname: string
  position: string
  tier: string
  description: string
  imageUrl: string
  startingBid: number
}

export function PlayersClient({ room, initialPlayers }: Props) {
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [showCsv, setShowCsv] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const roomCode = room.room_code

  const reload = useCallback(async () => {
    const result = await apiFetch<{ players: Player[] }>(
      roomCode,
      `/api/players?roomCode=${encodeURIComponent(roomCode)}`
    )
    if (result.ok && result.data?.players) setPlayers(result.data.players)
  }, [roomCode])

  async function addPlayer(data: PlayerInput) {
    const result = await apiFetch(roomCode, '/api/players', {
      method: 'POST',
      body: JSON.stringify({ roomCode, ...data }),
    })
    if (!result.ok) {
      setToast({ kind: 'error', text: result.error ?? '등록하지 못했습니다.' })
      return
    }
    await reload()
  }

  async function updatePlayer(player: Player, data: PlayerInput) {
    const result = await apiFetch(roomCode, '/api/players', {
      method: 'POST',
      body: JSON.stringify({ roomCode, playerId: player.id, ...data }),
    })
    if (!result.ok) {
      setToast({ kind: 'error', text: result.error ?? '수정하지 못했습니다.' })
      return
    }
    await reload()
  }

  async function deletePlayer(playerId: string) {
    const result = await apiFetch(roomCode, '/api/players', {
      method: 'DELETE',
      body: JSON.stringify({ roomCode, playerId }),
    })
    if (!result.ok) {
      setToast({ kind: 'error', text: result.error ?? '삭제하지 못했습니다.' })
      return
    }
    await reload()
  }

  async function resetPlayer(playerId: string) {
    const result = await apiFetch(roomCode, '/api/auction?action=resetPlayer', {
      method: 'POST',
      body: JSON.stringify({ roomCode, playerId }),
    })
    if (!result.ok) {
      setToast({ kind: 'error', text: result.error ?? '초기화하지 못했습니다.' })
      return
    }
    await reload()
  }

  /** CSV는 한 번의 요청으로 통째로 등록한다 (행마다 왕복하지 않는다). */
  async function importCsv(rows: PlayerInput[]) {
    const result = await apiFetch<{ inserted?: number }>(roomCode, '/api/players?action=import', {
      method: 'POST',
      body: JSON.stringify({ roomCode, players: rows }),
    })
    if (result.ok) {
      await reload()
      setToast({ kind: 'info', text: `${result.data?.inserted ?? rows.length}명을 등록했습니다.` })
    }
    return { ok: result.ok, error: result.error, inserted: result.data?.inserted }
  }

  return (
    <main className="min-h-screen bg-ink-900 p-4">
      <div className="max-w-3xl mx-auto space-y-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-ink-50">선수 관리</h1>
            <p className="text-ink-400 text-sm truncate">{room.name}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setShowCsv(true)} className="btn btn-ghost h-9">
              CSV 등록
            </button>
            <Link href={`/room/${roomCode}/lobby`} className="btn btn-ghost h-9">
              로비
            </Link>
            <Link href={`/room/${roomCode}/auction`} className="btn btn-primary h-9">
              경매 화면
            </Link>
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="text-ink-50 font-bold mb-4 text-sm">선수 추가</h2>
          <PlayerForm defaultBid={room.default_starting_bid} onSubmit={addPlayer} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-ink-50 font-bold text-sm">선수 목록 ({players.length}명)</h2>
            <p className="text-ink-500 text-xs">
              경매 시작 시 순번은 무작위로 다시 섞을 수 있습니다.
            </p>
          </div>
          <PlayerTable
            players={players}
            defaultBid={room.default_starting_bid}
            onUpdate={updatePlayer}
            onDelete={deletePlayer}
            onReset={resetPlayer}
          />
        </div>
      </div>

      {showCsv && (
        <CsvImportDialog
          defaultBid={room.default_starting_bid}
          onImport={importCsv}
          onClose={() => setShowCsv(false)}
        />
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </main>
  )
}
