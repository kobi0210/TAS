export type RoomStatus = 'lobby' | 'ready' | 'running' | 'paused' | 'completed' | 'cancelled'
export type AuctionStatus = 'pending' | 'active' | 'paused' | 'sold' | 'unsold' | 'cancelled'
export type PlayerStatus = 'pending' | 'active' | 'sold' | 'unsold' | 'cancelled'

export interface AuctionRoom {
  id: string
  room_code: string
  name: string
  host_name: string
  status: RoomStatus
  team_count: number
  starting_points: number
  max_players_per_team: number
  default_starting_bid: number
  bid_increment: number
  auction_duration_seconds: number
  extension_threshold_seconds: number
  extension_seconds: number
  allow_self_raise: boolean
  /** 낙찰 후 다음 선수를 자동으로 이어서 경매할지 */
  auto_advance: boolean
  /** 자동 진행 시 다음 경매까지의 대기 초 */
  auto_delay_seconds: number
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface Team {
  id: string
  room_id: string
  slot_number: number
  team_name: string
  captain_name: string
  starting_points: number
  remaining_points: number
  max_players: number
  is_ready: boolean
  is_connected: boolean
  last_seen_at: string | null
  /** 초대 링크 또는 방 코드로 주인이 정해진 시각 (null이면 빈 자리) */
  claimed_at: string | null
  /** 팀장이 로비에서 올린 사진 (data URI). 없으면 화면에서 기본 표식을 쓴다 */
  captain_avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Player {
  id: string
  room_id: string
  name: string
  nickname: string | null
  position: string | null
  tier: string | null
  description: string | null
  image_url: string | null
  starting_bid: number
  auction_order: number
  status: PlayerStatus
  sold_team_id: string | null
  sold_price: number | null
  created_at: string
  updated_at: string
}

export interface Auction {
  id: string
  room_id: string
  player_id: string
  status: AuctionStatus
  current_bid: number | null
  highest_team_id: string | null
  started_at: string | null
  ends_at: string | null
  paused_at: string | null
  remaining_seconds_when_paused: number | null
  sold_at: string | null
  created_at: string
  updated_at: string
}

export interface Bid {
  id: string
  room_id: string
  auction_id: string
  player_id: string
  team_id: string
  amount: number
  accepted: boolean
  rejection_reason: string | null
  created_at: string
}

export interface AuctionEvent {
  id: string
  room_id: string
  event_type: string
  actor_type: string
  actor_id: string | null
  payload: Record<string, unknown>
  created_at: string
}
