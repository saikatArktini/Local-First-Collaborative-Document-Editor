import { NextRequest, NextResponse } from "next/server"
import { secureRoute, authMiddleware, roleMiddleware, validationMiddleware } from "@/lib/api-middleware"
import { documentService } from "@/server/services/document.service"
import { canDelete } from "@/server/permissions/document.permissions"
import { Role } from "@prisma/client"
import { z } from "zod"

const inviteSchema = z.object({
  email: z.string().email({ message: "Please provide a valid email address." }).trim(),
  role: z.nativeEnum(Role, { message: "Role must be OWNER, EDITOR, or VIEWER." }),
})

/**
 * POST /api/documents/[id]/invite
 * Invites/adds a member to a document. Owner-only.
 */
export const POST = secureRoute(
  [authMiddleware, roleMiddleware(canDelete), validationMiddleware(inviteSchema)],
  async (req: NextRequest, ctx) => {
    const { id: ownerId } = ctx.user!
    const { id: documentId } = ctx.params
    const { email, role } = ctx.validatedBody

    const membership = await documentService.addMember(documentId, ownerId, email, role)
    return NextResponse.json(
      {
        success: true,
        message: "Collaborator successfully invited.",
        membership: {
          id: membership.id,
          documentId: membership.documentId,
          userId: membership.userId,
          role: membership.role,
        },
      },
      { status: 201 }
    )
  }
)
