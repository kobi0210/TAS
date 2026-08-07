import { describe, it, expect } from 'vitest'
import { coverCrop, isStorableAvatar, AVATAR_MAX_CHARS } from './image'

const dataUrl = (mime: string, chars = 40) =>
  `data:image/${mime};base64,${'A'.repeat(chars)}`

describe('coverCrop', () => {
  it('정사각형은 그대로 쓴다', () => {
    expect(coverCrop(500, 500)).toEqual({ sx: 0, sy: 0, size: 500 })
  })

  it('가로로 긴 사진은 좌우를 잘라 가운데를 남긴다', () => {
    expect(coverCrop(1000, 400)).toEqual({ sx: 300, sy: 0, size: 400 })
  })

  it('세로로 긴 사진은 위아래를 잘라 가운데를 남긴다', () => {
    expect(coverCrop(400, 1000)).toEqual({ sx: 0, sy: 300, size: 400 })
  })

  it('홀수 차이는 반올림해서 한쪽으로 치우치지 않게 한다', () => {
    expect(coverCrop(101, 100)).toEqual({ sx: 1, sy: 0, size: 100 })
  })
})

describe('isStorableAvatar', () => {
  it('우리가 만든 data URI 는 받는다', () => {
    expect(isStorableAvatar(dataUrl('webp'))).toBe(true)
    expect(isStorableAvatar(dataUrl('jpeg'))).toBe(true)
    expect(isStorableAvatar(dataUrl('png'))).toBe(true)
  })

  it('바깥 주소는 받지 않는다', () => {
    // 저장해 두면 화면을 여는 사람마다 그 주소로 요청이 나간다
    expect(isStorableAvatar('https://example.com/a.png')).toBe(false)
    expect(isStorableAvatar('http://10.0.0.1/internal.png')).toBe(false)
    expect(isStorableAvatar('/teams/captain-default.svg')).toBe(false)
  })

  it('svg 나 스크립트가 섞인 data URI 는 받지 않는다', () => {
    expect(isStorableAvatar('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(false)
    expect(isStorableAvatar('data:text/html;base64,PHNjcmlwdD4=')).toBe(false)
    expect(isStorableAvatar(`javascript:alert(1)`)).toBe(false)
  })

  it('base64 가 아닌 형태는 받지 않는다', () => {
    expect(isStorableAvatar('data:image/png,rawbytes')).toBe(false)
    expect(isStorableAvatar('data:image/png;base64,AA<script>')).toBe(false)
  })

  it('한도를 넘으면 받지 않는다', () => {
    expect(isStorableAvatar(dataUrl('webp', AVATAR_MAX_CHARS))).toBe(false)
    expect(isStorableAvatar(dataUrl('webp', 100))).toBe(true)
  })

  it('빈 값은 받지 않는다', () => {
    expect(isStorableAvatar('')).toBe(false)
    expect(isStorableAvatar('data:image/png;base64,')).toBe(false)
  })
})
