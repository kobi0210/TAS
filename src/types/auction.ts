import type { AuctionRoom, Team, Player, Auction, Bid } from './database'

export interface RoomSession {
  role: 'host' | 'team'
  roomCode: string
  token: string
  teamId?: string
}

export interface RoomState {
  room: AuctionRoom
  teams: Team[]
  players: Player[]
  activeAuction: Auction | null
  recentBids: Bid[]
}

export type BidErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'TEAM_NOT_FOUND'
  | 'INVALID_TOKEN'
  | 'AUCTION_NOT_FOUND'
  | 'AUCTION_NOT_ACTIVE'
  | 'AUCTION_ALREADY_ENDED'
  | 'BID_TOO_LOW'
  | 'INVALID_INCREMENT'
  | 'INSUFFICIENT_POINTS'
  | 'ROSTER_RESERVE_REQUIRED'
  | 'ALREADY_HIGHEST_BIDDER'
  | 'TEAM_ROSTER_FULL'
  | 'PLAYER_ALREADY_SOLD'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'

export const BID_ERROR_MESSAGES: Record<BidErrorCode, string> = {
  ROOM_NOT_FOUND: '경매방을 찾을 수 없습니다.',
  TEAM_NOT_FOUND: '팀을 찾을 수 없습니다.',
  INVALID_TOKEN: '인증 토큰이 유효하지 않습니다.',
  AUCTION_NOT_FOUND: '경매를 찾을 수 없습니다.',
  AUCTION_NOT_ACTIVE: '경매가 진행 중이 아닙니다.',
  AUCTION_ALREADY_ENDED: '경매가 이미 종료되었습니다.',
  BID_TOO_LOW: '입찰가가 너무 낮습니다.',
  INVALID_INCREMENT: '입찰 단위가 맞지 않습니다.',
  INSUFFICIENT_POINTS: '포인트가 부족합니다.',
  ROSTER_RESERVE_REQUIRED: '나머지 선수 슬롯을 위한 포인트를 남겨야 합니다.',
  ALREADY_HIGHEST_BIDDER: '이미 최고 입찰자입니다.',
  TEAM_ROSTER_FULL: '팀 정원이 가득 찼습니다.',
  PLAYER_ALREADY_SOLD: '이미 낙찰된 선수입니다.',
  RATE_LIMITED: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
  INTERNAL_ERROR: '서버 오류가 발생했습니다.',
}
