import { getSession, resolveToken } from '@/lib/auth/permissions'
import type { RoomSession } from '@/types/auction'

/**
 * 서버 컴포넌트에서 쓰는 세션 조회.
 *
 * 쿠키가 없거나 다른 팀 것으로 덮어써졌더라도, 주소의 `?t=` 토큰이 유효하면
 * 그 토큰을 신원으로 삼는다. 클라이언트는 마운트 직후 같은 토큰을
 * sessionStorage(탭 단위)에 넣어 이후 요청에 계속 실어 보낸다.
 */
export async function getPageSession(
  roomCode: string,
  searchParams?: { t?: string | string[] }
): Promise<RoomSession | null> {
  const raw = searchParams?.t
  const token = Array.isArray(raw) ? raw[0] : raw

  if (token) {
    const resolved = await resolveToken(roomCode, token)
    if (resolved) {
      return {
        role: resolved.role,
        roomCode,
        token,
        teamId: resolved.teamId,
      }
    }
  }

  return getSession(roomCode)
}
