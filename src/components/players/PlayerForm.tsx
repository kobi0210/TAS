'use client'

import { useState } from 'react'
import type { Player } from '@/types/database'

interface Props {
  defaultBid: number
  player?: Player
  onSubmit: (data: {
    name: string
    nickname: string
    position: string
    tier: string
    description: string
    imageUrl: string
    startingBid: number
  }) => Promise<void>
  onCancel?: () => void
}

export function PlayerForm({ defaultBid, player, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(player?.name ?? '')
  const [nickname, setNickname] = useState(player?.nickname ?? '')
  const [position, setPosition] = useState(player?.position ?? '')
  const [tier, setTier] = useState(player?.tier ?? '')
  const [description, setDescription] = useState(player?.description ?? '')
  const [imageUrl, setImageUrl] = useState(player?.image_url ?? '')
  const [startingBid, setStartingBid] = useState(player?.starting_bid ?? defaultBid)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    await onSubmit({ name, nickname, position, tier, description, imageUrl, startingBid })
    setLoading(false)
    if (!player) {
      setName('')
      setNickname('')
      setPosition('')
      setTier('')
      setDescription('')
      setImageUrl('')
      setStartingBid(defaultBid)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">이름 *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={30}
            className="field"
            placeholder="홍길동"
          />
        </div>
        <div>
          <label className="label">닉네임</label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            className="field"
            placeholder="길동이"
          />
        </div>
        <div>
          <label className="label">포지션</label>
          <input
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            maxLength={20}
            className="field"
            placeholder="미드, 탑..."
          />
        </div>
        <div>
          <label className="label">티어</label>
          <input
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            maxLength={20}
            className="field"
            placeholder="다이아, 플래티넘..."
          />
        </div>
      </div>
      <div>
        <label className="label">소개</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          className="field h-auto py-2 resize-none"
          rows={2}
          placeholder="선수 소개..."
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">이미지 URL</label>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            maxLength={500}
            className="field"
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="label">시작 입찰가</label>
          <input
            type="number"
            value={startingBid}
            onChange={(e) => setStartingBid(Number(e.target.value))}
            min={1}
            className="field font-mono"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading || !name.trim()} className="btn btn-primary flex-1">
          {loading ? '저장 중...' : player ? '수정 저장' : '선수 추가'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-ghost flex-1">
            취소
          </button>
        )}
      </div>
    </form>
  )
}
