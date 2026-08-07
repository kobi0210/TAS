'use client'

import { useEffect, useRef, useState } from 'react'
import { CaptainAvatar } from '@/components/common/CaptainAvatar'
import { accentBySlot } from '@/lib/auction/visuals'
import {
  fileToAvatarDataUrl,
  AVATAR_ACCEPT,
  type AvatarError,
} from '@/lib/utils/image'
import type { Team } from '@/types/database'

interface Props {
  team: Team
  onSave: (input: {
    captainName: string
    teamName: string
    avatarUrl?: string | null
  }) => Promise<boolean>
}

const ERRORS: Record<AvatarError, string> = {
  NOT_IMAGE: '사진 파일만 올릴 수 있습니다.',
  TOO_LARGE: '사진이 너무 큽니다. 조금 작은 파일로 올려 주세요.',
  DECODE_FAILED: '사진을 읽지 못했습니다. 다른 파일로 시도해 주세요.',
  ENCODE_FAILED: '사진을 처리하지 못했습니다.',
}

/**
 * 로비의 '내 프로필' — 경매에 들어가기 전에 팀장 사진과 이름을 정한다.
 *
 * 여기서 정한 사진이 경매판 팀 보드에 걸린다. 정하지 않으면 기본 표식이
 * 그대로 남는다.
 */
export function CaptainProfileCard({ team, onSave }: Props) {
  const accent = accentBySlot(team.slot_number)
  const fileRef = useRef<HTMLInputElement>(null)

  const [captainName, setCaptainName] = useState(team.captain_name)
  const [teamName, setTeamName] = useState(team.team_name)
  // undefined = 사진을 건드리지 않음, null = 지움, 문자열 = 새 사진
  const [draftAvatar, setDraftAvatar] = useState<string | null | undefined>(undefined)
  const [note, setNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 다른 창에서 고쳤을 때 따라간다 (아직 손대지 않은 칸만)
  useEffect(() => {
    setCaptainName((v) => (v === '' ? team.captain_name : v))
  }, [team.captain_name])

  const shown = draftAvatar === undefined ? team.captain_avatar_url : draftAvatar
  const dirty =
    draftAvatar !== undefined ||
    captainName.trim() !== team.captain_name ||
    teamName.trim() !== team.team_name

  async function pick(file: File | undefined) {
    if (!file) return
    setNote(null)
    const result = await fileToAvatarDataUrl(file)
    if (!result.ok) {
      setNote(ERRORS[result.error])
      return
    }
    setDraftAvatar(result.dataUrl)
    setSaved(false)
  }

  async function save() {
    if (!captainName.trim() || !teamName.trim()) return
    setSaving(true)
    setNote(null)
    const ok = await onSave({
      captainName: captainName.trim(),
      teamName: teamName.trim(),
      avatarUrl: draftAvatar,
    })
    setSaving(false)
    if (ok) {
      setDraftAvatar(undefined)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  return (
    <div className={`panel p-4 space-y-4 border ${accent.border}`}>
      <div className="flex items-center justify-between">
        <p className="text-sand-300 text-xs font-bold">내 프로필</p>
        <p className="text-ink-500 text-[11px]">경매판 팀 보드에 그대로 나옵니다</p>
      </div>

      <div className="flex gap-4">
        <div className="shrink-0 space-y-2">
          <CaptainAvatar
            name={captainName || team.captain_name}
            avatarUrl={shown}
            className={`w-24 h-24 rounded-xl border ${accent.border}`}
          />
          <div className="flex gap-1.5">
            <button
              onClick={() => fileRef.current?.click()}
              className="btn btn-ghost h-8 text-xs flex-1"
            >
              {shown ? '변경' : '사진 올리기'}
            </button>
            {shown && (
              <button
                onClick={() => {
                  setDraftAvatar(null)
                  setSaved(false)
                }}
                className="btn btn-ghost h-8 text-xs px-2"
                title="사진 지우기"
              >
                지우기
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={AVATAR_ACCEPT}
            className="hidden"
            onChange={(e) => {
              void pick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <label className="block">
            <span className="text-ink-400 text-[11px]">팀장 이름</span>
            <input
              value={captainName}
              onChange={(e) => {
                setCaptainName(e.target.value)
                setSaved(false)
              }}
              placeholder="팀장 이름"
              maxLength={20}
              className="field h-9 mt-0.5"
            />
          </label>
          <label className="block">
            <span className="text-ink-400 text-[11px]">팀 이름</span>
            <input
              value={teamName}
              onChange={(e) => {
                setTeamName(e.target.value)
                setSaved(false)
              }}
              placeholder="팀 이름"
              maxLength={20}
              className="field h-9 mt-0.5"
            />
          </label>
          <button
            onClick={save}
            disabled={saving || !dirty || !captainName.trim() || !teamName.trim()}
            className="btn btn-primary w-full h-9 text-sm"
          >
            {saving ? '저장 중...' : saved ? '✓ 저장됨' : '프로필 저장'}
          </button>
        </div>
      </div>

      {note && <p className="text-sand-200 text-[11px]">{note}</p>}
      {!shown && !note && (
        <p className="text-ink-500 text-[11px]">
          사진을 올리지 않으면 기본 표식이 그대로 나옵니다. 정사각형으로 잘려 저장됩니다.
        </p>
      )}
    </div>
  )
}
