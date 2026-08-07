'use client'

/**
 * 경매 효과음 — 5초 카운트다운과 낙찰음.
 *
 * 소리는 Web Audio 로 재생한다. <audio> 를 되감아 쓰면 1초 간격으로 연속해서
 * 울릴 때 앞소리가 잘리거나 건너뛰는 일이 생기는데, 디코딩해 둔 버퍼를 매번
 * 새 소스로 재생하면 그런 일이 없다.
 *
 * 브라우저는 사용자가 화면을 한 번 건드리기 전까지 소리를 막는다. 그래서
 *   - 파일을 미리 받아 디코딩해 두고 (조작 없이도 가능),
 *   - 첫 클릭·키 입력 때 오디오 장치를 깨운다 (조작이 필요).
 * 이 둘을 나눠 두면 경매가 시작되는 순간 지연 없이 바로 울린다.
 */

export type SoundName = 'countdown' | 'sold'

const SOURCES: Record<SoundName, string> = {
  countdown: '/sounds/countdown.wav',
  sold: '/sounds/sold.wav',
}

const STORAGE_KEY = 'teamac.sound.enabled'

export interface SoundState {
  /** 사용자가 효과음을 켜 두었는지 */
  enabled: boolean
  /** 브라우저가 재생을 허용했고 음원도 준비됐는지 */
  ready: boolean
}

/** 서버 렌더에서 쓰는 고정 스냅샷 (매번 새 객체를 만들면 무한 렌더가 된다) */
const SERVER_STATE: SoundState = { enabled: true, ready: false }

let state: SoundState = { enabled: true, ready: false }
const listeners = new Set<() => void>()

let ctx: AudioContext | null = null
let output: GainNode | null = null
const buffers = new Map<SoundName, AudioBuffer>()
let decoding: Promise<void> | null = null
let started = false

function emit(next: Partial<SoundState>): void {
  const merged = { ...state, ...next }
  if (merged.enabled === state.enabled && merged.ready === state.ready) return
  state = merged
  listeners.forEach((fn) => fn())
}

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    // 사생활 보호 모드 등에서 localStorage 가 막혀 있으면 기본값(켜짐)
    return true
  }
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (ctx) return ctx
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  output = ctx.createGain()
  output.gain.value = 1
  output.connect(ctx.destination)
  return ctx
}

/** 음원을 받아 디코딩해 둔다. 사용자 조작 없이도 할 수 있다. */
function ensureBuffers(): Promise<void> {
  if (decoding) return decoding
  const audio = ensureContext()
  if (!audio) return Promise.resolve()

  decoding = Promise.all(
    (Object.keys(SOURCES) as SoundName[]).map(async (name) => {
      if (buffers.has(name)) return
      try {
        const res = await fetch(SOURCES[name])
        if (!res.ok) return
        buffers.set(name, await audio.decodeAudioData(await res.arrayBuffer()))
      } catch {
        // 음원을 못 받아도 경매 진행 자체는 막지 않는다
      }
    })
  ).then(() => {
    syncReady()
  })

  return decoding
}

function syncReady(): void {
  const loaded = buffers.size === Object.keys(SOURCES).length
  emit({ ready: loaded && ctx?.state === 'running' })
}

/**
 * 오디오 장치를 깨운다. 반드시 사용자 조작(클릭·키 입력) 흐름 안에서 불러야
 * 브라우저가 허용한다.
 */
export async function unlockAudio(): Promise<void> {
  const audio = ensureContext()
  if (!audio) return
  if (audio.state === 'suspended') {
    try {
      await audio.resume()
    } catch {
      // 조작 없이 불렸다면 여기서 막힌다. 다음 조작 때 다시 시도된다.
    }
  }
  await ensureBuffers()
  syncReady()
}

/** 화면이 뜨는 즉시 한 번 부른다. 음원을 미리 받고 첫 조작을 기다린다. */
export function initAuctionSounds(): void {
  if (started || typeof window === 'undefined') return
  started = true

  emit({ enabled: readStored() })
  void ensureBuffers()

  const wake = () => {
    void unlockAudio()
  }
  const events = ['pointerdown', 'keydown', 'touchstart'] as const
  events.forEach((type) => window.addEventListener(type, wake, { passive: true }))

  // 탭을 다시 보면 정지돼 있을 수 있으므로 상태만 맞춰 둔다
  document.addEventListener('visibilitychange', syncReady)
}

export function playSound(name: SoundName): void {
  if (!state.enabled) return
  const audio = ensureContext()
  if (!audio || !output) return

  const buffer = buffers.get(name)
  if (!buffer || audio.state !== 'running') {
    // 아직 준비가 안 됐으면 조용히 넘기고 준비만 다시 시도한다
    void unlockAudio()
    return
  }

  const source = audio.createBufferSource()
  source.buffer = buffer
  source.connect(output)
  source.start()
}

export function setSoundEnabled(next: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
  } catch {
    // 저장이 막혀 있어도 이번 세션 동안은 적용된다
  }
  emit({ enabled: next })
  if (next) void unlockAudio()
}

export function subscribeSound(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getSoundState(): SoundState {
  return state
}

export function getServerSoundState(): SoundState {
  return SERVER_STATE
}

/**
 * 카운트다운 효과음을 울릴 초를 고른다.
 *
 * 남은 시간은 1초에 60번씩 갱신되므로, 같은 초에 여러 번 울리지 않도록
 * "직전에 울린 초보다 작아졌을 때만" 새로 울린다. 입찰로 시간이 연장되면
 * 호출하는 쪽에서 `lastBeepSecond` 를 null 로 되돌려 다시 감시하게 한다.
 *
 * @returns 울려야 할 초(5..1), 울릴 때가 아니면 null
 */
export function nextCountdownBeep(
  msLeft: number,
  lastBeepSecond: number | null,
  windowSeconds = 5
): number | null {
  const second = Math.ceil(msLeft / 1000)
  if (second < 1 || second > windowSeconds) return null
  if (lastBeepSecond !== null && lastBeepSecond <= second) return null
  return second
}
