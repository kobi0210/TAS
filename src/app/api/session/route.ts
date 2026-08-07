import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { resolveToken, getSession } from '@/lib/auth/permissions'

export const dynamic = 'force-dynamic'

/**
 * 이 탭의 실제 신원을 알려준다.
 *
 * 서버 컴포넌트는 쿠키만 볼 수 있어서, 같은 브라우저에서 여러 팀이 접속하면
 * 전부 마지막 팀으로 렌더된다. 클라이언트는 마운트 직후 이 엔드포인트를
 * 탭 토큰과 함께 호출해 자기 팀을 확정한다.
 */
export async function GET(req: NextRequest) {
  const roomCode = req.nextUrl.searchParams.get('roomCode')
  if (!roomCode) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const headerToken = req.headers.get('x-room-token')?.trim()
  if (headerToken) {
    const resolved = await resolveToken(roomCode, headerToken)
    if (resolved) {
      return NextResponse.json({
        role: resolved.role,
        roomCode,
        teamId: resolved.teamId ?? null,
        slotNumber: resolved.slotNumber ?? null,
        teamName: resolved.teamName ?? null,
        source: 'token',
      })
    }
    return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 401 })
  }

  const cookieSession = await getSession(roomCode)
  if (!cookieSession) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  return NextResponse.json({
    role: cookieSession.role,
    roomCode,
    teamId: cookieSession.teamId ?? null,
    slotNumber: null,
    teamName: null,
    source: 'cookie',
  })
}

/** 이 브라우저의 방 세션 쿠키를 지운다 (경매 종료 후 홈으로 나갈 때). */
export async function DELETE(req: NextRequest) {
  const roomCode = req.nextUrl.searchParams.get('roomCode')
  if (!roomCode) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const jar = await cookies()
  jar.delete(`team_${roomCode}`)
  jar.delete(`host_${roomCode}`)

  return NextResponse.json({ success: true })
}
