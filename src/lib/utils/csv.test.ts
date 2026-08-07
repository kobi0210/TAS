import { describe, it, expect } from 'vitest'
import { parseCsv, parseCsvRows, decodeCsvBytes } from './csv'

/** 파이썬/엑셀이 만들어내는 CP949 바이트를 그대로 흉내 낸다. */
function cp949(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)))
  return bytes.buffer
}

function utf8(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer
}

describe('decodeCsvBytes', () => {
  it('UTF-8 파일을 그대로 읽는다', () => {
    expect(decodeCsvBytes(utf8('이름,닉네임\n홍길동,길동'))).toBe('이름,닉네임\n홍길동,길동')
  })

  it('UTF-8 BOM을 제거한다', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('이름')])
    expect(decodeCsvBytes(withBom.buffer as ArrayBuffer)).toBe('이름')
  })

  it('엑셀이 저장한 CP949 파일도 깨지지 않게 읽는다', () => {
    // "이름,닉네임\n홍길동,길동" 을 CP949로 인코딩한 바이트
    const bytes = 'c0ccb8a72cb4d0b3d7c0d30ac8abb1e6b5bf2cb1e6b5bf'
    expect(decodeCsvBytes(cp949(bytes))).not.toContain('�')
  })

  it('CP949 한글 본문을 정확히 복원한다', () => {
    // "홍길동" (CP949: c8ab b1e6 b5bf)
    expect(decodeCsvBytes(cp949('c8abb1e6b5bf'))).toBe('홍길동')
  })
})

describe('parseCsvRows', () => {
  it('따옴표로 감싼 값 안의 구분자를 지킨다', () => {
    const rows = parseCsvRows('a,"b,c",d', ',')
    expect(rows).toEqual([['a', 'b,c', 'd']])
  })

  it('이스케이프된 따옴표를 처리한다', () => {
    expect(parseCsvRows('"그는 ""왕"" 이다",x', ',')).toEqual([['그는 "왕" 이다', 'x']])
  })

  it('CRLF 줄바꿈을 처리한다', () => {
    expect(parseCsvRows('a,b\r\nc,d\r\n', ',')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })
})

describe('parseCsv', () => {
  it('한글 헤더를 필드로 매핑한다', () => {
    const rows = parseCsv('이름,닉네임,포지션,티어,소개,시작가,이미지URL\n홍길동,길동,미드,다이아,설명,50,https://x/y.png')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      name: '홍길동',
      nickname: '길동',
      position: '미드',
      tier: '다이아',
      description: '설명',
      starting_bid: '50',
      image_url: 'https://x/y.png',
    })
  })

  it('영문 헤더와 순서가 뒤바뀐 컬럼도 매핑한다', () => {
    const rows = parseCsv('position,name,starting_bid\n정글,이선생,30')
    expect(rows[0].name).toBe('이선생')
    expect(rows[0].position).toBe('정글')
    expect(rows[0].starting_bid).toBe('30')
  })

  it('헤더가 없으면 기본 컬럼 순서로 읽는다', () => {
    const rows = parseCsv('홍길동,길동,미드,다이아,설명,50,')
    expect(rows[0].name).toBe('홍길동')
    expect(rows[0].tier).toBe('다이아')
  })

  it('탭으로 구분된 파일도 읽는다', () => {
    const rows = parseCsv('이름\t포지션\n노페\t서폿')
    expect(rows[0]).toMatchObject({ name: '노페', position: '서폿' })
  })

  it('BOM과 빈 줄, 이름 없는 행을 무시한다', () => {
    const rows = parseCsv('﻿이름,포지션\n\n크캣,원딜\n,미드\n')
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('크캣')
  })

  it('CP949 파일을 디코딩한 뒤 파싱까지 이어진다', () => {
    // "이름,포지션\n홍길동,미드" (CP949)
    const bytes = 'c0ccb8a72cc6f7c1f6bcc70ac8abb1e6b5bf2cb9ccb5e5'
    const rows = parseCsv(decodeCsvBytes(cp949(bytes)))
    expect(rows).toEqual([
      {
        name: '홍길동',
        nickname: '',
        position: '미드',
        tier: '',
        description: '',
        starting_bid: '',
        image_url: '',
      },
    ])
  })
})
