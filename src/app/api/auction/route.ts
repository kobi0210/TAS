import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/auth/tokens'
import { resolveSession } from '@/lib/auth/permissions'
import type { RoomSession } from '@/types/auction'

export const dynamic = 'force-dynamic'

const startSchema = z.object({
  roomCode: z.string(),
  playerId: z.string().uuid(),
})

const bidSchema = z.object({
  roomCode: z.string(),
  auctionId: z.string().uuid(),
  amount: z.number().int().min(1),
})

const finalizeSchema = z.object({
  roomCode: z.string(),
  auctionId: z.string().uuid(),
  force: z.boolean().optional(),
})

const controlSchema = z.object({
  roomCode: z.string(),
  auctionId: z.string().uuid(),
  action: z.enum(['pause', 'resume', 'cancel']),
})

const roomOnlySchema = z.object({ roomCode: z.string() })

const resetPlayerSchema = z.object({
  roomCode: z.string(),
  playerId: z.string().uuid(),
})

const autoSchema = z.object({
  roomCode: z.string(),
  enabled: z.boolean(),
  delaySeconds: z.number().int().min(0).max(60).optional(),
})

const bad = (code: string, status = 400) => NextResponse.json({ error: code }, { status })

/** 운영자 권한을 확인하고 세션을 돌려준다. */
async function requireHost(req: NextRequest, roomCode: string): Promise<RoomSession | null> {
  const session = await resolveSession(req, roomCode)
  return session && session.role === 'host' ? session : null
}

