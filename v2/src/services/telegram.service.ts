import TelegramBot from 'node-telegram-bot-api'
import { DriftReport, Position } from '@/models'
import { config } from '@/config'
import { MonitorSnapshot } from './balance-monitor.service'

export class TelegramService {
  private bot: TelegramBot | null = null
  private chatId: string | null = null
  private enabled: boolean = false
  private lastSnapshot: MonitorSnapshot | null = null
  private startTime: number = Date.now()

  constructor() {
    if (config.telegramBotToken && config.telegramChatId) {
      this.bot = new TelegramBot(config.telegramBotToken, { polling: true })
      this.chatId = config.telegramChatId
      this.enabled = true
      this.setupCommands()
      this.setupErrorHandlers()
    }
  }

  private setupErrorHandlers(): void {
    if (!this.bot) return

    this.bot.on('polling_error', (error) => {
      console.error('Telegram polling error:', error.message)
    })

    this.bot.on('error', (error) => {
      console.error('Telegram bot error:', error.message)
    })
  }

  private setupCommands(): void {
    if (!this.bot) return

    this.bot.onText(/\/status/, (msg) => {
      if (msg.chat.id.toString() === this.chatId) {
        this.sendStatus()
      }
    })

    this.bot.onText(/\/start/, (msg) => {
      if (msg.chat.id.toString() === this.chatId) {
        const message =
          '🤖 *Copyscalper v2*\n\n' +
          'Commands:\n' +
          '/status - View account status\n' +
          '/start - Show this help\n\n' +
          'You will receive alerts when:\n' +
          '• Position drift is detected'
        this.sendMessage(message)
      }
    })
  }

  updateSnapshot(snapshot: MonitorSnapshot): void {
    this.lastSnapshot = snapshot
  }

  private async sendStatus(): Promise<void> {
    if (!this.lastSnapshot) {
      await this.sendMessage('⚠️ No data available yet')
      return
    }

    const s = this.lastSnapshot
    const uptimeMs = Date.now() - this.startTime
    const uptimeMinutes = Math.floor(uptimeMs / 60000)
    const uptimeStr = uptimeMinutes >= 60
      ? `${Math.floor(uptimeMinutes / 60)}h ${uptimeMinutes % 60}m`
      : `${uptimeMinutes}m`

    const trackedValue = parseFloat(s.trackedBalance.accountValue)
    const userValue = parseFloat(s.userBalance.accountValue)

    let message = '📊 *Account Status*\n\n'
    message += '*TRACKED*\n'
    message += `Balance: $${trackedValue.toFixed(2)}\n`
    message += `Positions: ${s.trackedPositions.length}\n\n`
    message += '*USER*\n'
    message += `Balance: $${userValue.toFixed(2)}\n`
    message += `Positions: ${s.userPositions.length}\n`
    message += `Ratio: ${s.balanceRatio.toFixed(4)}\n\n`

    if (s.userPositions.length > 0) {
      message += '*POSITIONS*\n'
      for (const pos of s.userPositions) {
        message += this.formatPosition(pos)
      }
    }

    message += `\n*Uptime:* ${uptimeStr}`

    await this.sendMessage(message)
  }

  private formatPosition(pos: Position): string {
    const pnlSign = pos.unrealizedPnl >= 0 ? '+' : ''
    return `• ${pos.coin} ${pos.side.toUpperCase()} ${pos.leverage}x | ${pnlSign}$${pos.unrealizedPnl.toFixed(2)}\n`
  }

  async sendDriftAlert(driftReport: DriftReport): Promise<void> {
    if (!this.enabled) return

    let message = `⚠️ *Position Drift Detected*\n\n`
    message += `Found ${driftReport.drifts.length} drift(s):\n\n`

    for (const drift of driftReport.drifts) {
      const favorableStr = drift.isFavorable ? '✓ sync' : '✗ skip'
      message += `*${drift.coin}*\n`
      message += `├ Type: ${drift.driftType.replace('_', ' ')}\n`
      message += `├ Diff: ${drift.sizeDiffPercent.toFixed(1)}%\n`
      message += `└ Action: ${favorableStr}\n\n`
    }

    const favorableCount = driftReport.drifts.filter(d => d.isFavorable).length
    if (favorableCount > 0) {
      message += `_Syncing ${favorableCount} favorable position(s)..._`
    } else {
      message += `_No favorable sync opportunities_`
    }

    await this.sendMessage(message)
  }

  async sendMonitoringStarted(): Promise<void> {
    if (!this.enabled) return

    const message =
      '🚀 *Monitoring Started*\n\n' +
      `Tracked: \`${this.formatAddress(config.trackedWallet)}\`\n` +
      `User: \`${this.formatAddress(config.userWallet)}\`\n\n` +
      'Use /status to check positions'

    await this.sendMessage(message)
  }

  async sendError(error: string): Promise<void> {
    if (!this.enabled) return
    await this.sendMessage(`❌ *Error*\n\n${error}`)
  }

  private formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.bot || !this.chatId) return

    try {
      await this.bot.sendMessage(this.chatId, text, { parse_mode: 'Markdown' })
    } catch (error) {
      console.error('Failed to send Telegram message:', error instanceof Error ? error.message : error)
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  async stop(): Promise<void> {
    if (this.bot) {
      await this.bot.stopPolling()
    }
  }
}
