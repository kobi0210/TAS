import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/auth/tokens'
import { resolveSession } from '@/lib/auth/permissions'
import { isStorableAvatar, AVATAR_MAX_CHARS } from '@/lib/utils/image'

export const dynamic = 'force-dynamic'

const bad = (code: string, status = 400) => NextResponse.json({ error: code }, { status })

const profileSchema = z.object({
  roomCode: z.string(),
  teamId: z.string().uuid().optional(),
  captainName: z.string().min(1).max(20),
  teamName: z.string().min(1).max(20).optional(),
  /** 우리 화면에서 만든 data URI 만 받는다. null 이면 사진을 지운다. */
  avatarUrl: z.string().max(AVATAR_MAX_CHARS).nullable().optional(),
})

/** 팀장 프로필 — 사진과 이름. 로비에서 경매에 들어가기 전에 정한다. */
async function saveProfile(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = profileSchema.safeParse(body)
  if (!parsed.success) return bad('INVALID_INPUT')

  const { roomCode, teamId, captainName, teamName, avatarUrl } = parsed.data
  const session = await resolveSession(req, roomCode)
  if (!session) return bad('UNAUTHORIZED', 401)

  if (typeof avatarUrl === 'string' && !isStorableAvatar(avatarUrl)) {
    return bad('INVALID_AVATAR')
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('update_captain_profile', {
    p_room_code: roomCode,
    p_token_hash: hashToken(session.token),
    p_is_host: session.role === 'host',
    p_team_id: teamId ?? null,
    p_captain_name: captainName,
    p_team_name: teamName ?? null,
    p_avatar_url: typeof avatarUrl === 'string' ? avatarUrl : null,
    p_clear_avatar: avatarUrl === null,
  })

  if (error) return bad(error.message)
  const result = data as { success: boolean; code?: string } | null
  if (!result?.success) return bad(result?.code ?? 'INTERNAL_ERROR')
  return NextResponse.json(result)
}

const updateSchema = z.object({
  roomCode: z.string(),
  teamId: z.string().uuid(),
  teamName: z.string().min(1).max(20),
  captainName: z.string().min(1).max(20),
})

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return bad('INVALID_INPUT')

  const { roomCode, teamId, teamName, captainName } = parsed.data
  const session = await resolveSession(req, roomCode)
  if (!session) return bad('UNAUTHORIZED', 401)

  const supabase = createAdminClient()

  const { error } = await supabase.rpc('update_team_info', {
    p_room_code: roomCode,
    p_token_hash: hashToken(session.token),
    p_is_host: session.role === 'host',
    p_team_id: teamId,
    p_team_name: teamName,
    p_captain_name: captainName,
  })

  if (error) return bad(error.message)
  return NextResponse.json({ success: true })
}

const readySchema = z.object({
  roomCode: z.string(),
  ready: z.boolean(),
})

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = readySchema.safeParse(body)
  if (!parsed.success) return bad('INVALID_INPUT')

  const { roomCode, ready } = parsed.data
  const session = await resolveSession(req, roomCode)
  if (!session || session.role !== 'team') return bad('UNAUTHORIZED', 401)

  const supabase = createAdminClient()
  const { error } = await supabase.rpc('set_team_ready', {
    p_room_code: roomCode,
    p_join_token_hash: hashToken(session.token),
    p_ready: ready,
  })

  if (error) return bad(error.message)
  return NextResponse.json({ success: true })
}

/**
 * `?action=profile` 이면 프로필 저장, 아니면 접속 유지 신호.
 * 접속 유지 신호는 팀 카드의 접속 표시를 살아 있게 한다.
 */
export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('action') === 'profile') return saveProfile(req)

  const body = await req.json().catch(() => null)
  const parsed = z.object({ roomCode: z.string() }).safeParse(body)
  if (!parsed.success) return bad('INVALID_INPUT')

  const session = await resolveSession(req, parsed.data.roomCode)
  if (!session || session.role !== 'team') return bad('UNAUTHORIZED', 401)

  const supabase = createAdminClient()
  const { error } = await supabase.rpc('team_heartbeat', {
    p_room_code: parsed.data.roomCode,
    p_join_token_hash: hashToken(session.token),
  })

  if (error) return bad(error.message)
  return NextResponse.json({ success: true })
}
