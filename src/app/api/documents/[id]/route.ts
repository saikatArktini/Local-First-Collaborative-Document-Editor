import { NextRequest, NextResponse } from "next/server"
import { secureRoute, authMiddleware, roleMiddleware, validationMiddleware } from "@/lib/api-middleware"
import { documentService } from "@/server/services/document.service"
import { canRead, canEdit, canDelete } from "@/server/permissions/document.permissions"
import { z } from "zod"

const patchDocumentSchema = z.object({
  title: z
    .string()
    .min(1, { message: "Title must be at least 1 character long." })
    .max(100, { message: "Title must be at most 100 characters long." })
    .trim(),
})

/**
 * GET /api/documents/[id]
 * Securely retrieves details of a specific document.
 */
export const GET = secureRoute(
  [authMiddleware, roleMiddleware(canRead)],
  async (req: NextRequest, ctx) => {
    const { id: userId } = ctx.user!
    const { id: documentId } = ctx.params

    const document = await documentService.getDocument(documentId, userId)
    return NextResponse.json({ success: true, document }, { status: 200 })
  }
)

/**
 * PATCH /api/documents/[id]
 * Securely renames/updates document title.
 */
export const PATCH = secureRoute(
  [authMiddleware, roleMiddleware(canEdit), validationMiddleware(patchDocumentSchema)],
  async (req: NextRequest, ctx) => {
    const { id: userId } = ctx.user!
    const { id: documentId } = ctx.params
    const { title } = ctx.validatedBody

    const document = await documentService.renameDocument(documentId, title, userId)
    return NextResponse.json(
      {
        success: true,
        document: { id: document.id, title: document.title, updatedAt: document.updatedAt },
      },
      { status: 200 }
    )
  }
)

/**
 * DELETE /api/documents/[id]
 * Securely deletes a specific document. Owner-only.
 */
export const DELETE = secureRoute(
  [authMiddleware, roleMiddleware(canDelete)],
  async (req: NextRequest, ctx) => {
    const { id: userId } = ctx.user!
    const { id: documentId } = ctx.params

    await documentService.deleteDocument(documentId, userId)
    return NextResponse.json({ success: true, message: "Document successfully deleted." }, { status: 200 })
  }
)
