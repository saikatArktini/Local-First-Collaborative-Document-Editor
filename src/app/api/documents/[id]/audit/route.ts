import { NextRequest, NextResponse } from "next/server"
import { secureRoute, authMiddleware, roleMiddleware } from "@/lib/api-middleware"
import { auditRepository } from "@/server/repositories/audit.repository"
import { canRead } from "@/server/permissions/document.permissions"
import { AuditAction } from "@prisma/client"

/**
 * GET /api/documents/[id]/audit
 * Returns structured audit log entries for a document.
 * Requires Authentication and READ permission on the document.
 *
 * Optional query params:
 *   ?action=SNAPSHOT_CREATED  — filter by AuditAction enum value
 *   ?limit=50                  — max entries to return (default 50, max 200)
 */
export const GET = secureRoute(
  [
    authMiddleware,
    roleMiddleware(canRead),
  ],
  async (req: NextRequest, ctx) => {
    const { id: userId } = ctx.user!
    const documentId = ctx.params.id

    const url = new URL(req.url)
    const actionFilter = url.searchParams.get("action") as AuditAction | null
    const limitParam = parseInt(url.searchParams.get("limit") ?? "50", 10)
    const limit = Math.min(Math.max(1, limitParam), 200) // clamp 1–200

    // Validate action filter if provided
    const validActions = Object.values(AuditAction)
    if (actionFilter && !validActions.includes(actionFilter)) {
      return NextResponse.json(
        {
          error: "Bad Request",
          message: `Invalid action filter. Must be one of: ${validActions.join(", ")}`,
        },
        { status: 400 }
      )
    }

    const logs = await auditRepository.findLogsByDocument(documentId, userId)

      // Apply optional action filter
      const filtered = actionFilter
        ? logs.filter((log) => log.action === actionFilter)
        : logs

      // Apply limit
      const paged = filtered.slice(0, limit)

      return NextResponse.json(
        {
          success: true,
          documentId,
          total: filtered.length,
          logs: paged.map((log) => ({
            id: log.id,
            action: log.action,
            userId: log.userId,
            // @ts-ignore — `user` is included via Prisma `include` in the repository
            actor: log.user ?? null,
            metadata: log.metadata,
            createdAt: log.createdAt,
          })),
        },
        { status: 200 }
      )
  }
)