export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')
  const body = await req.json().catch(() => null)
  const supabase = createAdminClient()

  switch (action) {
    case 'start': {
      const parsed = startSchema.safeParse(body)
      if (!parsed.success) return bad('INVALID_INPUT')
      const { roomCode, playerId } = parsed.data
      const session = await requireHost(req, roomCode)
      if (!session) return bad('UNAUTHORIZED', 401)
      const { data, error } = await supabase.rpc('start_player_auction', {
        p_room_code: roomCode,
        p_host_token_hash: hashToken(session.token),
        p_player_id: playerId,
      })
      if (error) return bad(error.message)
      return NextResponse.json(data)
    }

    case 'startNext': {
      const parsed = roomOnlySchema.safeParse(body)
      if (!parsed.success) return bad('INVALID_INPUT')
      const { roomCode } = parsed.data
      const session = await requireHost(req, roomCode)
      if (!session) return bad('UNAUTHORIZED', 401)
      const { data, error } = await supabase.rpc('start_next_auction', {
        p_room_code: roomCode,
        p_host_token_hash: hashToken(session.token),
      })
      if (error) return bad(error.message)
      return NextResponse.json(data)
    }

    case 'shuffle': {
      const parsed = roomOnlySchema.safeParse(body)
      if (!parsed.success) return bad('INVALID_INPUT')
      const { roomCode } = parsed.data
      const session = await requireHost(req, roomCode)
      if (!session) return bad('UNAUTHORIZED', 401)
      const { data, error } = await supabase.rpc('shuffle_pending_players', {
        p_room_code: roomCode,
        p_host_token_hash: hashToken(session.token),
      })
      if (error) return bad(error.message)
      return NextResponse.json(data)
    }

    case 'auto': {
      const parsed = autoSchema.safeParse(body)
      if (!parsed.success) return bad('INVALID_INPUT')
      const { roomCode, enabled, delaySeconds } = parsed.data
      const session = await requireHost(req, roomCode)
      if (!session) return bad('UNAUTHORIZED', 401)
      const { data, error } = await supabase.rpc('set_auto_advance', {
        p_room_code: roomCode,
        p_host_token_hash: hashToken(session.token),
        p_enabled: enabled,
        p_delay_seconds: delaySeconds ?? null,
      })
      if (error) return bad(error.message)
      return NextResponse.json(data)
    }

    case 'bid': {
      const parsed = bidSchema.safeParse(body)
      if (!parsed.success) return bad('INVALID_INPUT')
      const { roomCode, auctionId, amount } = parsed.data
      const session = await resolveSession(req, roomCode)
      if (!session || session.role !== 'team') return bad('UNAUTHORIZED', 401)
      const { data, error } = await supabase.rpc('place_bid', {
        p_room_code: roomCode,
        p_join_token_hash: hashToken(session.token),
        p_auction_id: auctionId,
        p_amount: amount,
      })
      if (error) return bad(error.message)
      return NextResponse.json(data)
    }

    case 'finalize': {
      const parsed = finalizeSchema.safeParse(body)
      if (!parsed.success) return bad('INVALID_INPUT')
      const { roomCode, auctionId, force } = parsed.data
      const session = await resolveSession(req, roomCode)
      if (!session) return bad('UNAUTHORIZED', 401)
      if (force && session.role !== 'host') return bad('UNAUTHORIZED', 401)
      const { data, error } = await supabase.rpc('finalize_auction', {
        p_room_code: roomCode,
        p_auction_id: auctionId,
        p_host_token_hash: force ? hashToken(session.token) : null,
        p_force: force ?? false,
      })
      if (error) return bad(error.message)
      return NextResponse.json(data)
    }

    case 'control': {
      const parsed = controlSchema.safeParse(body)
      if (!parsed.success) return bad('INVALID_INPUT')
      const { roomCode, auctionId, action: ctrl } = parsed.data
      const session = await requireHost(req, roomCode)
      if (!session) return bad('UNAUTHORIZED', 401)
      const fnName =
        ctrl === 'pause' ? 'pause_auction' : ctrl === 'resume' ? 'resume_auction' : 'cancel_auction'
      const { data, error } = await supabase.rpc(fnName as 'pause_auction', {
        p_room_code: roomCode,
        p_host_token_hash: hashToken(session.token),
        p_auction_id: auctionId,
      })
      if (error) return bad(error.message)
      return NextResponse.json(data)
    }

    case 'resetPlayer': {
      const parsed = resetPlayerSchema.safeParse(body)
      if (!parsed.success) return bad('INVALID_INPUT')
      const { roomCode, playerId } = parsed.data
      const session = await requireHost(req, roomCode)
      if (!session) return bad('UNAUTHORIZED', 401)
      const { data, error } = await supabase.rpc('reset_player', {
        p_room_code: roomCode,
        p_host_token_hash: hashToken(session.token),
        p_player_id: playerId,
      })
      if (error) return bad(error.message)
      return NextResponse.json(data)
    }

    case 'requeueUnsold': {
      const parsed = roomOnlySchema.safeParse(body)
      if (!parsed.success) return bad('INVALID_INPUT')
      const { roomCode } = parsed.data
      const session = await requireHost(req, roomCode)
      if (!session) return bad('UNAUTHORIZED', 401)
      const { data, error } = await supabase.rpc('requeue_unsold_players', {
        p_room_code: roomCode,
        p_host_token_hash: hashToken(session.token),
      })
      if (error) return bad(error.message)
      return NextResponse.json(data)
    }

    case 'openRoom': {
      const parsed = roomOnlySchema.safeParse(body)
      if (!parsed.success) return bad('INVALID_INPUT')
      const { roomCode } = parsed.data
      const session = await requireHost(req, roomCode)
      if (!session) return bad('UNAUTHORIZED', 401)
      const { data, error } = await supabase.rpc('open_auction_room', {
        p_room_code: roomCode,
        p_host_token_hash: hashToken(session.token),
      })
      if (error) return bad(error.message)
      return NextResponse.json(data)
    }

    case 'reopenLobby': {
      const parsed = roomOnlySchema.safeParse(body)
      if (!parsed.success) return bad('INVALID_INPUT')
      const { roomCode } = parsed.data
      const session = await requireHost(req, roomCode)
      if (!session) return bad('UNAUTHORIZED', 401)
      const { data, error } = await supabase.rpc('reopen_lobby', {
        p_room_code: roomCode,
        p_host_token_hash: hashToken(session.token),
      })
      if (error) return bad(error.message)
      return NextResponse.json(data)
    }

    case 'completeRoom': {
      const parsed = roomOnlySchema.safeParse(body)
      if (!parsed.success) return bad('INVALID_INPUT')
      const { roomCode } = parsed.data
      const session = await requireHost(req, roomCode)
      if (!session) return bad('UNAUTHORIZED', 401)
      const { data, error } = await supabase.rpc('complete_room', {
        p_room_code: roomCode,
        p_host_token_hash: hashToken(session.token),
      })
      if (error) return bad(error.message)
      return NextResponse.json(data)
    }

    default:
      return bad('UNKNOWN_ACTION')
  }
}
