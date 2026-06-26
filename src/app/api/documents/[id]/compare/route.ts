import { NextRequest, NextResponse } from "next/server"
import { secureRoute, authMiddleware, roleMiddleware, validationMiddleware } from "@/lib/api-middleware"
import { syncService } from "@/server/services/sync.service"
import { canRead } from "@/server/permissions/document.permissions"
import { z } from "zod"

const compareSchema = z.object({
  versionAId: z.string().uuid({ message: "versionAId must be a valid UUID string" }),
  versionBId: z.string().uuid({ message: "versionBId must be a valid UUID string" }),
})

/**
 * POST /api/documents/[id]/compare
 * Compares two snapshot versions of the document.
 * Requires Authentication and READ permission.
 */
export const POST = secureRoute(
  [
    authMiddleware,
    roleMiddleware(canRead),
    validationMiddleware(compareSchema),
  ],
  async (req: NextRequest, ctx) => {
    const { id: userId } = ctx.user!
    const { id: documentId } = ctx.params
    const { versionAId, versionBId } = ctx.validatedBody

    const comparison = await syncService.compareSnapshots(documentId, userId, versionAId, versionBId)
    return NextResponse.json({ success: true, comparison }, { status: 200 })
  }
)
