export interface UserFillData {
  coin: string
  tid: number | string
  px: string
  side: string
  time: number
  sz?: string
  dir?: string
  closedPnl?: string
  hash?: string
  oid?: number
  crossed?: boolean
  fee?: string
  liquidation?: boolean
  startPosition?: string
}

export type FillProcessor = (fill: UserFillData, connectionId: number) => Promise<void>

export type TradeAction = 'open' | 'close' | 'add' | 'reduce' | 'reverse'
