import { EventEmitter } from "events"

// Share a single event emitter across the application runtime
export const syncEmitter = new EventEmitter()

// Increase listeners limit for active collaborative workspaces
syncEmitter.setMaxListeners(1000)

/**
 * Broadcast an update for a document to all connected clients.
 */
export function broadcastUpdate(documentId: string, payload: { clientId: string; version: number; change: string }) {
  syncEmitter.emit(`update:${documentId}`, payload)
}

/**
 * Subscribe to updates for a specific document.
 * Returns an unsubscribe callback function.
 */
export function subscribeToUpdates(documentId: string, callback: (payload: any) => void): () => void {
  const eventName = `update:${documentId}`
  syncEmitter.on(eventName, callback)
  return () => {
    syncEmitter.off(eventName, callback)
  }
}
