import { createServerClient } from '@/lib/supabase/server'
import { getPageSession } from '@/lib/auth/pageSession'
import { PlayersClient } from './PlayersClient'
import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ roomCode: string }>
  searchParams: Promise<{ t?: string }>
}

export default async function PlayersPage({ params, searchParams }: Props) {
  const [{ roomCode }, sp] = await Promise.all([params, searchParams])
  const session = await getPageSession(roomCode, sp)
  if (!session || session.role !== 'host') redirect(`/room/${roomCode}/lobby`)

  const supabase = createServerClient()
  const { data: room } = await supabase.from('auction_rooms').select('*').eq('room_code', roomCode).single()
  if (!room) redirect('/')

  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', room.id)
    .order('auction_order')

  return <PlayersClient room={room} initialPlayers={players ?? []} />
}
