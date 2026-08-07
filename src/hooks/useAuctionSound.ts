'use client'

import { useEffect, useSyncExternalStore } from 'react'
import {
  getServerSoundState,
  getSoundState,
  initAuctionSounds,
  setSoundEnabled,
  subscribeSound,
  unlockAudio,
  type SoundState,
} from '@/lib/audio/auctionSounds'

export interface SoundControls extends SoundState {
  setEnabled: (next: boolean) => void
  unlock: () => void
}

/** 효과음 켜짐/준비 상태를 읽고 토글한다. 화면 상단 스위치가 쓴다. */
export function useAuctionSound(): SoundControls {
  const state = useSyncExternalStore(subscribeSound, getSoundState, getServerSoundState)

  useEffect(() => {
    initAuctionSounds()
  }, [])

  return {
    ...state,
    setEnabled: setSoundEnabled,
    unlock: () => {
      void unlockAudio()
    },
  }
}
