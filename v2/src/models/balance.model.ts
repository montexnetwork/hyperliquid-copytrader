export interface CrossMarginSummary {
  accountValue: string
  totalNtlPos: string
  totalRawUsd: string
  totalMarginUsed: string
}

export interface Balance {
  accountValue: string
  withdrawable: string
  totalMarginUsed: string
  crossMaintenanceMarginUsed: string
  totalNtlPos: string
  totalRawUsd: string
  crossMarginSummary: CrossMarginSummary
  timestamp: number
}
