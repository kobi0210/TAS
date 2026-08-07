'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * 종료 시각까지 남은 시간(ms).
 *
 * `offsetMs`는 (서버시각 - 클라이언트시각)이다. 참가자 PC 시계가 몇 초씩
 * 어긋나 있어도 모두 같은 카운트다운을 보도록 보정한다.
 */
export function useServerClockMs(endsAt: string | null, offsetMs = 0): number {
  const [msLeft, setMsLeft] = useState(0)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    if (!endsAt) {
      setMsLeft(0)
      return
    }
    const end = new Date(endsAt).getTime()

    const tick = () => {
      const left = Math.max(0, end - (Date.now() + offsetMs))
      setMsLeft(left)
      if (left > 0) frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frameRef.current)
  }, [endsAt, offsetMs])

  return msLeft
}

/** 남은 초(올림). 기존 화면들이 쓰던 형태 그대로 유지한다. */
export function useServerClock(endsAt: string | null, offsetMs = 0): number {
  const ms = useServerClockMs(endsAt, offsetMs)
  return Math.ceil(ms / 1000)
}

/** 1분 미만은 `05.42`, 그 이상은 `1:05` 형태로 표시한다. */
export function formatCountdown(msLeft: number): string {
  const totalSeconds = Math.floor(msLeft / 1000)
  if (totalSeconds >= 60) {
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }
  const hundredths = Math.floor((msLeft % 1000) / 10)
  return `${String(totalSeconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`
}
