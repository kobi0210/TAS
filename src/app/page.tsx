'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getRoomToken, setRoomToken, describe } from '@/lib/api/client'

interface JoinInfo {
  found: boolean
  roomCode?: string
  name?: string
  hostName?: string
  status?: string
  openSlots?: number
  teamCount?: number
}

export default function HomePage() {
  const [code, setCode] = useState('')
  const [info, setInfo] = useState<JoinInfo | null>(null)
  const [captainName, setCaptainName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  /** 1단계 — 코드 확인. 오타로 팀 자리를 소모하지 않도록 먼저 방을 조회한다. */
  async function lookup(e: React.FormEvent) {
    e.preventDefault()
    const roomCode = code.trim().toUpperCase()
    if (roomCode.length < 4) return

    // 이 탭이 이미 이 방의 신원을 갖고 있으면 새 자리를 차지하지 않고 그대로 들어간다
    const existing = getRoomToken(roomCode)
    if (existing) {
      router.push(`/room/${roomCode}/lobby?t=${encodeURIComponent(existing)}`)
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/join?roomCode=${encodeURIComponent(roomCode)}`, {
        cache: 'no-store',
      })
      const data = (await res.json()) as JoinInfo
      if (!res.ok || !data.found) {
        setError('해당 코드의 경매방을 찾을 수 없습니다.')
        return
      }
      if (data.status !== 'lobby' && data.status !== 'ready') {
        setError('이미 경매가 시작된 방이라 코드로는 입장할 수 없습니다.')
        return
      }
      if (!data.openSlots) {
        setError('남은 팀 자리가 없습니다. 운영자에게 초대 링크를 요청해 주세요.')
        return
      }
      setInfo(data)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  /** 2단계 — 빈 팀 슬롯을 선점한다 (들어온 순서대로 배정). */
  async function join(e: React.FormEvent) {
    e.preventDefault()
    const roomCode = (info?.roomCode ?? code).trim().toUpperCase()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, captainName: captainName.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(describe(data.code ?? data.error))
        // 그 사이 자리가 찼을 수 있으니 최신 상태를 다시 보여준다
        setInfo(null)
        return
      }
      setRoomToken(roomCode, data.token)
      router.push(`/room/${roomCode}/lobby?t=${encodeURIComponent(data.token)}`)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-ink-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-10">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-1.5">
            <span className="w-2.5 h-8 rounded-full bg-sand-500" />
            <span className="w-2.5 h-8 rounded-full bg-mauve-500" />
            <span className="w-2.5 h-8 rounded-full bg-pine-500" />
            <span className="w-2.5 h-8 rounded-full bg-iris-500" />
          </div>
          <h1 className="text-4xl font-bold text-ink-50 tracking-tight">팀원 경매</h1>
          <p className="text-ink-400 text-sm">실시간 팀원 경매 시스템</p>
        </div>

        {info ? (
          <form onSubmit={join} className="space-y-4">
            <div className="panel p-4 space-y-1">
              <p className="text-sand-300 text-xs font-bold">{info.roomCode}</p>
              <p className="text-ink-50 font-bold text-lg">{info.name}</p>
              <p className="text-ink-400 text-sm">운영자 {info.hostName}</p>
              <p className="text-ink-300 text-xs pt-1">
                남은 자리 <span className="text-sand-300 font-bold">{info.openSlots}</span> /{' '}
                {info.teamCount}팀 · 입장하면 빈 팀 중 앞 번호의 팀장이 됩니다.
              </p>
            </div>

            <div>
              <label className="label">팀장 이름 (선택)</label>
              <input
                value={captainName}
                onChange={(e) => setCaptainName(e.target.value)}
                placeholder="입력하지 않으면 나중에 로비에서 변경할 수 있습니다"
                maxLength={20}
                className="field"
                autoFocus
              />
            </div>

            {error && <p className="text-mauve-300 text-sm text-center">{error}</p>}

            <button type="submit" disabled={loading} className="btn btn-primary w-full h-14 text-base">
              {loading ? '입장 중...' : '팀장으로 입장'}
            </button>
            <button
              type="button"
              onClick={() => {
                setInfo(null)
                setError('')
              }}
              className="btn btn-ghost w-full h-11"
            >
              코드 다시 입력
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <Link href="/host/create" className="btn btn-primary w-full h-14 text-base">
              경매방 만들기
            </Link>

            <form onSubmit={lookup} className="space-y-3">
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase())
                  setError('')
                }}
                placeholder="참가 코드"
                maxLength={8}
                className="field h-14 text-center text-2xl font-mono tracking-[0.3em]"
              />
              <button
                type="submit"
                disabled={code.trim().length < 4 || loading}
                className="btn btn-ghost w-full h-12"
              >
                {loading ? '확인 중...' : '참가 코드로 입장'}
              </button>
            </form>

            {error && <p className="text-mauve-300 text-sm text-center">{error}</p>}

            <p className="text-ink-500 text-xs text-center leading-relaxed">
              참가 코드로 들어오면 <span className="text-sand-300">먼저 들어온 순서대로</span> 팀이
              배정됩니다. 특정 팀을 맡아야 한다면 운영자에게 받은 초대 링크로 입장하세요.
            </p>
          </div>
        )}

        <p className="text-center text-ink-600 text-xs">비공식 팬메이드 서비스입니다</p>
      </div>
    </main>
  )
}
