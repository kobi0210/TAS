'use client'

import { useEffect } from 'react'

export interface ToastMessage {
  kind: 'info' | 'error'
  text: string
}

interface Props {
  message: ToastMessage | null
  onDismiss: () => void
  durationMs?: number
}

/** 조작 결과·실패 사유를 알려주는 짧은 알림. */
export function Toast({ message, onDismiss, durationMs = 3500 }: Props) {
  useEffect(() => {
    if (!message) return
    const id = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(id)
  }, [message, onDismiss, durationMs])

  if (!message) return null

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 animate-flash-in">
      <div
        role="status"
        className={`flex items-center gap-3 rounded-xl px-4 py-2.5 shadow-lg border text-sm ${
          message.kind === 'error'
            ? 'bg-mauve-900 border-mauve-600 text-mauve-100'
            : 'bg-ink-800 border-ink-600 text-ink-50'
        }`}
      >
        <span>{message.text}</span>
        <button
          onClick={onDismiss}
          className="text-ink-400 hover:text-ink-100 text-xs shrink-0"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
