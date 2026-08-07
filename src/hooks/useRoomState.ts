'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { AuctionRoom, Team, Player, Auction, Bid } from '@/types/database'

export interface RoomSnapshot {
  room: AuctionRoom
  teams: Team[]
  players: Player[]
  activeAuction: Auction | null
  recentBids: Bid[]
}

interface Options {
  /** 브로드캐스트가 유실돼도 화면이 멈추지 않도록 주기적으로 맞춘다 (ms) */
  pollIntervalMs?: number
  /** 낙찰/유찰 결과를 화면에 붙잡아 두는 시간 (ms) */
  settledHoldMs?: number
}

const SETTLED = ['sold', 'unsold', 'cancelled']

function sortTeams(list: Team[]) {
  return [...list].sort((a, b) => a.slot_number - b.slot_number)
}
function sortPlayers(list: Player[]) {
  return [...list].sort((a, b) => a.auction_order - b.auction_order)
}

/**
 * 방 상태 구독.
 *
 * Realtime(postgres_changes)만 믿으면 이벤트가 늦거나 유실될 때 운영자 조작이
 * "먹통"처럼 보인다. 그래서 세 갈래로 상태를 맞춘다.
 *   1. Realtime 이벤트 (DELETE 포함 — 경매 취소가 즉시 반영되도록)
 *   2. 주기 폴링 + 탭 복귀/온라인 복귀 시 즉시 동기화
 *   3. 조작 API가 돌려준 결과를 곧바로 반영 (apply*)
 */
export function useRoomState(initial: RoomSnapshot, options: Options = {}) {
  const { pollIntervalMs = 4000, settledHoldMs = 4000 } = options

  const [room, setRoom] = useState<AuctionRoom>(initial.room)
  const [teams, setTeams] = useState<Team[]>(sortTeams(initial.teams))
  const [players, setPlayers] = useState<Player[]>(sortPlayers(initial.players))
  const [activeAuction, setActiveAuction] = useState<Auction | null>(initial.activeAuction)
  const [recentBids, setRecentBids] = useState<Bid[]>(initial.recentBids)
  const [connected, setConnected] = useState(false)
  const [serverOffsetMs, setServerOffsetMs] = useState(0)

  const roomCode = initial.room.room_code
  const roomId = initial.room.id

  // 낙관적 반영과 폴링 응답이 엇갈려 옛 상태로 되돌아가지 않도록,
  // 마지막으로 반영한 경매의 갱신 시각을 기억한다.
  const auctionStampRef = useRef(0)
  // 낙찰/유찰 결과는 스냅샷에서 곧바로 사라진다(진행 중인 경매만 담기므로).
  // 화면에서 "낙찰!"이 한 프레임 만에 없어지지 않도록 잠시 붙잡아 둔다.
  const holdUntilRef = useRef(0)

  const stampOf = (a: Auction | null) =>
    a ? new Date(a.updated_at ?? a.created_at).getTime() : 0

  const applyAuction = useCallback(
    (next: Auction | null, force = false) => {
      const stamp = stampOf(next)
      if (!force && next && stamp < auctionStampRef.current) return
      auctionStampRef.current = next ? stamp : 0
      holdUntilRef.current =
        next && SETTLED.includes(next.status) ? Date.now() + settledHoldMs : 0
      setActiveAuction(next)
    },
    [settledHoldMs]
  )

  /**
   * 조작 API가 돌려준 경매 행을 즉시 반영한다.
   * 낙찰/유찰 결과도 그대로 반영해 "낙찰!" 화면이 바로 뜨게 하고,
   * 실제 정리는 다음 폴링/브로드캐스트가 맡는다.
   */
  const applyAuctionResult = useCallback(
    (payload: unknown) => {
      const auction = (payload as { auction?: Auction } | null)?.auction
      if (auction?.id) applyAuction(auction, true)
    },
    [applyAuction]
  )

  const clearAuction = useCallback(() => {
    auctionStampRef.current = 0
    setActiveAuction(null)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/room-state?roomCode=${encodeURIComponent(roomCode)}`, {
        cache: 'no-store',
      })
      if (!res.ok) return
      const snap = (await res.json()) as {
        serverTime: string
        room: AuctionRoom
        teams: Team[]
        players: Player[]
        activeAuction: Auction | null
        recentBids: Bid[]
      }
      setServerOffsetMs(new Date(snap.serverTime).getTime() - Date.now())
      setRoom(snap.room)
      setTeams(sortTeams(snap.teams ?? []))
      setPlayers(sortPlayers(snap.players ?? []))
      setRecentBids(snap.recentBids ?? [])

      const next = snap.activeAuction
      const nextStamp = stampOf(next)

      if (!next) {
        // 방금 확정된 결과를 보여주는 중이면 잠시 그대로 둔다
        if (Date.now() < holdUntilRef.current) return
        auctionStampRef.current = 0
        setActiveAuction(null)
        return
      }
      if (nextStamp >= auctionStampRef.current) {
        auctionStampRef.current = nextStamp
        holdUntilRef.current = 0
        setActiveAuction(next)
      }
    } catch {
      /* 다음 주기에 다시 시도한다 */
    }
  }, [roomCode])

  // --- Realtime ------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'auction_rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.new && Object.keys(payload.new).length) setRoom(payload.new as AuctionRoom)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const t = payload.new as Team
          if (!t?.id) return
          setTeams((prev) =>
            sortTeams(prev.some((x) => x.id === t.id) ? prev.map((x) => (x.id === t.id ? t : x)) : [...prev, t])
          )
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as Player
            if (old?.id) setPlayers((prev) => prev.filter((p) => p.id !== old.id))
            return
          }
          const p = payload.new as Player
          if (!p?.id) return
          setPlayers((prev) =>
            sortPlayers(prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p])
          )
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'auctions', filter: `room_id=eq.${roomId}` },
        (payload) => {
          // 경매 취소는 행을 삭제한다. replica identity full 덕분에 old로 식별 가능.
          if (payload.eventType === 'DELETE') {
            const old = payload.old as Auction
            setActiveAuction((prev) => {
              if (prev && old?.id && prev.id !== old.id) return prev
              auctionStampRef.current = 0
              return null
            })
            return
          }
          const a = payload.new as Auction
          if (!a?.id) return
          applyAuction(a)
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const b = payload.new as Bid
          if (!b?.id) return
          setRecentBids((prev) => [b, ...prev.filter((x) => x.id !== b.id)].slice(0, 20))
        }
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
        if (status === 'SUBSCRIBED') refresh()
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, refresh, applyAuction])

  // --- 폴링 보정 -----------------------------------------------------------
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, pollIntervalMs)

    const onWake = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('online', refresh)
    window.addEventListener('focus', refresh)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('online', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh, pollIntervalMs])

  return {
    room,
    teams,
    players,
    activeAuction,
    recentBids,
    connected,
    serverOffsetMs,
    refresh,
    applyAuctionResult,
    clearAuction,
    setRoom,
  }
}
