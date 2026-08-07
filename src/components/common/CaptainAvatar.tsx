/**
 * 팀장 사진.
 *
 * 팀장이 로비에서 사진을 정해 두면 그 사진을, 정하지 않았으면 기본 그림을
 * 보여준다. 둘 다 같은 방식으로 그리므로 public/teams/captain-default.svg
 * 파일만 바꾸면 사진을 정하지 않은 자리가 전부 함께 바뀐다.
 */
const CAPTAIN_DEFAULT = '/teams/captain-default.svg'

interface Props {
  name: string
  avatarUrl?: string | null
  className?: string
}

export function CaptainAvatar({ name, avatarUrl, className = '' }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl || CAPTAIN_DEFAULT}
      alt={avatarUrl ? `팀장 ${name}` : '팀장 사진 없음'}
      className={`object-cover bg-ink-900 ${className}`}
    />
  )
}
