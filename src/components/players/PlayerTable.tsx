'use client'

import { useState } from 'react'
import { PlayerForm } from './PlayerForm'
import { PlayerAvatar } from '@/components/auction/PlayerAvatar'
import { formatPoints } from '@/lib/auction/rules'
import type { Player } from '@/types/database'

interface Props {
  players: Player[]
  defaultBid: number
  onUpdate: (
    player: Player,
    data: {
      name: string
      nickname: string
      position: string
      tier: string
      description: string
      imageUrl: string
      startingBid: number
    }
  ) => Promise<void>
  onDelete: (playerId: string) => Promise<void>
  onReset?: (playerId: string) => Promise<void>
}

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  sold: { text: '낙찰', className: 'bg-sand-500 text-ink-950' },
  active: { text: '경매 중', className: 'bg-pine-500 text-ink-50' },
  unsold: { text: '유찰', className: 'bg-ink-700 text-ink-300' },
  cancelled: { text: '취소', className: 'bg-ink-700 text-ink-300' },
}

export function PlayerTable({ players, defaultBid, onUpdate, onDelete, onReset }: Props) {
  const [editId, setEditId] = useState<string | null>(null)

  const sorted = [...players].sort((a, b) => a.auction_order - b.auction_order)

  return (
    <div className="space-y-2">
      {sorted.length === 0 && (
        <div className="panel text-center text-ink-400 py-8 text-sm">
          아직 등록된 선수가 없습니다.
        </div>
      )}
      {sorted.map((player) => {
        const status = STATUS_LABEL[player.status]
        return (
          <div key={player.id} className="panel overflow-hidden">
            {editId === player.id ? (
              <div className="p-4">
                <PlayerForm
                  defaultBid={defaultBid}
                  player={player}
                  onSubmit={async (data) => {
                    await onUpdate(player, data)
                    setEditId(null)
                  }}
                  onCancel={() => setEditId(null)}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3">
                <div className="text-ink-500 font-mono text-xs w-6 text-center shrink-0">
                  {player.auction_order}
                </div>
                <PlayerAvatar player={player} size="sm" className="shrink-0 w-10 h-10" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-ink-50 font-medium text-sm">{player.name}</span>
                    {player.nickname && (
                      <span className="text-ink-400 text-xs">({player.nickname})</span>
                    )}
                    {player.tier && (
                      <span className="text-[10px] bg-iris-900 text-iris-200 px-1.5 py-0.5 rounded">
                        {player.tier}
                      </span>
                    )}
                    {player.position && (
                      <span className="text-[10px] bg-pine-900 text-pine-200 px-1.5 py-0.5 rounded">
                        {player.position}
                      </span>
                    )}
                    {status && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${status.className}`}>
                        {status.text}
                      </span>
                    )}
                  </div>
                  <div className="text-ink-500 text-xs mt-0.5 font-mono">
                    시작가 {formatPoints(player.starting_bid)}
                    {player.status === 'sold' && player.sold_price != null && (
                      <span className="text-sand-300"> · 낙찰 {formatPoints(player.sold_price)}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {player.status === 'pending' && (
                    <button onClick={() => setEditId(player.id)} className="btn btn-ghost h-8 px-3 text-xs">
                      수정
                    </button>
                  )}
                  {(player.status === 'sold' || player.status === 'unsold') && onReset && (
                    <button
                      onClick={() => onReset(player.id)}
                      className="btn btn-iris h-8 px-3 text-xs"
                    >
                      초기화
                    </button>
                  )}
                  {player.status === 'pending' && (
                    <button
                      onClick={() => onDelete(player.id)}
                      className="btn btn-mauve h-8 px-3 text-xs"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
