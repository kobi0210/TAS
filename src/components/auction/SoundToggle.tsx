'use client'

import { useAuctionSound } from '@/hooks/useAuctionSound'

/**
 * 효과음 스위치.
 *
 * 브라우저는 화면을 한 번 건드리기 전에는 소리를 막는다. 그래서 아직 허용이
 * 안 된 동안에는 "효과음 허용"으로 바뀌며, 이 버튼을 누르는 것 자체가 그
 * 조작이 되어 바로 열린다.
 */
export function SoundToggle() {
  const { enabled, ready, setEnabled, unlock } = useAuctionSound()

  const needsGesture = enabled && !ready
  const label = !enabled ? '효과음 꺼짐' : needsGesture ? '효과음 허용' : '효과음'

  const tone = !enabled
    ? 'text-ink-400 bg-ink-800'
    : needsGesture
    ? 'text-sand-200 bg-sand-900/60'
    : 'text-pine-200 bg-pine-900/60'

  return (
    <button
      type="button"
      onClick={() => (needsGesture ? unlock() : setEnabled(!enabled))}
      title={
        needsGesture
          ? '브라우저가 소리를 막고 있습니다. 눌러서 켜 주세요.'
          : enabled
          ? '카운트다운·낙찰 효과음 끄기'
          : '카운트다운·낙찰 효과음 켜기'
      }
      className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md transition-colors ${tone}`}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
        <path d="M7 2.5 3.8 5.2H1.6v5.6h2.2L7 13.5z" fill="currentColor" />
        {enabled ? (
          <>
            <path
              d="M9.9 5.4a3.6 3.6 0 0 1 0 5.2"
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M11.9 3.4a6.4 6.4 0 0 1 0 9.2"
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
              opacity={needsGesture ? 0.4 : 1}
            />
          </>
        ) : (
          <path
            d="M10.2 6 14 9.8M14 6l-3.8 3.8"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
        )}
      </svg>
      {label}
    </button>
  )
}
