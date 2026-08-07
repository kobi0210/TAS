/**
 * public/positions/*.svg 원본을 그대로 읽어 PositionGlyph.tsx 를 생성한다.
 *
 * 손으로 옮겨 적으면 좌표가 어긋나므로, 원본 파일을 유일한 출처로 두고
 * JSX 로 쓸 수 있게 속성 이름만 바꿔 넣는다. 경로·색·투명도는 손대지 않는다.
 *
 *   node scripts/generate-position-glyphs.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHAPES = ['top', 'jungle', 'mid', 'bot', 'support']

/** kebab-case 속성과 style="" 을 JSX 형태로 바꾼다. 값 자체는 그대로 둔다. */
function toJsx(markup) {
  let out = markup

  // style="a:b;c:d" → style={{ a: 'b', c: 'd' }}
  out = out.replace(/style="([^"]*)"/g, (_, css) => {
    const props = css
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((decl) => {
        const i = decl.indexOf(':')
        const name = decl.slice(0, i).trim().replace(/-([a-z])/g, (_m, c) => c.toUpperCase())
        const value = decl.slice(i + 1).trim()
        return `${name}: '${value}'`
      })
    return `style={{ ${props.join(', ')} }}`
  })

  // fill-rule / clip-rule / stroke-width ... → camelCase
  out = out.replace(
    /\s(fill-rule|clip-rule|stroke-width|stroke-linecap|stroke-linejoin|fill-opacity|stroke-opacity|stroke-dasharray)=/g,
    (_, name) => ' ' + name.replace(/-([a-z])/g, (_m, c) => c.toUpperCase()) + '='
  )

  // 자기 종료 태그 보정 (원본은 이미 XML 형식이라 대부분 불필요)
  return out.trim()
}

/** <svg ...> 안쪽만 뽑는다 (width/height 는 컴포넌트가 정한다). */
function innerOf(svg) {
  const m = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)
  if (!m) throw new Error('svg 본문을 찾지 못했습니다')
  return m[1]
}

function viewBoxOf(svg) {
  const m = svg.match(/viewBox="([^"]+)"/)
  return m ? m[1] : '0 0 136 136'
}

const cases = SHAPES.map((name) => {
  const raw = readFileSync(join(root, 'public', 'positions', `${name}.svg`), 'utf8')
  const body = toJsx(innerOf(raw))
    .split('\n')
    .map((l) => '          ' + l.trim())
    .join('\n')
  return { name, viewBox: viewBoxOf(raw), body }
})

const file = `/**
 * 포지션 표식 — 탑 · 정글 · 미드 · 원딜 · 서포터.
 *
 * 이 파일은 자동 생성됩니다. 직접 고치지 마세요.
 * 원본은 public/positions/*.svg 이며, 아래 명령으로 다시 만듭니다.
 *
 *   node scripts/generate-position-glyphs.mjs
 *
 * 원본 도형을 그대로 쓰기 때문에 색도 원본(금색·갈색)을 따릅니다.
 * currentColor 로 물들지 않습니다.
 */

type Shape = ${SHAPES.map((s) => `'${s}'`).join(' | ')} | 'blank'

const ALIASES: Record<string, Shape> = {
  탑: 'top', top: 'top', 탑라인: 'top',
  정글: 'jungle', jungle: 'jungle', jg: 'jungle', 정글러: 'jungle',
  미드: 'mid', mid: 'mid', middle: 'mid',
  원딜: 'bot', 바텀: 'bot', bot: 'bot', adc: 'bot', ad: 'bot', 봇: 'bot',
  서폿: 'support', 서포터: 'support', support: 'support', sup: 'support',
}

function shapeOf(position: string | null | undefined): Shape {
  if (!position) return 'blank'
  const key = position.trim().toLowerCase().replace(/\\s+/g, '')
  return ALIASES[key] ?? 'blank'
}

interface Props {
  position?: string | null
  size?: number
  className?: string
}

export function PositionGlyph({ position, size = 16, className = '' }: Props) {
  const shape = shapeOf(position)

  switch (shape) {
${cases
  .map(
    (c) => `    case '${c.name}':
      return (
        <svg width={size} height={size} viewBox="${c.viewBox}" className={className} aria-hidden>
${c.body}
        </svg>
      )
`
  )
  .join('\n')}
    default:
      // 알 수 없는 포지션 — 자리만 차지하는 점
      return (
        <svg width={size} height={size} viewBox="0 0 136 136" className={className} aria-hidden>
          <circle cx="68" cy="68" r="14" fill="currentColor" />
        </svg>
      )
  }
}

/** 팀 정원 슬롯을 채울 때 자리마다 다른 기호를 돌려쓴다. */
const SLOT_ORDER: string[] = ['탑', '정글', '미드', '원딜', '서폿']

export function slotPosition(index: number): string {
  return SLOT_ORDER[index % SLOT_ORDER.length]
}
`

writeFileSync(join(root, 'src', 'components', 'auction', 'PositionGlyph.tsx'), file)
console.log(`generated PositionGlyph.tsx from ${SHAPES.length} originals`)
