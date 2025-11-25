export function calculateBalanceRatio(userBalance: number, trackedBalance: number): number {
  if (trackedBalance === 0) return 0
  return userBalance / trackedBalance
}

export function scaleSize(size: number, balanceRatio: number): number {
  return size * balanceRatio
}

export function formatScaledSize(size: number, decimals: number = 4): number {
  return parseFloat(size.toFixed(decimals))
}
