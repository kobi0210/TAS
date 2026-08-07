export function getSecondsLeft(endsAt: string | null): number {
  if (!endsAt) return 0
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000))
}
