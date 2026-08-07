'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { setRoomToken } from '@/lib/api/client'

export default function CreateRoomPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [result, setResult] = useState<{
    roomCode: string
    hostUrl: string
    teamJoinUrls: string[]
  } | null>(null)

  const [form, setForm] = useState({
    name: '',
    hostName: '',
    teamCount: 4,
    startingPoints: 1000,
    maxPlayersPerTeam: 5,
    auctionDurationSeconds: 30,
    bidIncrement: 10,
    extensionThresholdSeconds: 5,
    extensionSeconds: 5,
    defaultStartingBid: 10,
    allowSelfRaise: false,
  })

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '방 생성에 실패했습니다.')
        return
      }
      // 운영자 토큰도 이 탭에 보관한다 (쿠키가 다른 방/탭과 섞여도 안전하도록)
      setRoomToken(data.roomCode, data.hostToken)
      setResult({
        roomCode: data.roomCode,
        hostUrl: data.hostUrl,
        teamJoinUrls: data.teamJoinUrls,
      })
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  function copy(text: string, index: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 1800)
    })
  }

  if (result) {
    return (
      <main className="min-h-screen bg-ink-900 p-4">
        <div className="max-w-lg mx-auto space-y-6 py-8">
          <h1 className="text-2xl font-bold text-ink-50">방이 생성됐어요</h1>
          <p className="text-ink-300 text-sm leading-relaxed">
            아래 링크를 팀장에게 하나씩 나눠주세요.{' '}
            <span className="text-mauve-300">이 화면을 벗어나면 다시 볼 수 없습니다.</span>
          </p>
          <div className="panel p-4 space-y-2">
            <p className="text-ink-400 text-xs">방 코드</p>
            <p className="text-ink-50 text-3xl font-mono tracking-[0.25em]">{result.roomCode}</p>
          </div>

          <div className="space-y-2">
            {result.teamJoinUrls.map((url, i) => (
              <div key={i} className="panel p-3 flex items-center gap-2">
                <span className="text-ink-400 text-sm w-12 shrink-0">{i + 1}팀</span>
                <input
                  readOnly
                  value={url}
                  className="flex-1 bg-transparent text-ink-200 text-xs outline-none truncate"
                />
                <button onClick={() => copy(url, i)} className="btn btn-primary h-8 px-3 text-xs">
                  {copiedIndex === i ? '✓' : '복사'}
                </button>
              </div>
            ))}
          </div>

          <p className="text-ink-500 text-xs leading-relaxed">
            팀장이 같은 PC의 시크릿 창 여러 개로 접속하더라도, 각 창에서 자기 링크를 열면
            각각 다른 팀으로 참여됩니다.
          </p>

          <button
            onClick={() => router.push(`/room/${result.roomCode}/lobby`)}
            className="btn btn-primary w-full h-14 text-base"
          >
            로비로 이동
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-ink-900 p-4">
      <div className="max-w-lg mx-auto space-y-6 py-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-ink-400 hover:text-ink-100 text-sm">
            ← 홈
          </Link>
          <h1 className="text-2xl font-bold text-ink-50">경매방 만들기</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="panel p-5 space-y-4">
            <h2 className="text-sand-300 font-bold text-sm">기본 정보</h2>
            <div>
              <label className="label">경매방 이름 *</label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                required
                maxLength={50}
                className="field"
                placeholder="2026 여름 팀원 경매"
              />
            </div>
            <div>
              <label className="label">운영자 이름 *</label>
              <input
                value={form.hostName}
                onChange={(e) => set('hostName', e.target.value)}
                required
                maxLength={20}
                className="field"
                placeholder="운영자"
              />
            </div>
          </section>

          <section className="panel p-5 space-y-4">
            <h2 className="text-sand-300 font-bold text-sm">팀 설정</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">팀 수 (4~6)</label>
                <select
                  value={form.teamCount}
                  onChange={(e) => set('teamCount', Number(e.target.value))}
                  className="field"
                >
                  {[4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}팀
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">팀별 최대 선수 수</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={form.maxPlayersPerTeam}
                  onChange={(e) => set('maxPlayersPerTeam', Number(e.target.value))}
                  className="field font-mono"
                />
              </div>
              <div className="col-span-2">
                <label className="label">팀별 시작 포인트</label>
                <input
                  type="number"
                  min={100}
                  value={form.startingPoints}
                  onChange={(e) => set('startingPoints', Number(e.target.value))}
                  className="field font-mono"
                />
              </div>
            </div>
          </section>

          <section className="panel p-5 space-y-4">
            <h2 className="text-sand-300 font-bold text-sm">경매 규칙</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">경매 시간 (초)</label>
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={form.auctionDurationSeconds}
                  onChange={(e) => set('auctionDurationSeconds', Number(e.target.value))}
                  className="field font-mono"
                />
              </div>
              <div>
                <label className="label">최소 입찰 단위</label>
                <input
                  type="number"
                  min={1}
                  value={form.bidIncrement}
                  onChange={(e) => set('bidIncrement', Number(e.target.value))}
                  className="field font-mono"
                />
              </div>
              <div>
                <label className="label">기본 시작 입찰가</label>
                <input
                  type="number"
                  min={1}
                  value={form.defaultStartingBid}
                  onChange={(e) => set('defaultStartingBid', Number(e.target.value))}
                  className="field font-mono"
                />
              </div>
              <div>
                <label className="label">연장 기준 (종료 전 초)</label>
                <input
                  type="number"
                  min={0}
                  value={form.extensionThresholdSeconds}
                  onChange={(e) => set('extensionThresholdSeconds', Number(e.target.value))}
                  className="field font-mono"
                />
              </div>
              <div>
                <label className="label">연장 시간 (초)</label>
                <input
                  type="number"
                  min={0}
                  value={form.extensionSeconds}
                  onChange={(e) => set('extensionSeconds', Number(e.target.value))}
                  className="field font-mono"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allowSelfRaise}
                onChange={(e) => set('allowSelfRaise', e.target.checked)}
                className="w-4 h-4 rounded accent-[#C3B98D]"
              />
              <span className="text-ink-200 text-sm">자기 최고가 재입찰 허용</span>
            </label>
          </section>

          {error && <p className="text-mauve-300 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !form.name || !form.hostName}
            className="btn btn-primary w-full h-14 text-base"
          >
            {loading ? '생성 중...' : '경매방 생성'}
          </button>
        </form>
      </div>
    </main>
  )
}
