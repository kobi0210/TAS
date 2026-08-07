# TAS
자낳대 경매 시스템을 구현해보는 Next.js 프로젝트

## 진행
1. 방생성
2. 초대 코드 공유
3. 접속 / 선수 등록(csv일괄 등록)
4. 경매 시작

## 로컬서버

### 1. 환경 변수 설정

`.env.example`을 복사하여 `.env.local`을 만들고 값을 채운다. 
아래 예시

```bash
cp .env.example .env.local
```

필수 환경 변수: 

| 키 | 설명 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role 키 (서버 전용) |
| `NEXT_PUBLIC_SITE_URL` | 배포 URL (초대 링크 생성용) |
| `TOKEN_HASH_SECRET` | 토큰 해시용 비밀키 (긴 랜덤 문자열) |

> `TOKEN_HASH_SECRET`을 바꾸면 이미 발급된 초대 링크가 모두 무효가 됩니다.

### 2. 데이터베이스 마이그레이션

Supabase 대시보드 SQL 에디터에서 순서대로 실행 마이그레이션 폴더 파일들 순번대로 진행

### 3. 개발 서버 실행

```bash
npm install
npm run dev
```

`http://localhost:3000` 에서 확인 가능 하며

### 4. 배포

Vercel 이용하여 배포 가능하다~
