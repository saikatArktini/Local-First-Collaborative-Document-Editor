import { NextRequest, NextResponse } from "next/server"
import { secureRoute, authMiddleware, roleMiddleware, validationMiddleware } from "@/lib/api-middleware"
import { documentService } from "@/server/services/document.service"
import { canDelete } from "@/server/permissions/document.permissions"
import { Role } from "@prisma/client"
import { z } from "zod"

const updateMemberSchema = z.object({
  memberId: z.string().uuid({ message: "Invalid member ID format." }),
  role: z.nativeEnum(Role, { message: "Role must be OWNER, EDITOR, or VIEWER." }),
})

const removeMemberSchema = z.object({
  memberId: z.string().uuid({ message: "Invalid member ID format." }),
})

/**
 * PATCH /api/documents/[id]/member
 * Updates a document member's role. Owner-only.
 */
export const PATCH = secureRoute(
  [authMiddleware, roleMiddleware(canDelete), validationMiddleware(updateMemberSchema)],
  async (req: NextRequest, ctx) => {
    const { id: ownerId } = ctx.user!
    const { id: documentId } = ctx.params
    const { memberId, role } = ctx.validatedBody

    const membership = await documentService.updateMemberRole(documentId, ownerId, memberId, role)
    return NextResponse.json(
      {
        success: true,
        message: "Collaborator role successfully updated.",
        membership: {
          id: membership.id,
          documentId: membership.documentId,
          userId: membership.userId,
          role: membership.role,
        },
      },
      { status: 200 }
    )
  }
)

/**
 * DELETE /api/documents/[id]/member
 * Removes a collaborator from a document. Owner-only.
 */
export const DELETE = secureRoute(
  [authMiddleware, roleMiddleware(canDelete), validationMiddleware(removeMemberSchema)],
  async (req: NextRequest, ctx) => {
    const { id: ownerId } = ctx.user!
    const { id: documentId } = ctx.params
    const { memberId } = ctx.validatedBody

    await documentService.removeMember(documentId, ownerId, memberId)
    return NextResponse.json({ success: true, message: "Collaborator successfully removed." }, { status: 200 })
  }
)
