import { createHmac, randomBytes } from 'crypto'

const secret = process.env.TOKEN_HASH_SECRET ?? 'dev-secret'

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
  return createHmac('sha256', secret).update(token).digest('hex')
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
