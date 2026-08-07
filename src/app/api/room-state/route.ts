import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import type { Auction } from '@/types/database'

export const dynamic = 'force-dynamic'

/**
 * 방 전체 상태 스냅샷.
 *
 * Realtime 브로드캐스트가 늦거나 유실돼도 화면이 멈추지 않도록 클라이언트가
 * 주기적으로/재접속 시 호출한다. 시간이 다 된 경매가 남아 있으면 여기서
 * 확정까지 처리해, 아무도 화면을 보고 있지 않아도 경매가 멈춰 있지 않게 한다.
 */
export async function GET(req: NextRequest) {
  const roomCode = req.nextUrl.searchParams.get('roomCode')
  if (!roomCode) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_room_state', { p_room_code: roomCode })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const state = data as {
    serverTime: string
    activeAuction: Auction | null
  } & Record<string, unknown>

  const active = state.activeAuction
  if (active && active.status === 'active' && active.ends_at) {
    const expired = new Date(active.ends_at).getTime() <= new Date(state.serverTime).getTime()
    if (expired) {
      await supabase.rpc('finalize_auction', {
        p_room_code: roomCode,
        p_auction_id: active.id,
        p_host_token_hash: null,
        p_force: false,
      })
      const { data: fresh } = await supabase.rpc('get_room_state', { p_room_code: roomCode })
      if (fresh) return NextResponse.json(fresh)
    }
  }

  return NextResponse.json(state)
}
