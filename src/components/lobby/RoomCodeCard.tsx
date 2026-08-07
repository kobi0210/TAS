'use client'

import { useState } from 'react'

interface Props {
  roomCode: string
}

export function RoomCodeCard({ roomCode }: Props) {
  const [copied, setCopied] = useState(false)

  function copyCode() {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="panel p-4 space-y-3">
      <p className="text-sand-300 text-xs font-bold">참가 코드</p>
      <div className="text-4xl font-bold font-mono text-ink-50 tracking-[0.25em] text-center py-2">
        {roomCode}
      </div>
      <button onClick={copyCode} className="btn btn-ghost w-full">
        {copied ? '✓ 복사됨' : '코드 복사'}
      </button>
      <p className="text-ink-500 text-[11px] text-center leading-relaxed">
        이 코드로 입장하면 <span className="text-sand-300">들어온 순서대로</span> 빈 팀에 배정됩니다.
        특정 팀을 지정하려면 팀별 초대 링크를 사용하세요.
      </p>
    </div>
  )
}
