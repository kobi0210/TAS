export function calcMinBid(currentBid: number | null, startingBid: number, increment: number): number {
  if (currentBid === null) return startingBid
  return currentBid + increment
}

export function calcMaxAffordable(
  remainingPoints: number,
  remainingSlots: number,
  minBid: number
): number {
  const reserved = Math.max(remainingSlots - 1, 0) * minBid
  return remainingPoints - reserved
}

export function formatPoints(n: number): string {
  return n.toLocaleString('ko-KR')
}
