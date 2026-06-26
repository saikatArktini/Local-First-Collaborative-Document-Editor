import { NextRequest, NextResponse } from "next/server"
import { secureRoute, authMiddleware, roleMiddleware, validationMiddleware } from "@/lib/api-middleware"
import { syncService } from "@/server/services/sync.service"
import { canEdit } from "@/server/permissions/document.permissions"
import { z } from "zod"

const snapshotSchema = z.object({
  snapshot: z.string().refine((val) => /^[0-9a-fA-F]+$/.test(val), {
    message: "Snapshot must be a valid hex-encoded string",
  }),
})

/**
 * POST /api/documents/[id]/snapshot
 * Stores a manual snapshot of the current document state.
 */
export const POST = secureRoute(
  [authMiddleware, roleMiddleware(canEdit), validationMiddleware(snapshotSchema)],
  async (req: NextRequest, ctx) => {
    const { id: userId } = ctx.user!
    const { id: documentId } = ctx.params
    const { snapshot } = ctx.validatedBody

    const createdVersion = await syncService.createSnapshot(documentId, userId, snapshot)
    return NextResponse.json(
      {
        success: true,
        message: "Document snapshot successfully stored.",
        version: {
          id: createdVersion.id,
          documentId: createdVersion.documentId,
          createdBy: createdVersion.createdBy,
          createdAt: createdVersion.createdAt,
        },
      },
      { status: 201 }
    )
  }
)
