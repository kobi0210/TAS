import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/auth/tokens'
import type { RoomSession } from '@/types/auction'

const HOST_COOKIE = (code: string) => `host_${code}`
const TEAM_COOKIE = (code: string) => `team_${code}`

/** 탭이 보낸 토큰을 담는 헤더. 쿠키보다 우선한다. */
export const ROOM_TOKEN_HEADER = 'x-room-token'

/**
 * 쿠키 기반 세션.
 *
 * 쿠키는 브라우저 프로필 단위라 시크릿 탭끼리도 공유된다. 팀장 여러 명이
 * 같은 브라우저에서 각자 초대 링크로 들어오면 마지막에 들어온 팀이 앞선 팀의
 * 쿠키를 덮어써 모두 같은 팀으로 인식된다. 그래서 이 값은 어디까지나
 * "탭 토큰이 없을 때의 대비책"으로만 쓰고, 실제 신원은 resolveSession()이
 * 헤더 토큰으로 확정한다.
 */
export async function getSession(roomCode: string): Promise<RoomSession | null> {
  const jar = await cookies()
  const hostToken = jar.get(HOST_COOKIE(roomCode))?.value
  if (hostToken) return { role: 'host', roomCode, token: hostToken }
  const raw = jar.get(TEAM_COOKIE(roomCode))?.value
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { token: string; teamId: string }
      return { role: 'team', roomCode, token: parsed.token, teamId: parsed.teamId }
    } catch {
      return null
    }
  }
  return null
}

interface ResolvedToken {
  role: 'host' | 'team'
  roomId: string
  teamId?: string
  slotNumber?: number
  teamName?: string
  captainName?: string
}

// 요청마다 토큰을 DB에 조회하면 운영자 버튼 반응이 느려지므로 짧게 캐시한다.
const TOKEN_CACHE_TTL_MS = 60_000
const tokenCache = new Map<string, { at: number; value: ResolvedToken | null }>()

function cacheGet(key: string): ResolvedToken | null | undefined {
  const hit = tokenCache.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > TOKEN_CACHE_TTL_MS) {
    tokenCache.delete(key)
    return undefined
  }
  return hit.value
}

function cacheSet(key: string, value: ResolvedToken | null) {
  if (tokenCache.size > 500) tokenCache.clear()
  tokenCache.set(key, { at: Date.now(), value })
}

/** 토큰 원문으로 역할/팀을 조회한다. */
export async function resolveToken(
  roomCode: string,
  token: string
): Promise<ResolvedToken | null> {
  const tokenHash = hashToken(token)
  const key = `${roomCode}:${tokenHash}`
  const cached = cacheGet(key)
  if (cached !== undefined) return cached

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('resolve_room_token', {
    p_room_code: roomCode,
    p_token_hash: tokenHash,
  })

  const value = error || !data ? null : (data as ResolvedToken)
  cacheSet(key, value)
  return value
}

/**
 * 요청의 실제 신원을 확정한다.
 *
 * 1순위: 탭이 sessionStorage에 보관해 헤더로 보낸 토큰 (탭마다 독립)
 * 2순위: 쿠키 (링크를 그냥 열었거나 헤더를 못 보내는 경우)
 */
export async function resolveSession(
  req: Request,
  roomCode: string
): Promise<RoomSession | null> {
  const headerToken = req.headers.get(ROOM_TOKEN_HEADER)?.trim()
  if (headerToken) {
    const resolved = await resolveToken(roomCode, headerToken)
    if (resolved) {
      return {
        role: resolved.role,
        roomCode,
        token: headerToken,
        teamId: resolved.teamId,
      }
    }
  }
  return getSession(roomCode)
}

export async function setHostSession(roomCode: string, token: string) {
  const jar = await cookies()
  jar.set(HOST_COOKIE(roomCode), token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export async function setTeamSession(roomCode: string, token: string, teamId: string) {
  const jar = await cookies()
  jar.set(TEAM_COOKIE(roomCode), JSON.stringify({ token, teamId }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}
