'use client'

/**
 * 탭 단위 세션 토큰 보관 + API 호출 래퍼.
 *
 * 쿠키는 브라우저 프로필 하나당 하나뿐이라 시크릿 탭을 여러 개 띄워도
 * 팀 구분이 되지 않는다(마지막에 입장한 팀으로 전부 덮어써짐).
 * sessionStorage는 탭마다 독립이므로, 초대 링크로 받은 토큰을 여기에 넣고
 * 모든 API 요청에 헤더로 실어 보낸다.
 */

const KEY = (roomCode: string) => `teamac.token.${roomCode.toUpperCase()}`

export const ROOM_TOKEN_HEADER = 'x-room-token'

export function getRoomToken(roomCode: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage.getItem(KEY(roomCode))
  } catch {
    return null
  }
}

export function setRoomToken(roomCode: string, token: string) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(KEY(roomCode), token)
  } catch {
    /* 프라이빗 모드에서 저장이 막히면 쿠키 대비책으로 동작한다 */
  }
}

export function clearRoomToken(roomCode: string) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(KEY(roomCode))
  } catch {
    /* noop */
  }
}

/**
 * URL의 `?t=` 파라미터에 담겨 온 토큰을 이 탭에 저장하고 주소창에서 지운다.
 * (주소를 복사해 다른 탭에 붙여넣어도 그 탭은 그 탭의 신원을 갖게 된다)
 */
export function captureTokenFromUrl(roomCode: string): string | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const t = url.searchParams.get('t')
  if (!t) return getRoomToken(roomCode)
  setRoomToken(roomCode, t)
  url.searchParams.delete('t')
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  return t
}

export interface ApiResult<T = unknown> {
  ok: boolean
  status: number
  data: T | null
  /** 화면에 그대로 보여줄 수 있는 한국어 사유 */
  error: string | null
}

/** roomCode에 해당하는 탭 토큰을 실어 API를 호출한다. */
export async function apiFetch<T = unknown>(
  roomCode: string,
  input: string,
  init: RequestInit = {}
): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getRoomToken(roomCode)
  if (token) headers.set(ROOM_TOKEN_HEADER, token)

  try {
    const res = await fetch(input, { ...init, headers, credentials: 'same-origin' })
    const text = await res.text()
    const data = text ? (JSON.parse(text) as T) : null

    if (!res.ok) {
      const code = (data as { error?: string } | null)?.error
      return { ok: false, status: res.status, data, error: describe(code) }
    }
    // RPC가 { success: false, code } 형태로 실패를 알리는 경우
    const payload = data as { success?: boolean; code?: string } | null
    if (payload && payload.success === false) {
      return { ok: false, status: res.status, data, error: describe(payload.code) }
    }
    return { ok: true, status: res.status, data, error: null }
  } catch {
    return { ok: false, status: 0, data: null, error: '네트워크 오류가 발생했습니다.' }
  }
}

const MESSAGES: Record<string, string> = {
  UNAUTHORIZED: '권한이 없습니다. 초대 링크로 다시 입장해 주세요.',
  INVALID_INPUT: '입력값이 올바르지 않습니다.',
  INVALID_TOKEN: '인증 토큰이 유효하지 않습니다.',
  ROOM_NOT_FOUND: '경매방을 찾을 수 없습니다.',
  PLAYER_NOT_FOUND: '선수를 찾을 수 없습니다.',
  PLAYER_NOT_PENDING: '이미 경매가 진행됐거나 진행 중인 선수입니다.',
  PLAYER_NOT_EDITABLE: '경매가 시작된 선수는 수정할 수 없습니다.',
  PLAYER_NOT_RESETTABLE: '초기화할 수 없는 상태입니다.',
  AUCTION_NOT_FOUND: '경매를 찾을 수 없습니다.',
  AUCTION_NOT_ACTIVE: '진행 중인 경매가 아닙니다.',
  AUCTION_NOT_PAUSED: '일시정지 상태가 아닙니다.',
  AUCTION_NOT_ENDED: '아직 시간이 남아 있습니다.',
  AUCTION_ALREADY_RUNNING: '이미 진행 중인 경매가 있습니다.',
  NO_PENDING_PLAYERS: '경매할 선수가 남아 있지 않습니다.',
  TEAM_NOT_FOUND: '팀을 찾을 수 없습니다.',
  ROOM_ALREADY_STARTED: '이미 경매가 시작된 방이라 코드로는 입장할 수 없습니다.',
  NO_TEAM_SLOT: '남은 팀 자리가 없습니다. 운영자에게 초대 링크를 요청해 주세요.',
  ROOM_COMPLETED: '이미 종료된 경매방입니다.',
  INTERNAL_ERROR: '서버 오류가 발생했습니다.',
}

export function describe(code?: string | null): string {
  if (!code) return '요청을 처리하지 못했습니다.'
  return MESSAGES[code] ?? code
}
