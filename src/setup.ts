import WebSocket from 'ws';

if (!(WebSocket.prototype as any).dispatchEvent) {
  (WebSocket.prototype as any).dispatchEvent = function(event: any) {
    if (!event || !event.type) {
      return false;
    }

    const eventName = event.type;

    try {
      this.emit(eventName, event);
      return !event.defaultPrevented;
    } catch (error) {
      console.error(`Error dispatching WebSocket event '${eventName}':`, error);
      return false;
    }
  };
}

(global as any).WebSocket = WebSocket;

process.on('uncaughtException', (error: Error) => {
  console.error('\n❌ UNCAUGHT EXCEPTION:', error.message);
  console.error('Stack:', error.stack);
  console.error('App will continue running...\n');
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('\n❌ UNHANDLED REJECTION:', reason);
  console.error('Promise:', promise);
  console.error('App will continue running...\n');
});
