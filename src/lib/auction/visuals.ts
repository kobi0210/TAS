/**
 * 팀/선수 표시에 쓰는 강조색.
 * 주 색상 4종(sand·mauve·pine·iris)을 슬롯 순서대로 돌려쓴다.
 * Tailwind가 클래스를 정적으로 수집해야 하므로 전체 문자열을 그대로 적는다.
 */
export interface Accent {
  key: 'sand' | 'mauve' | 'pine' | 'iris'
  text: string
  border: string
  bg: string
  softBg: string
  dot: string
  ring: string
}

export const ACCENTS: Accent[] = [
  {
    key: 'sand',
    text: 'text-sand-300',
    border: 'border-sand-600',
    bg: 'bg-sand-500',
    softBg: 'bg-sand-900/40',
    dot: 'bg-sand-400',
    ring: 'ring-sand-500',
  },
  {
    key: 'mauve',
    text: 'text-mauve-300',
    border: 'border-mauve-600',
    bg: 'bg-mauve-500',
    softBg: 'bg-mauve-900/40',
    dot: 'bg-mauve-400',
    ring: 'ring-mauve-500',
  },
  {
    key: 'pine',
    text: 'text-pine-300',
    border: 'border-pine-600',
    bg: 'bg-pine-500',
    softBg: 'bg-pine-900/40',
    dot: 'bg-pine-400',
    ring: 'ring-pine-500',
  },
  {
    key: 'iris',
    text: 'text-iris-300',
    border: 'border-iris-600',
    bg: 'bg-iris-500',
    softBg: 'bg-iris-900/40',
    dot: 'bg-iris-400',
    ring: 'ring-iris-500',
  },
]

export function accentBySlot(slot: number): Accent {
  const i = ((slot - 1) % ACCENTS.length + ACCENTS.length) % ACCENTS.length
  return ACCENTS[i]
}

export function accentById(id: string): Accent {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return ACCENTS[h % ACCENTS.length]
}

/** 이름 첫 글자 (이미지가 없을 때 아바타 대용) */
export function initialOf(name: string): string {
  return name.trim().charAt(0) || '?'
}
