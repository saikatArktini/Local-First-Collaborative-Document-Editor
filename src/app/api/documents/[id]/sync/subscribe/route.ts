import { NextRequest } from "next/server"
import { secureRoute, authMiddleware, roleMiddleware } from "@/lib/api-middleware"
import { canRead } from "@/server/permissions/document.permissions"
import { subscribeToUpdates } from "@/lib/broadcast"

/**
 * GET /api/documents/[id]/sync/subscribe
 * Establishes a persistent Server-Sent Events (SSE) stream for real-time document synchronization.
 * Requires Authentication and READ permission.
 */
export const GET = secureRoute(
  [
    authMiddleware,
    roleMiddleware(canRead),
  ],
  async (req: NextRequest, ctx) => {
    const { id: documentId } = ctx.params

    const stream = new ReadableStream({
      start(controller) {
        // Enqueue connection success event
        controller.enqueue("event: connected\ndata: {}\n\n")

        // Triggered when a new sync patch/operation is broadcast
        const onUpdate = (data: any) => {
          try {
            controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
          } catch (err) {
            // Stream has closed or aborted
          }
        }

        // Subscribe to shared event emitter
        const unsubscribe = subscribeToUpdates(documentId, onUpdate)

        // Send a ping message every 15 seconds to keep the connection alive
        const pingInterval = setInterval(() => {
          try {
            controller.enqueue(": ping\n\n")
          } catch (err) {
            // Stream has closed or aborted
          }
        }, 15000)

        // Clean up subscription and ping intervals upon client disconnection
        req.signal.addEventListener("abort", () => {
          unsubscribe()
          clearInterval(pingInterval)
        })
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    })
  }
)
