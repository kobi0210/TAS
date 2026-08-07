import { createServerClient } from '@/lib/supabase/server'
import { getPageSession } from '@/lib/auth/pageSession'
import { LobbyClient } from './LobbyClient'
import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ roomCode: string }>
  searchParams: Promise<{ t?: string }>
}

export default async function LobbyPage({ params, searchParams }: Props) {
  const [{ roomCode }, sp] = await Promise.all([params, searchParams])
  const session = await getPageSession(roomCode, sp)
  if (!session) redirect('/')

  const supabase = createServerClient()
  const { data: room } = await supabase
    .from('auction_rooms')
    .select('*')
    .eq('room_code', roomCode)
    .single()

  if (!room) redirect('/')

  if (room.status === 'ready' || room.status === 'running' || room.status === 'paused') {
    redirect(`/room/${roomCode}/auction${sp.t ? `?t=${encodeURIComponent(sp.t)}` : ''}`)
  }
  if (room.status === 'completed') {
    redirect(`/room/${roomCode}/result`)
  }

  const { data: teams } = await supabase
    .from('teams')
    .select('*')
    .eq('room_id', room.id)
    .order('slot_number')

  return <LobbyClient room={room} initialTeams={teams ?? []} session={session} />
}
