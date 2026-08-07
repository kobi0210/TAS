import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '팀원 경매 시스템',
  description: '실시간 팀원 경매 서비스',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
