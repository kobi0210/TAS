'use client'

import { useEffect, useState } from 'react'
import { captureTokenFromUrl, getRoomToken, ROOM_TOKEN_HEADER } from '@/lib/api/client'
import type { RoomSession } from '@/types/auction'

export interface RoomIdentity extends RoomSession {
  /** token(탭 전용) 으로 확정됐는지, cookie(브라우저 공용) 로 추정한 값인지 */
  source: 'token' | 'cookie'
  resolved: boolean
}

/**
 * 이 탭의 신원을 확정한다.
 *
 * 서버 컴포넌트는 쿠키만 볼 수 있는데, 쿠키는 브라우저 프로필 하나에 하나뿐이라
 * 시크릿 탭을 여러 개 띄워 팀장 4명이 각자 입장하면 전부 마지막 팀으로 렌더된다.
 * 그래서 초대 링크의 토큰을 탭 단위 저장소(sessionStorage)에 넣고, 그 토큰으로
 * 서버에 다시 물어 실제 팀을 확정한다.
 */
export function useRoomIdentity(roomCode: string, fallback: RoomSession): RoomIdentity {
  const [identity, setIdentity] = useState<RoomIdentity>({
    ...fallback,
    source: 'cookie',
    resolved: false,
  })

  useEffect(() => {
    let cancelled = false

    const token = captureTokenFromUrl(roomCode) ?? getRoomToken(roomCode)

    async function resolve() {
      const headers: HeadersInit = token ? { [ROOM_TOKEN_HEADER]: token } : {}
      try {
        const res = await fetch(`/api/session?roomCode=${encodeURIComponent(roomCode)}`, {
          headers,
          cache: 'no-store',
        })
        if (!res.ok) {
          if (!cancelled) setIdentity({ ...fallback, source: 'cookie', resolved: true })
          return
        }
        const data = (await res.json()) as {
          role: 'host' | 'team'
          teamId: string | null
          source: 'token' | 'cookie'
        }
        if (cancelled) return
        setIdentity({
          role: data.role,
          roomCode,
          token: token ?? fallback.token,
          teamId: data.teamId ?? undefined,
          source: data.source,
          resolved: true,
        })
      } catch {
        if (!cancelled) setIdentity({ ...fallback, source: 'cookie', resolved: true })
      }
    }

    resolve()
    return () => {
      cancelled = true
    }
    // fallback은 서버 렌더 시점 값이라 roomCode가 같으면 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode])

  return identity
}
