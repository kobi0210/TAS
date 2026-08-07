import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { generateToken, hashToken } from '@/lib/auth/tokens'
import { setTeamSession } from '@/lib/auth/permissions'

export const dynamic = 'force-dynamic'

const bad = (code: string, status = 400) => NextResponse.json({ error: code }, { status })

const schema = z.object({
  roomCode: z.string().min(4).max(8),
  captainName: z.string().max(20).optional(),
  teamName: z.string().max(20).optional(),
})

/** 방 코드로 입장 가능한지 미리 확인한다 (남은 슬롯 수 안내용). */
export async function GET(req: NextRequest) {
  const roomCode = req.nextUrl.searchParams.get('roomCode')?.trim().toUpperCase()
  if (!roomCode) return bad('INVALID_INPUT')

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_room_join_info', { p_room_code: roomCode })
  if (error) return bad(error.message)
  return NextResponse.json(data)
}

/**
 * 방 코드로 입장.
 *
 * 초대 링크 없이 코드만 아는 사람이 들어오면, 아직 주인이 없는 팀 슬롯 중
 * 가장 앞 번호를 차지한다. 슬롯 선점은 DB에서 행 잠금으로 처리하므로
 * 여러 명이 동시에 눌러도 같은 팀에 두 명이 배정되지 않는다.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return bad('INVALID_INPUT')

  const roomCode = parsed.data.roomCode.trim().toUpperCase()
  const token = generateToken()

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('claim_team_slot', {
    p_room_code: roomCode,
    p_join_token_hash: hashToken(token),
    p_captain_name: parsed.data.captainName ?? null,
    p_team_name: parsed.data.teamName ?? null,
  })

  if (error) return bad(error.message)

  const result = data as {
    success: boolean
    code?: string
    teamId?: string
    slotNumber?: number
    teamName?: string
    captainName?: string
  }
  if (!result?.success) return NextResponse.json(result ?? { error: 'INTERNAL_ERROR' }, { status: 400 })

  // 쿠키는 대비책. 실제 신원은 클라이언트가 이 토큰을 탭에 보관해 헤더로 보낸다.
  await setTeamSession(roomCode, token, result.teamId!)

  return NextResponse.json({
    success: true,
    roomCode,
    token,
    teamId: result.teamId,
    slotNumber: result.slotNumber,
    teamName: result.teamName,
    captainName: result.captainName,
  })
}
