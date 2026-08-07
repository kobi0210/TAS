'use client'

import { useState } from 'react'
import { ConnectionBadge } from '@/components/common/ConnectionBadge'
import { CaptainAvatar } from '@/components/common/CaptainAvatar'
import { accentBySlot } from '@/lib/auction/visuals'
import { formatPoints } from '@/lib/auction/rules'
import type { Team } from '@/types/database'

interface Props {
  team: Team
  isHost: boolean
  isMe?: boolean
  joinUrl?: string
  onUpdate?: (teamId: string, teamName: string, captainName: string) => Promise<void>
}

export function TeamSlotCard({ team, isHost, isMe, joinUrl, onUpdate }: Props) {
  const [editing, setEditing] = useState(false)
  const [teamName, setTeamName] = useState(team.team_name)
  const [captainName, setCaptainName] = useState(team.captain_name)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const accent = accentBySlot(team.slot_number)

  async function save() {
    if (!onUpdate) return
    setLoading(true)
    await onUpdate(team.id, teamName.trim(), captainName.trim())
    setLoading(false)
    setEditing(false)
  }

  function copyLink() {
    if (!joinUrl) return
    navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className={`panel p-4 space-y-2 ${isMe ? accent.border : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-3.5 rounded-full ${accent.bg}`} />
          <span className="text-ink-400 text-xs">슬롯 {team.slot_number}</span>
          {isMe && (
            <span className="text-[10px] text-ink-950 bg-ink-200 rounded px-1.5 py-0.5">나</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {team.is_ready && <span className="text-pine-300 text-xs font-bold">✓ 준비</span>}
          {team.claimed_at ? (
            <ConnectionBadge connected={team.is_connected} />
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-ink-800 text-ink-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full border border-ink-500" />
              빈 자리
            </span>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="팀명"
            maxLength={20}
            className="field h-9"
          />
          <input
            value={captainName}
            onChange={(e) => setCaptainName(e.target.value)}
            placeholder="팀장명"
            maxLength={20}
            className="field h-9"
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={loading || !teamName.trim() || !captainName.trim()}
              className="btn btn-primary flex-1 h-8"
            >
              저장
            </button>
            <button onClick={() => setEditing(false)} className="btn btn-ghost flex-1 h-8">
              취소
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <CaptainAvatar
              name={team.captain_name}
              avatarUrl={team.captain_avatar_url}
              className={`w-12 h-12 rounded-lg shrink-0 border ${
                team.claimed_at ? accent.border : 'border-ink-700'
              }`}
            />
            <div className="min-w-0">
              <p className={`font-bold truncate ${accent.text}`}>{team.team_name}</p>
              <p className="text-ink-300 text-sm truncate">{team.captain_name}</p>
              <p className="text-ink-500 text-xs font-mono mt-0.5">
                {formatPoints(team.remaining_points)} P · 정원 {team.max_players}명
              </p>
            </div>
          </div>
          {(isHost || isMe) && onUpdate && (
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditing(true)} className="btn btn-ghost flex-1 h-8">
                수정
              </button>
              {joinUrl && (
                <button onClick={copyLink} className="btn btn-ghost flex-1 h-8">
                  {copied ? '✓ 복사됨' : '링크 복사'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
