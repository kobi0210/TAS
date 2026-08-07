import { createServerClient } from '@/lib/supabase/server'
import { getPageSession } from '@/lib/auth/pageSession'
import { ResultClient } from './ResultClient'
import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ roomCode: string }>
  searchParams: Promise<{ t?: string }>
}

export default async function ResultPage({ params, searchParams }: Props) {
  const [{ roomCode }, sp] = await Promise.all([params, searchParams])
  const session = await getPageSession(roomCode, sp)
  if (!session) redirect('/')

  const supabase = createServerClient()
  const { data: room } = await supabase.from('auction_rooms').select('*').eq('room_code', roomCode).single()
  if (!room) redirect('/')

  const [{ data: teams }, { data: players }] = await Promise.all([
    supabase.from('teams').select('*').eq('room_id', room.id).order('slot_number'),
    supabase.from('players').select('*').eq('room_id', room.id).order('auction_order'),
  ])

  return (
    <ResultClient
      room={room}
      teams={teams ?? []}
      players={players ?? []}
      session={session}
    />
  )
}
