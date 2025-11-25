import { UserFillData, FillProcessor } from '@/models'

export class FillQueueService {
  private processedTids: Set<string> = new Set()
  private fillProcessor: FillProcessor | null = null
  private readonly MAX_PROCESSED_TIDS = 1000

  setFillProcessor(processor: FillProcessor): void {
    this.fillProcessor = processor
  }

  enqueueFill(fill: UserFillData, connectionId: number): void {
    const tidString = String(fill.tid)

    if (this.processedTids.has(tidString)) {
      console.log(`  ⊘ Duplicate fill dropped (TID: ${fill.tid}, Connection: ${connectionId})`)
      return
    }

    this.processedTids.add(tidString)
    this.trimProcessedTids()

    if (this.fillProcessor) {
      this.fillProcessor(fill, connectionId).catch(error => {
        console.error(`✗ Error processing fill: ${error instanceof Error ? error.message : error}`)
      })
    }
  }

  private trimProcessedTids(): void {
    if (this.processedTids.size > this.MAX_PROCESSED_TIDS) {
      const tidsArray = Array.from(this.processedTids)
      this.processedTids = new Set(tidsArray.slice(-500))
    }
  }

  clear(): void {
    this.processedTids.clear()
  }
}
