import { NextRequest, NextResponse } from "next/server"
import { secureRoute, authMiddleware, roleMiddleware, validationMiddleware } from "@/lib/api-middleware"
import { syncService } from "@/server/services/sync.service"
import { canEdit } from "@/server/permissions/document.permissions"
import { AppError, ErrorCode } from "@/lib/errors"
import { z } from "zod"

const operationSchema = z.object({
  version: z
    .number()
    .int()
    .min(1, { message: "Version number must be a positive integer greater than 0." }),
  change: z
    .string()
    .min(1, { message: "Operation patch cannot be empty." })
    .regex(/^[0-9a-fA-F]+$/, { message: "Operation patch must be a valid hex string." }),
})

const syncPayloadSchema = z.object({
  documentId: z.string().uuid({ message: "Invalid document ID format." }),
  clientId: z.string().min(1, { message: "Client ID cannot be empty." }).trim(),
  operations: z
    .array(operationSchema)
    .min(1, { message: "Operations array must contain at least one operation." })
    .max(100, { message: "Operations array exceeds the maximum batch limit of 100." }),
})

/**
 * POST /api/sync
 * Securely uploads a batch of offline document operations.
 */
export const POST = secureRoute(
  [authMiddleware, validationMiddleware(syncPayloadSchema), roleMiddleware(canEdit)],
  async (req: NextRequest, ctx) => {
    const { id: userId } = ctx.user!
    const { documentId, clientId, operations } = ctx.validatedBody

    try {
      await syncService.submitOperations(documentId, userId, clientId, operations)
      return NextResponse.json(
        { success: true, message: "Operations successfully synchronized." },
        { status: 200 }
      )
    } catch (error: any) {
      // Version conflict is a known recoverable state — return structured 409 with latestVersion
      if (error.message && error.message.startsWith("CONFLICT:")) {
        const latestVersion = parseInt(error.message.split(":")[1], 10)
        throw new AppError(
          ErrorCode.VERSION_CONFLICT,
          `Version conflict detected. Latest server version is ${latestVersion}. Please rebase.`,
          { latestVersion }
        )
      }
      throw error
    }
  }
)
