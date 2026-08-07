interface Props {
  children: React.ReactNode
}

/**
 * 세션 확인은 각 페이지가 직접 한다.
 *
 * 레이아웃에서 쿠키만 보고 막아버리면, 쿠키가 없는 브라우저에서 초대 링크
 * (`?t=`)로 들어온 팀장까지 홈으로 튕겨 나가기 때문이다.
 */
export default function RoomLayout({ children }: Props) {
  return <>{children}</>
}
