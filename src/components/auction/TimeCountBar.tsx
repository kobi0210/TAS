'use client'

import { useEffect, useRef } from 'react'
import { useServerClockMs, formatCountdown } from '@/hooks/useServerClock'
import { nextCountdownBeep, playSound } from '@/lib/audio/auctionSounds'
import type { Auction } from '@/types/database'

interface Props {
  auction: Auction | null
  offsetMs: number
  onExpired: () => void
  /** 자동 진행 대기 중이면 다음 경매까지 남은 초 */
  nextInSeconds?: number | null
}

/** 중앙 하단 타임 카운트 (자낳대 경매판의 TIME COUNT 표시). */
export function TimeCountBar({ auction, offsetMs, onExpired, nextInSeconds }: Props) {
  const isRunning = auction?.status === 'active'
  const msLeft = useServerClockMs(isRunning ? auction?.ends_at ?? null : null, offsetMs)

  // 같은 경매·같은 종료시각에 대해 확정 요청은 한 번만 보낸다.
  // (입찰로 시간이 연장되면 키가 바뀌어 다시 감시한다)
  const runKey = isRunning && auction ? `${auction.id}:${auction.ends_at}` : null
  const firedFor = useRef<string | null>(null)

  useEffect(() => {
    firedFor.current = null
  }, [runKey])

  useEffect(() => {
    if (!runKey || msLeft > 0 || firedFor.current === runKey) return
    firedFor.current = runKey
    onExpired()
  }, [msLeft, runKey, onExpired])

  // 마지막 5초는 1초에 한 번씩 카운트다운 효과음을 낸다.
  // 입찰로 시간이 연장되면 runKey 가 바뀌면서 다시 5초부터 세게 된다.
  const beepedAt = useRef<number | null>(null)

  useEffect(() => {
    beepedAt.current = null
  }, [runKey])

  useEffect(() => {
    if (!runKey) return
    const second = nextCountdownBeep(msLeft, beepedAt.current)
    if (second === null) return
    beepedAt.current = second
    playSound('countdown')
  }, [msLeft, runKey])

  const seconds = msLeft / 1000
  const urgent = isRunning && seconds <= 5
  const warn = isRunning && seconds <= 10 && !urgent

  let label = 'TIME COUNT'
  let value = '--.--'

  if (auction?.status === 'paused') {
    label = 'PAUSED'
    value = '일시정지'
  } else if (auction?.status === 'sold') {
    label = 'SOLD'
    value = '낙찰'
  } else if (auction?.status === 'unsold') {
    label = 'UNSOLD'
    value = '유찰'
  } else if (isRunning) {
    value = formatCountdown(msLeft)
  } else if (nextInSeconds != null) {
    label = 'NEXT'
    value = `${nextInSeconds}초 후 시작`
  } else {
    label = 'STANDBY'
    value = '대기 중'
  }

  const tone = urgent
    ? 'bg-mauve-500 text-ink-50'
    : warn
    ? 'bg-sand-500 text-ink-950'
    : auction?.status === 'paused'
    ? 'bg-ink-700 text-ink-100'
    : isRunning
    ? 'bg-pine-500 text-ink-50'
    : 'bg-ink-800 text-ink-300'

  return (
    <div
      className={`rounded-xl px-5 py-3 flex items-center justify-center gap-4 transition-colors ${tone} ${
        urgent ? 'animate-pulse-ring' : ''
      }`}
    >
      <span className="text-xs font-bold tracking-[0.2em] opacity-80">{label}</span>
      <span className="text-3xl font-mono font-bold tabular-nums leading-none">{value}</span>
    </div>
  )
}
