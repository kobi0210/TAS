export interface PlayerCsvRow {
  name: string
  nickname: string
  position: string
  tier: string
  description: string
  starting_bid: string
  image_url: string
}

// 헤더에 올 수 있는 다양한 표기를 실제 필드명으로 매핑
const HEADER_ALIASES: Record<string, keyof PlayerCsvRow> = {
  '이름': 'name', '선수명': 'name', '성명': 'name', 'name': 'name',
  '닉네임': 'nickname', '별명': 'nickname', '아이디': 'nickname', 'nickname': 'nickname',
  '포지션': 'position', '라인': 'position', 'position': 'position', 'lane': 'position',
  '티어': 'tier', '등급': 'tier', 'tier': 'tier',
  '소개': 'description', '설명': 'description', '비고': 'description', 'description': 'description',
  '시작가': 'starting_bid', '시작가격': 'starting_bid', '시작포인트': 'starting_bid',
  'starting_bid': 'starting_bid', 'startingbid': 'starting_bid', 'price': 'starting_bid',
  '이미지': 'image_url', '이미지url': 'image_url', '이미지주소': 'image_url', '사진': 'image_url',
  'image_url': 'image_url', 'imageurl': 'image_url', 'image': 'image_url',
}

const FIELD_ORDER: (keyof PlayerCsvRow)[] = [
  'name', 'nickname', 'position', 'tier', 'description', 'starting_bid', 'image_url',
]

function emptyRow(): PlayerCsvRow {
  return {
    name: '', nickname: '', position: '', tier: '',
    description: '', starting_bid: '', image_url: '',
  }
}

/**
 * 첫 줄이 헤더인지 판단한다.
 *
 * 한두 칸만 아는 이름과 겹쳐도 헤더로 단정하면 안 된다. 예를 들어
 * `홍길동,길동,미드,다이아,설명,50,` 은 '설명'이 별칭과 겹칠 뿐 데이터 행이다.
 * 그래서 이름 컬럼이 있고, 절반 이상이 아는 컬럼일 때만 헤더로 본다.
 */
function looksLikeHeader(cells: string[], mapped: (keyof PlayerCsvRow | null)[]): boolean {
  const filled = cells.filter((c) => c.trim().length > 0).length
  if (filled === 0) return false
  const known = mapped.filter((h) => h !== null).length
  return mapped.includes('name') && known * 2 >= filled
}

function normalizeHeader(raw: string): keyof PlayerCsvRow | null {
  const key = raw
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()[\]]/g, '')
  return HEADER_ALIASES[key] ?? null
}

/**
 * 업로드한 CSV 바이트를 문자열로 디코딩한다.
 *
 * 엑셀에서 "CSV(쉼표로 분리)"로 저장하면 한국어 윈도우 기준 CP949(EUC-KR)로
 * 저장된다. 이걸 UTF-8로 읽으면 글자가 전부 깨져서 "암호화된 것처럼" 보이고
 * 등록도 실패한다. BOM과 UTF-16까지 확인한 뒤, UTF-8로 읽히지 않으면
 * CP949로 다시 해석한다.
 */
export function decodeCsvBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }

  try {
    // fatal: 잘못된 UTF-8 시퀀스면 예외 → CP949로 넘어간다
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    for (const enc of ['euc-kr', 'windows-949', 'cp949']) {
      try {
        const text = new TextDecoder(enc).decode(bytes)
        if (!text.includes('�')) return text
      } catch {
        /* 지원하지 않는 인코딩 이름이면 다음 후보로 */
      }
    }
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** 헤더 행에서 구분자를 추론한다 (쉼표 / 탭 / 세미콜론). */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const counts: [string, number][] = [
    [',', (firstLine.match(/,/g) ?? []).length],
    ['\t', (firstLine.match(/\t/g) ?? []).length],
    [';', (firstLine.match(/;/g) ?? []).length],
  ]
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 0 ? counts[0][0] : ','
}

/**
 * 따옴표로 감싼 값과 줄바꿈이 섞인 CSV도 처리하는 파서.
 * (`"홍길동, 미드"` 처럼 값 안에 구분자가 들어가도 안전하다)
 */
export function parseCsvRows(text: string, delimiter = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\r') {
      // \r\n 은 아래 \n 에서 처리
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows.filter((r) => r.some((c) => c.trim().length > 0))
}

export function parseCsv(text: string): PlayerCsvRow[] {
  const clean = text.replace(/^﻿/, '').trim()
  if (!clean) return []

  const delimiter = detectDelimiter(clean)
  const rows = parseCsvRows(clean, delimiter)
  if (rows.length === 0) return []

  const mappedHeaders = rows[0].map(normalizeHeader)
  const hasHeader = looksLikeHeader(rows[0], mappedHeaders)

  // 헤더가 없으면 이름,닉네임,포지션,티어,소개,시작가,이미지 순서로 간주한다
  const headers = hasHeader ? mappedHeaders : FIELD_ORDER
  const dataRows = hasHeader ? rows.slice(1) : rows

  return dataRows
    .map((cols) => {
      const row = emptyRow()
      headers.forEach((field, i) => {
        if (field) row[field] = (cols[i] ?? '').trim()
      })
      return row
    })
    .filter((r) => r.name.length > 0) // 이름 없는 행은 무시
}

export function generateResultCsv(
  teams: { team_name: string; captain_name: string }[],
  players: { name: string; position: string | null; tier: string | null; sold_price: number | null; sold_team_id: string | null }[],
  teamMap: Record<string, string>
): string {
  const header = '팀명,팀장,선수명,포지션,티어,낙찰가'
  const rows = players
    .filter((p) => p.sold_team_id)
    .map((p) => {
      const team = teams.find((t) => teamMap[t.team_name] === p.sold_team_id)
      return [
        team?.team_name ?? '',
        team?.captain_name ?? '',
        p.name,
        p.position ?? '',
        p.tier ?? '',
        p.sold_price ?? 0,
      ].join(',')
    })
  return [header, ...rows].join('\n')
}
