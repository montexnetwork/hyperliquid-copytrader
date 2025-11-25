import WebSocket from 'ws'

if (!(WebSocket.prototype as any).dispatchEvent) {
  (WebSocket.prototype as any).dispatchEvent = function(event: any) {
    const listeners = (this as any)._listeners?.[event.type] || []
    for (const listener of listeners) {
      listener.call(this, event)
    }
    const handler = (this as any)[`on${event.type}`]
    if (handler) {
      handler.call(this, event)
    }
    return true
  }
}

(global as any).WebSocket = WebSocket
