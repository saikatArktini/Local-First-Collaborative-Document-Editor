import { NextRequest, NextResponse } from "next/server"
import { secureRoute, authMiddleware, validationMiddleware } from "@/lib/api-middleware"
import { documentService } from "@/server/services/document.service"
import { z } from "zod"

const createDocumentSchema = z.object({
  title: z
    .string()
    .min(1, { message: "Title must be at least 1 character long." })
    .max(100, { message: "Title must be at most 100 characters long." })
    .trim(),
  initialContent: z.string().optional(),
})

/**
 * POST /api/documents
 * Securely creates a new document.
 */
export const POST = secureRoute(
  [authMiddleware, validationMiddleware(createDocumentSchema)],
  async (req: NextRequest, ctx) => {
    const { id: userId } = ctx.user!
    const { title, initialContent } = ctx.validatedBody

    const document = await documentService.createDocument(title, userId, initialContent)
    return NextResponse.json(
      {
        success: true,
        document: {
          id: document.id,
          title: document.title,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
        },
      },
      { status: 201 }
    )
  }
)

/**
 * GET /api/documents
 * Securely retrieves all documents accessible to the currently authenticated user.
 */
export const GET = secureRoute(
  [authMiddleware],
  async (req: NextRequest, ctx) => {
    const { id: userId } = ctx.user!
    const documents = await documentService.listUserDocuments(userId)
    return NextResponse.json({ success: true, documents }, { status: 200 })
  }
)
