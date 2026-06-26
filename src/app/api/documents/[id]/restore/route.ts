import { NextRequest, NextResponse } from "next/server"
import { secureRoute, authMiddleware, roleMiddleware, validationMiddleware } from "@/lib/api-middleware"
import { syncService } from "@/server/services/sync.service"
import { canEdit } from "@/server/permissions/document.permissions"
import { z } from "zod"

const restoreSchema = z.object({
  versionId: z.string().uuid({ message: "versionId must be a valid UUID string" }),
})

/**
 * POST /api/documents/[id]/restore
 * Restores the document content to a target snapshot.
 * Requires Authentication and EDIT permission.
 */
export const POST = secureRoute(
  [
    authMiddleware,
    roleMiddleware(canEdit),
    validationMiddleware(restoreSchema),
  ],
  async (req: NextRequest, ctx) => {
    const { id: userId } = ctx.user!
    const { id: documentId } = ctx.params
    const { versionId } = ctx.validatedBody

    const result = await syncService.restoreSnapshot(documentId, userId, versionId)
    return NextResponse.json(
      {
        success: true,
        message: "Document successfully restored to the target snapshot state.",
        result,
      },
      { status: 200 }
    )
  }
)
