'use client'

import { useState, useRef, useMemo } from 'react'
import { parseCsv, decodeCsvBytes } from '@/lib/utils/csv'

interface Props {
  defaultBid: number
  onImport: (
    rows: {
      name: string
      nickname: string
      position: string
      tier: string
      description: string
      imageUrl: string
      startingBid: number
    }[]
  ) => Promise<{ ok: boolean; error?: string | null; inserted?: number }>
  onClose: () => void
}

const EXAMPLE = `이름,닉네임,포지션,티어,소개,시작가,이미지URL
홍길동,길동,미드,다이아,공격적인 라인전,10,
김철수,철수,정글,플래티넘,오브젝트 설계,20,`

export function CsvImportDialog({ defaultBid, onImport, onClose }: Props) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [encoding, setEncoding] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const preview = useMemo(() => (text.trim() ? parseCsv(text) : []), [text])

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError('')
    try {
      // 엑셀이 저장한 CP949 파일도 읽어야 하므로 바이트로 받아 직접 디코딩한다.
      const buffer = await file.arrayBuffer()
      const decoded = decodeCsvBytes(buffer)
      setText(decoded)
      setEncoding(looksGarbled(decoded) ? '깨짐' : 'ok')
    } catch {
      setError('파일을 읽는 데 실패했습니다.')
    } finally {
      // 같은 파일을 다시 선택해도 change 이벤트가 발생하도록 초기화
      e.target.value = ''
    }
  }

  async function handleImport() {
    const rows = parseCsv(text)
    if (rows.length === 0) {
      setError('유효한 행이 없습니다. 첫 줄에 헤더(이름, 닉네임, ...)가 있는지 확인해 주세요.')
      return
    }
    if (rows.length > 200) {
      setError('한 번에 최대 200명까지 등록할 수 있습니다.')
      return
    }

    setLoading(true)
    setError('')
    const result = await onImport(
      rows.map((r) => ({
        name: r.name.slice(0, 30),
        nickname: r.nickname.slice(0, 20),
        position: r.position.slice(0, 20),
        tier: r.tier.slice(0, 20),
        description: r.description.slice(0, 200),
        imageUrl: r.image_url.slice(0, 500),
        startingBid: parsePoints(r.starting_bid) ?? defaultBid,
      }))
    )
    setLoading(false)

    if (!result.ok) {
      setError(result.error ?? '등록에 실패했습니다.')
      return
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="panel w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div>
          <h3 className="text-ink-50 font-bold text-lg">CSV 일괄 등록</h3>
          <p className="text-ink-300 text-xs mt-1">
            엑셀에서 저장한 파일(CP949)도 그대로 올릴 수 있습니다.
          </p>
        </div>

        <pre className="text-[11px] bg-ink-900 border border-ink-700 rounded-lg p-3 text-ink-300 overflow-x-auto leading-relaxed">
          {EXAMPLE}
        </pre>

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => fileInputRef.current?.click()} className="btn btn-ghost shrink-0">
            CSV 파일 선택
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            onChange={handleFileSelect}
            className="hidden"
          />
          {fileName && (
            <span className="text-ink-300 text-xs truncate max-w-[45%]">{fileName}</span>
          )}
          {encoding === '깨짐' && (
            <span className="text-mauve-300 text-xs">
              글자가 깨져 보이면 엑셀에서 &lsquo;CSV UTF-8&rsquo;로 다시 저장해 주세요.
            </span>
          )}
        </div>

        <div>
          <p className="text-ink-400 text-xs mb-1.5">또는 아래에 직접 붙여넣기</p>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setFileName('')
              setEncoding('')
              setError('')
            }}
            rows={7}
            placeholder="위 형식에 맞게 CSV를 붙여넣으세요..."
            className="field h-auto w-full py-2 resize-none font-mono-plain text-xs leading-relaxed"
          />
        </div>

        {preview.length > 0 && (
          <div className="border border-ink-700 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-ink-800 text-xs text-sand-300 font-bold">
              미리보기 · {preview.length}명 인식됨
            </div>
            <div className="max-h-44 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-ink-400">
                  <tr className="border-b border-ink-700">
                    <th className="text-left px-3 py-1.5 font-medium">이름</th>
                    <th className="text-left px-3 py-1.5 font-medium">닉네임</th>
                    <th className="text-left px-3 py-1.5 font-medium">포지션</th>
                    <th className="text-left px-3 py-1.5 font-medium">티어</th>
                    <th className="text-right px-3 py-1.5 font-medium">시작가</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 30).map((r, i) => (
                    <tr key={i} className="border-b border-ink-800 last:border-0">
                      <td className="px-3 py-1.5 text-ink-50">{r.name}</td>
                      <td className="px-3 py-1.5 text-ink-300">{r.nickname || '-'}</td>
                      <td className="px-3 py-1.5 text-ink-300">{r.position || '-'}</td>
                      <td className="px-3 py-1.5 text-iris-300">{r.tier || '-'}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-sand-300">
                        {parsePoints(r.starting_bid) ?? defaultBid}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && (
          <p className="text-mauve-300 text-sm bg-mauve-900/40 border border-mauve-700 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-ghost">
            취소
          </button>
          <button
            onClick={handleImport}
            disabled={loading || preview.length === 0}
            className="btn btn-primary"
          >
            {loading ? '등록 중...' : `${preview.length}명 등록`}
          </button>
        </div>
      </div>
    </div>
  )
}

/** "1,000" / "1000점" 같은 표기도 숫자로 받아들인다. */
function parsePoints(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** 인코딩이 어긋났을 때 흔히 나오는 대체 문자를 감지한다. */
function looksGarbled(text: string): boolean {
  const sample = text.slice(0, 2000)
  return sample.includes('�')
}
