'use client'

interface Props {
  connected: boolean
}

export function ConnectionBadge({ connected }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium ${
        connected ? 'bg-pine-900 text-pine-200' : 'bg-ink-800 text-ink-400'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-pine-300' : 'bg-ink-500'}`} />
      {connected ? '접속 중' : '오프라인'}
    </span>
  )
}
