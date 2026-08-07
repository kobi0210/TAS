import { describe, it, expect } from 'vitest'
import { nextCountdownBeep } from './auctionSounds'

describe('nextCountdownBeep', () => {
  it('5초보다 많이 남았으면 울리지 않는다', () => {
    expect(nextCountdownBeep(30_000, null)).toBeNull()
    expect(nextCountdownBeep(5_001, null)).toBeNull()
  })

  it('정확히 5초가 되면 첫 소리를 낸다', () => {
    expect(nextCountdownBeep(5_000, null)).toBe(5)
  })

  it('같은 초 안에서는 한 번만 울린다', () => {
    // 1초에 60번쯤 갱신되므로 같은 초에 여러 번 들어온다
    expect(nextCountdownBeep(4_900, 5)).toBeNull()
    expect(nextCountdownBeep(4_500, 5)).toBeNull()
    expect(nextCountdownBeep(4_001, 5)).toBeNull()
  })

  it('초가 바뀌면 다시 울린다', () => {
    expect(nextCountdownBeep(4_000, 5)).toBe(4)
    expect(nextCountdownBeep(3_000, 4)).toBe(3)
    expect(nextCountdownBeep(2_000, 3)).toBe(2)
    expect(nextCountdownBeep(1_000, 2)).toBe(1)
  })

  it('0초에 도달하면 더 울리지 않는다', () => {
    expect(nextCountdownBeep(0, 1)).toBeNull()
    expect(nextCountdownBeep(0, null)).toBeNull()
  })

  it('5초 구간을 처음부터 끝까지 돌면 정확히 다섯 번 울린다', () => {
    let last: number | null = null
    const played: number[] = []
    // 실제 화면처럼 16ms 간격으로 훑는다
    for (let ms = 5_400; ms >= 0; ms -= 16) {
      const beep = nextCountdownBeep(ms, last)
      if (beep !== null) {
        played.push(beep)
        last = beep
      }
    }
    expect(played).toEqual([5, 4, 3, 2, 1])
  })

  it('입찰로 시간이 연장돼 기록이 지워지면 새 5초를 다시 센다', () => {
    // 2초 남은 시점에 입찰 → ends_at 이 늘고 호출부가 last 를 null 로 되돌린다
    expect(nextCountdownBeep(12_000, null)).toBeNull()
    expect(nextCountdownBeep(5_000, null)).toBe(5)
  })

  it('경매 도중에 들어와도 남은 초부터 이어서 울린다', () => {
    expect(nextCountdownBeep(2_800, null)).toBe(3)
    expect(nextCountdownBeep(2_000, 3)).toBe(2)
  })

  it('구간 길이를 바꿀 수 있다', () => {
    expect(nextCountdownBeep(9_000, null, 10)).toBe(9)
    expect(nextCountdownBeep(9_000, null, 5)).toBeNull()
  })
})
