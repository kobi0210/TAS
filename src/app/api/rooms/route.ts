import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { generateToken, hashToken, generateRoomCode } from '@/lib/auth/tokens'
import { setHostSession } from '@/lib/auth/permissions'

const schema = z.object({
  name: z.string().min(1).max(50),
  hostName: z.string().min(1).max(20),
  teamCount: z.number().int().min(4).max(6),
  startingPoints: z.number().int().min(100).max(100000),
  maxPlayersPerTeam: z.number().int().min(1).max(20),
  auctionDurationSeconds: z.number().int().min(10).max(300),
  bidIncrement: z.number().int().min(1),
  extensionThresholdSeconds: z.number().int().min(0),
  extensionSeconds: z.number().int().min(0),
  defaultStartingBid: z.number().int().min(1).optional(),
  allowSelfRaise: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const data = parsed.data
  const roomCode = generateRoomCode()
  const hostToken = generateToken()
  const hostTokenHash = hashToken(hostToken)

  const teamTokens = Array.from({ length: data.teamCount }, () => generateToken())
  const teamTokenHashes = teamTokens.map(hashToken)

  const supabase = createAdminClient()
  const { data: result, error } = await supabase.rpc('create_room', {
    p_name: data.name,
    p_host_name: data.hostName,
    p_team_count: data.teamCount,
    p_starting_points: data.startingPoints,
    p_max_players_per_team: data.maxPlayersPerTeam,
    p_default_starting_bid: data.defaultStartingBid ?? 10,
    p_bid_increment: data.bidIncrement,
    p_auction_duration_seconds: data.auctionDurationSeconds,
    p_extension_threshold_seconds: data.extensionThresholdSeconds,
    p_extension_seconds: data.extensionSeconds,
    p_allow_self_raise: data.allowSelfRaise ?? false,
    p_room_code: roomCode,
    p_host_token_hash: hostTokenHash,
    p_team_token_hashes: teamTokenHashes,
  })

  if (error) {
    console.error('create_room error', error)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }

  const res = result as { roomId: string; roomCode: string; teamIds: string[] }

  await setHostSession(roomCode, hostToken)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const teamJoinUrls = teamTokens.map(
    (token, i) => `${siteUrl}/join/${roomCode}?token=${token}&slot=${i + 1}`
  )

  return NextResponse.json({
    roomCode: res.roomCode,
    roomId: res.roomId,
    hostToken,
    hostUrl: `${siteUrl}/room/${roomCode}/lobby`,
    teamJoinUrls,
    teamIds: res.teamIds,
  })
}
