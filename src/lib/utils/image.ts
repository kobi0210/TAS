/**
 * 팀장 프로필 사진 처리.
 *
 * 사진은 브라우저에서 정사각형으로 잘라 작게 줄인 뒤 data URI 로 만든다.
 * 원본을 그대로 올리면 방 상태를 내려줄 때마다 수백 KB 가 실려 나가므로,
 * 화면에 쓰이는 크기(128px)까지 줄여서 5KB 안팎으로 맞춘다.
 */

/** 저장 한도 — 0006 마이그레이션의 컬럼 제약과 같은 값 */
export const AVATAR_MAX_CHARS = 60_000

/** 화면에 쓰는 크기. 이보다 크게 보일 일이 없다. */
export const AVATAR_SIZE = 128

export const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

/** 원본 파일 자체가 지나치게 크면 읽기 전에 막는다 */
export const AVATAR_SOURCE_MAX_BYTES = 12 * 1024 * 1024

const DATA_URI = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/

/**
 * 서버가 받아도 되는 값인지 본다.
 *
 * 우리가 만든 data URI 만 허용한다. 바깥 주소를 그대로 저장하면 화면을 여는
 * 사람마다 그 주소로 요청이 나가므로 받지 않는다.
 */
export function isStorableAvatar(value: string): boolean {
  if (value.length > AVATAR_MAX_CHARS) return false
  return DATA_URI.test(value)
}

/** 정사각형으로 가운데를 잘라낼 좌표를 구한다 (짧은 변 기준). */
export function coverCrop(
  width: number,
  height: number
): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height)
  return {
    sx: Math.round((width - size) / 2),
    sy: Math.round((height - size) / 2),
    size,
  }
}

/** 브라우저가 webp 를 못 만들면 jpeg 로 떨어진다. */
function encode(canvas: HTMLCanvasElement, quality: number): string {
  const webp = canvas.toDataURL('image/webp', quality)
  if (webp.startsWith('data:image/webp')) return webp
  return canvas.toDataURL('image/jpeg', quality)
}

export type AvatarError = 'NOT_IMAGE' | 'TOO_LARGE' | 'DECODE_FAILED' | 'ENCODE_FAILED'

/**
 * 파일을 128x128 data URI 로 바꾼다.
 *
 * 한도를 넘으면 화질을 낮춰 다시 만든다. 그래도 안 되면 실패로 돌려준다.
 */
export async function fileToAvatarDataUrl(file: File): Promise<
  { ok: true; dataUrl: string } | { ok: false; error: AvatarError }
> {
  if (!file.type.startsWith('image/')) return { ok: false, error: 'NOT_IMAGE' }
  if (file.size > AVATAR_SOURCE_MAX_BYTES) return { ok: false, error: 'TOO_LARGE' }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { ok: false, error: 'DECODE_FAILED' }
  }

  try {
    const { sx, sy, size } = coverCrop(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return { ok: false, error: 'ENCODE_FAILED' }

    // 투명 png 도 어두운 판 위에 얹어 테두리가 깨져 보이지 않게 한다
    ctx.fillStyle = '#12100c'
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE)

    for (const quality of [0.8, 0.6, 0.45]) {
      const dataUrl = encode(canvas, quality)
      if (dataUrl.length <= AVATAR_MAX_CHARS) return { ok: true, dataUrl }
    }
    return { ok: false, error: 'TOO_LARGE' }
  } finally {
    bitmap.close()
  }
}
