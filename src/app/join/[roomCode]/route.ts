import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/auth/tokens'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/?error=no_token', req.url))
  }

  const tokenHash = hashToken(token)
  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('join_team', {
    p_room_code: roomCode,
    p_join_token_hash: tokenHash,
  })

  if (error || !data) {
    return NextResponse.redirect(new URL('/?error=invalid_token', req.url))
  }

  const result = data as { teamId: string; roomId: string }

  // 쿠키는 헤더 토큰을 못 쓰는 경우의 대비책일 뿐이다. 같은 브라우저에서
  // 여러 팀이 입장하면 서로 덮어쓰므로, 실제 신원은 아래 `?t=` 로 전달해
  // 각 탭의 sessionStorage에 보관시킨다.
  const jar = await cookies()
  jar.set(`team_${roomCode}`, JSON.stringify({ token, teamId: result.teamId }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })

  const target = new URL(`/room/${roomCode}/lobby`, req.url)
  target.searchParams.set('t', token)
  return NextResponse.redirect(target)
}
