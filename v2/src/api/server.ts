import express, { Request, Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'

const app = express()
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000
const HOST = '0.0.0.0'
const DATA_DIR = path.join(__dirname, '../../data')
const FRONTEND_DIR = path.join(__dirname, '../../frontend')

app.use(express.static(FRONTEND_DIR))

app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'))
})

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    version: 'v2'
  })
})

app.get('/api/snapshots', (req: Request, res: Response) => {
  try {
    const dateParam = req.query.date as string
    const targetDate = dateParam || new Date().toISOString().split('T')[0]
    const filePath = path.join(DATA_DIR, `snapshots-${targetDate}.jsonl`)

    if (!fs.existsSync(filePath)) {
      return res.json({ snapshots: [], count: 0, date: targetDate })
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    const snapshots = content
      .trim()
      .split('\n')
      .filter(line => line)
      .map(line => JSON.parse(line))
      .sort((a, b) => a.timestamp - b.timestamp)

    res.json({ snapshots, count: snapshots.length, date: targetDate })
  } catch (error) {
    res.status(500).json({ error: 'Failed to read snapshots' })
  }
})

app.get('/api/trades', (req: Request, res: Response) => {
  try {
    const dateParam = req.query.date as string
    const targetDate = dateParam || new Date().toISOString().split('T')[0]
    const filePath = path.join(DATA_DIR, `trades-${targetDate}.jsonl`)

    if (!fs.existsSync(filePath)) {
      return res.json({ trades: [], count: 0, date: targetDate })
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    const trades = content
      .trim()
      .split('\n')
      .filter(line => line)
      .map(line => JSON.parse(line))
      .sort((a, b) => a.timestamp - b.timestamp)

    res.json({ trades, count: trades.length, date: targetDate })
  } catch (error) {
    res.status(500).json({ error: 'Failed to read trades' })
  }
})

app.get('/api/daily-summary', (req: Request, res: Response) => {
  try {
    const daysParam = req.query.days as string
    const numDays = daysParam ? parseInt(daysParam) : 7
    const dailySummary: Array<Record<string, unknown>> = []
    const today = new Date()

    for (let i = 0; i < numDays; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      const filePath = path.join(DATA_DIR, `snapshots-${dateStr}.jsonl`)

      let hasData = false
      let startBalance = 0
      let endBalance = 0
      let totalPnl = 0
      let pnlPercentage = 0

      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8')
        const lines = content.trim().split('\n').filter(line => line)

        if (lines.length > 0) {
          hasData = true
          const first = JSON.parse(lines[0])
          const last = JSON.parse(lines[lines.length - 1])

          startBalance = first.user?.accountValue || 0
          endBalance = last.user?.accountValue || 0
          totalPnl = endBalance - startBalance
          pnlPercentage = startBalance > 0 ? (totalPnl / startBalance) * 100 : 0
        }
      }

      dailySummary.push({
        date: dateStr,
        hasData,
        startBalance,
        endBalance,
        totalPnl,
        pnlPercentage
      })
    }

    res.json({ days: dailySummary, count: dailySummary.length })
  } catch (error) {
    res.status(500).json({ error: 'Failed to read daily summary' })
  }
})

export function startServer(): void {
  app.listen(PORT, HOST, () => {
    console.log(`📊 Dashboard API running on ${HOST}:${PORT}`)
  })
}

if (require.main === module) {
  startServer()
}
