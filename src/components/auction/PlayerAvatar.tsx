import { accentById, initialOf } from '@/lib/auction/visuals'
import type { Player } from '@/types/database'

interface Props {
  player: Pick<Player, 'id' | 'name' | 'image_url'>
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES: Record<NonNullable<Props['size']>, string> = {
  xs: 'w-8 h-8 text-xs',
  sm: 'w-11 h-11 text-sm',
  md: 'w-16 h-16 text-lg',
  lg: 'w-32 h-32 text-4xl',
}

/** 선수 썸네일. 이미지가 없으면 이름 첫 글자로 대신한다. */
export function PlayerAvatar({ player, size = 'sm', className = '' }: Props) {
  const accent = accentById(player.id)
  const box = SIZES[size]

  if (player.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={player.image_url}
        alt={player.name}
        className={`${box} rounded-lg object-cover bg-ink-800 ${className}`}
      />
    )
  }

  return (
    <div
      className={`${box} rounded-lg flex items-center justify-center font-bold bg-ink-800 border border-ink-700 ${accent.text} ${className}`}
    >
      {initialOf(player.name)}
    </div>
  )
}
