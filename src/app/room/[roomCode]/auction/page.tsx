import { createServerClient } from '@/lib/supabase/server'
import { getPageSession } from '@/lib/auth/pageSession'
import { AuctionClient } from './AuctionClient'
import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ roomCode: string }>
  searchParams: Promise<{ t?: string }>
}

export default async function AuctionPage({ params, searchParams }: Props) {
  const [{ roomCode }, sp] = await Promise.all([params, searchParams])
  // 첫 렌더용 기본값. 실제 신원은 클라이언트가 탭 토큰으로 다시 확정한다.
  const session = await getPageSession(roomCode, sp)
  if (!session) redirect('/')

  const supabase = createServerClient()
  const { data: room } = await supabase
    .from('auction_rooms')
    .select('*')
    .eq('room_code', roomCode)
    .single()
  if (!room) redirect('/')
  if (room.status === 'completed') redirect(`/room/${roomCode}/result`)
  // 운영자가 아직 방을 열지 않았으면 로비에서 대기시킨다
  if (room.status === 'lobby' && session.role !== 'host') {
    redirect(`/room/${roomCode}/lobby${sp.t ? `?t=${encodeURIComponent(sp.t)}` : ''}`)
  }

  const [{ data: teams }, { data: players }, { data: auctions }, { data: bids }] = await Promise.all([
    supabase.from('teams').select('*').eq('room_id', room.id).order('slot_number'),
    supabase.from('players').select('*').eq('room_id', room.id).order('auction_order'),
    supabase
      .from('auctions')
      .select('*')
      .eq('room_id', room.id)
      .in('status', ['active', 'paused'])
      .limit(1),
    supabase
      .from('bids')
      .select('*')
      .eq('room_id', room.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return (
    <AuctionClient
      room={room}
      initialTeams={teams ?? []}
      initialPlayers={players ?? []}
      initialAuction={auctions?.[0] ?? null}
      initialBids={bids ?? []}
      session={session}
    />
  )
}
