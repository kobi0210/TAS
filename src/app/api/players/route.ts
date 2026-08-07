import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/auth/tokens'
import { resolveSession } from '@/lib/auth/permissions'

export const dynamic = 'force-dynamic'

const bad = (code: string, status = 400) => NextResponse.json({ error: code }, { status })

const upsertSchema = z.object({
  roomCode: z.string(),
  playerId: z.string().uuid().optional(),
  name: z.string().min(1).max(30),
  nickname: z.string().max(20).optional(),
  position: z.string().max(20).optional(),
  tier: z.string().max(20).optional(),
  description: z.string().max(200).optional(),
  imageUrl: z.string().max(500).optional(),
  startingBid: z.number().int().min(1),
})

const importSchema = z.object({
  roomCode: z.string(),
  players: z
    .array(
      z.object({
        name: z.string().min(1).max(30),
        nickname: z.string().max(20).optional(),
        position: z.string().max(20).optional(),
        tier: z.string().max(20).optional(),
        description: z.string().max(200).optional(),
        imageUrl: z.string().max(500).optional(),
        startingBid: z.number().int().min(1),
      })
    )
    .min(1)
    .max(200),
})

/** 선수 목록 조회 — 등록/수정 후 화면 갱신에 쓴다. */
export async function GET(req: NextRequest) {
  const roomCode = req.nextUrl.searchParams.get('roomCode')
  if (!roomCode) return bad('INVALID_INPUT')

  const session = await resolveSession(req, roomCode)
  if (!session) return bad('UNAUTHORIZED', 401)

  const supabase = createAdminClient()
  const { data: room } = await supabase
    .from('auction_rooms')
    .select('id')
    .eq('room_code', roomCode)
    .single()
  if (!room) return bad('ROOM_NOT_FOUND', 404)

  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', room.id)
    .order('auction_order')

  if (error) return bad(error.message)
  return NextResponse.json({ players: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const mode = req.nextUrl.searchParams.get('action')

  // CSV 일괄 등록: 한 번의 요청 + 한 트랜잭션으로 처리한다.
  if (mode === 'import') {
    const parsed = importSchema.safeParse(body)
    if (!parsed.success) return bad('INVALID_INPUT')
    const { roomCode, players } = parsed.data
    const session = await resolveSession(req, roomCode)
    if (!session || session.role !== 'host') return bad('UNAUTHORIZED', 401)

    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('import_players', {
      p_room_code: roomCode,
      p_host_token_hash: hashToken(session.token),
      p_players: players,
    })
    if (error) return bad(error.message)
    return NextResponse.json(data)
  }

  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) return bad('INVALID_INPUT')

  const { roomCode, playerId, ...rest } = parsed.data
  const session = await resolveSession(req, roomCode)
  if (!session || session.role !== 'host') return bad('UNAUTHORIZED', 401)

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('upsert_player', {
    p_room_code: roomCode,
    p_host_token_hash: hashToken(session.token),
    p_player_id: playerId ?? null,
    p_name: rest.name,
    p_nickname: rest.nickname || null,
    p_position: rest.position || null,
    p_tier: rest.tier || null,
    p_description: rest.description || null,
    p_image_url: rest.imageUrl || null,
    p_starting_bid: rest.startingBid,
  })

  if (error) return bad(error.message)
  return NextResponse.json(data)
}

const deleteSchema = z.object({
  roomCode: z.string(),
  playerId: z.string().uuid(),
})

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) return bad('INVALID_INPUT')

  const { roomCode, playerId } = parsed.data
  const session = await resolveSession(req, roomCode)
  if (!session || session.role !== 'host') return bad('UNAUTHORIZED', 401)

  const supabase = createAdminClient()
  const { error } = await supabase.rpc('delete_player', {
    p_room_code: roomCode,
    p_host_token_hash: hashToken(session.token),
    p_player_id: playerId,
  })

  if (error) return bad(error.message)
  return NextResponse.json({ success: true })
}
