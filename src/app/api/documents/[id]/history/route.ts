import { NextRequest, NextResponse } from "next/server"
import { secureRoute, authMiddleware, roleMiddleware } from "@/lib/api-middleware"
import { syncService } from "@/server/services/sync.service"
import { canRead } from "@/server/permissions/document.permissions"

/**
 * GET /api/documents/[id]/history
 * Retrieves the complete version snapshot history for the document.
 */
export const GET = secureRoute(
  [authMiddleware, roleMiddleware(canRead)],
  async (req: NextRequest, ctx) => {
    const { id: userId } = ctx.user!
    const { id: documentId } = ctx.params

    const history = await syncService.getSnapshots(documentId, userId)
    return NextResponse.json({ success: true, history }, { status: 200 })
  }
)
