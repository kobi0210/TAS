'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useServerClockMs, formatCountdown } from '@/hooks/useServerClock'
import { formatPoints } from '@/lib/auction/rules'
import { accentBySlot } from '@/lib/auction/visuals'
import { PlayerAvatar } from '@/components/auction/PlayerAvatar'
import type { AuctionRoom, Team, Player, Auction } from '@/types/database'

interface Props {
  params: Promise<{ roomCode: string }>
  searchParams: Promise<{ transparent?: string; hidePlayers?: string }>
}

/** OBS 오버레이 (1920x1080 고정, 읽기 전용) */
export default function OverlayPage({ params, searchParams }: Props) {
  const [room, setRoom] = useState<AuctionRoom | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [activeAuction, setActiveAuction] = useState<Auction | null>(null)
  const [offsetMs, setOffsetMs] = useState(0)
  const [transparent, setTransparent] = useState(false)
  const [hidePlayers, setHidePlayers] = useState(false)
  const [roomCode, setRoomCode] = useState('')

  const msLeft = useServerClockMs(
    activeAuction?.status === 'active' ? activeAuction.ends_at : null,
    offsetMs
  )

  useEffect(() => {
    Promise.all([params, searchParams]).then(([p, sp]) => {
      setRoomCode(p.roomCode)
      setTransparent(sp.transparent === 'true')
      setHidePlayers(sp.hidePlayers === 'true')
    })
  }, [params, searchParams])

  // 오버레이는 조작이 없으므로 스냅샷 폴링만으로 충분하다.
  useEffect(() => {
    if (!roomCode) return
    let stop = false

    const pull = async () => {
      try {
        const res = await fetch(`/api/room-state?roomCode=${encodeURIComponent(roomCode)}`, {
          cache: 'no-store',
        })
        if (!res.ok || stop) return
        const snap = (await res.json()) as {
          serverTime: string
          room: AuctionRoom
          teams: Team[]
          players: Player[]
          activeAuction: Auction | null
        }
        setOffsetMs(new Date(snap.serverTime).getTime() - Date.now())
        setRoom(snap.room)
        setTeams(snap.teams ?? [])
        setPlayers(snap.players ?? [])
        setActiveAuction(snap.activeAuction)
      } catch {
        /* 다음 주기에 재시도 */
      }
    }

    pull()
    const id = setInterval(pull, 2000)

    const channel = supabase
      .channel(`overlay:${roomCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions' }, pull)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, pull)
      .subscribe()

    return () => {
      stop = true
      clearInterval(id)
      supabase.removeChannel(channel)
    }
  }, [roomCode])

  const bg = transparent ? 'bg-transparent' : 'bg-ink-900'

  if (!room) return <div className={bg} style={{ width: 1920, height: 1080 }} />

  const activePlayer = activeAuction
    ? players.find((p) => p.id === activeAuction.player_id) ?? null
    : null
  const highestTeam = activeAuction?.highest_team_id
    ? teams.find((t) => t.id === activeAuction.highest_team_id) ?? null
    : null
  const seconds = msLeft / 1000
  const timerTone =
    seconds <= 5 ? 'text-mauve-300' : seconds <= 10 ? 'text-sand-300' : 'text-ink-50'

  return (
    <div className={`${bg} overflow-hidden`} style={{ width: 1920, height: 1080 }}>
      <div className="flex h-full p-10 gap-8">
        {/* 중앙 무대 */}
        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          {activePlayer ? (
            <>
              <PlayerAvatar
                player={activePlayer}
                size="lg"
                className="w-56 h-56 rounded-3xl border-4 border-ink-700"
              />

              <div className="text-center space-y-3">
                <div className="flex items-center justify-center gap-3">
                  {activePlayer.tier && (
                    <span className="text-2xl font-bold bg-iris-900 text-iris-200 px-4 py-1.5 rounded-xl">
                      {activePlayer.tier}
                    </span>
                  )}
                  {activePlayer.position && (
                    <span className="text-2xl font-bold bg-pine-900 text-pine-200 px-4 py-1.5 rounded-xl">
                      {activePlayer.position}
                    </span>
                  )}
                </div>
                <h2 className="text-7xl font-bold text-ink-50">{activePlayer.name}</h2>
                {activePlayer.nickname && (
                  <p className="text-3xl text-ink-300">{activePlayer.nickname}</p>
                )}
              </div>

              <div className="text-center">
                <div className="text-2xl tracking-[0.3em] text-ink-400 font-bold">TIME COUNT</div>
                <div className={`text-9xl font-mono font-bold tabular-nums ${timerTone}`}>
                  {activeAuction?.status === 'paused' ? '일시정지' : formatCountdown(msLeft)}
                </div>
              </div>

              <div className="text-center">
                <div className="text-2xl text-ink-400">현재 최고 입찰가</div>
                <div className="text-7xl font-mono font-bold text-sand-400 mt-2 tabular-nums">
                  {formatPoints(activeAuction?.current_bid ?? activePlayer.starting_bid)}
                </div>
                {highestTeam && (
                  <div
                    className={`text-3xl mt-3 font-bold ${
                      accentBySlot(highestTeam.slot_number).text
                    }`}
                  >
                    {highestTeam.team_name}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-5xl text-ink-600">경매 대기 중</div>
          )}
        </div>

        {/* 팀 보드 */}
        {!hidePlayers && (
          <div className="w-[420px] space-y-3 self-start pt-4">
            {teams.map((team) => {
              const sold = players.filter((p) => p.sold_team_id === team.id && p.status === 'sold')
              const isHighest = activeAuction?.highest_team_id === team.id
              const accent = accentBySlot(team.slot_number)
              return (
                <div
                  key={team.id}
                  className={`rounded-2xl p-4 border bg-ink-850 ${
                    isHighest ? accent.border : 'border-ink-700'
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-6 rounded-full ${accent.bg}`} />
                      <span className={`font-bold text-2xl ${accent.text}`}>{team.team_name}</span>
                    </div>
                    <span className="text-ink-50 font-mono text-2xl tabular-nums">
                      {formatPoints(team.remaining_points)}
                    </span>
                  </div>
                  <div className="text-ink-400 text-lg">
                    {team.captain_name} · {sold.length}/{team.max_players}명
                  </div>
                  {sold.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {sold.map((p) => (
                        <span
                          key={p.id}
                          className="text-sm bg-ink-800 text-ink-200 px-2 py-0.5 rounded-md"
                        >
                          {p.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
