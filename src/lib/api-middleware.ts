import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z } from "zod"
import { AppError, ErrorCode, toErrorResponse } from "@/lib/errors"

// ----------------------------------------------------
// 1. IP-Based Sliding Window Rate Limiting
// ----------------------------------------------------
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const MAX_REQUESTS = 60 // 60 requests per minute

export async function rateLimitMiddleware(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "local-ip"
  const now = Date.now()

  let rateData = rateLimitMap.get(ip)
  if (!rateData || now > rateData.resetTime) {
    rateData = { count: 1, resetTime: now + RATE_LIMIT_WINDOW }
    rateLimitMap.set(ip, rateData)
  } else {
    rateData.count++
  }

  if (rateData.count > MAX_REQUESTS) {
    throw new AppError(
      ErrorCode.RATE_LIMITED,
      "Rate limit exceeded. Please try again in a minute."
    )
  }
}

// ----------------------------------------------------
// 2. Input HTML Sanitization to prevent XSS
// ----------------------------------------------------
function sanitizeString(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;")
}

function sanitizeObject(val: any): any {
  if (typeof val === "string") {
    return sanitizeString(val)
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeObject)
  }
  if (val !== null && typeof val === "object") {
    const res: any = {}
    for (const key of Object.keys(val)) {
      res[key] = sanitizeObject(val[key])
    }
    return res
  }
  return val
}

// ----------------------------------------------------
// 3. Types and Middleware Chains Composer
// ----------------------------------------------------
export interface APIContext {
  params: any
  user?: {
    id: string
    email: string
    name: string
  } | null
  validatedBody?: any
}

export type MiddlewareFn = (req: NextRequest, ctx: APIContext) => Promise<NextResponse | Response | void | undefined>

export function secureRoute(
  middlewares: MiddlewareFn[],
  handler: (req: NextRequest, ctx: APIContext) => Promise<NextResponse | Response>
) {
  return async (req: NextRequest, arg2: any) => {
    let resolvedParams = arg2?.params
    if (resolvedParams && typeof resolvedParams.then === "function") {
      resolvedParams = await resolvedParams
    }
    const ctx: APIContext = {
      params: resolvedParams || {},
      user: null,
    }

    // A. Payload Size Limits Check (Default 1MB)
    const maxBytes = 1 * 1024 * 1024 // 1MB
    const contentLength = req.headers.get("content-length")
    if (contentLength && parseInt(contentLength) > maxBytes) {
      return toErrorResponse(
        new AppError(ErrorCode.PAYLOAD_TOO_LARGE, "Request body exceeds the maximum size limit of 1MB.")
      )
    }

    try {
      // B. Rate Limiting Check (throws AppError on breach)
      await rateLimitMiddleware(req)

      // C. Execute Middleware Chain
      for (const middleware of middlewares) {
        const response = await middleware(req, ctx)
        if (response instanceof NextResponse || response instanceof Response) {
          return response // Short-circuit pipeline if response returned
        }
      }

      // D. Execute Business Logic Handler
      return await handler(req, ctx)
    } catch (error: any) {
      // All unhandled errors — including AppErrors from middleware or services —
      // are converted to the structured error envelope here.
      console.error("API Security Layer Caught Error:", error)
      return toErrorResponse(error)
    }
  }
}

// ----------------------------------------------------
// 4. Standard Reusable Middleware Handlers
// ----------------------------------------------------

export async function authMiddleware(req: NextRequest, ctx: APIContext) {
  // If request has an auth context (mocked in tests or attached by NextAuth)
  if ("auth" in req) {
    const session = (req as any).auth
    if (!session?.user) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        "You must be signed in to access this resource."
      )
    }
    ctx.user = session.user
    return
  }

  const session = await auth()
  if (!session?.user) {
    throw new AppError(
      ErrorCode.UNAUTHORIZED,
      "You must be signed in to access this resource."
    )
  }
  ctx.user = {
    id: session.user.id as string,
    email: (session.user.email || "") as string,
    name: (session.user.name || "") as string,
  }
}

/**
 * Authorization Role Middleware: Runs checks based on the document's permission matrix.
 */
export function roleMiddleware(checkPermission: (documentId: string, userId: string) => Promise<boolean>) {
  return async (req: NextRequest, ctx: APIContext) => {
    const userId = ctx.user?.id
    if (!userId) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        "Authentication context is missing."
      )
    }

    // Retrieve document ID from URL query params, validated body, or route parameters
    const url = new URL(req.url)
    const documentId =
      url.searchParams.get("documentId") ||
      ctx.validatedBody?.documentId ||
      ctx.params?.documentId ||
      ctx.params?.id

    if (!documentId) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        "Missing required documentId parameter.",
        { field: "documentId" }
      )
    }

    const hasPermission = await checkPermission(documentId, userId)
    if (!hasPermission) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        "You do not have the required access permissions on this document."
      )
    }
  }
}

/**
 * Body Validation Middleware: Sanitizes inputs and runs Zod schema parsing.
 */
export function validationMiddleware(schema: z.ZodSchema) {
  return async (req: NextRequest, ctx: APIContext) => {
    let body: any
    try {
      // Clone request to avoid body reading locking errors
      const cloned = req.clone()
      body = await cloned.json()
    } catch (e) {
      console.error("Validation Middleware caught error parsing body:", e);
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        "Invalid or empty JSON payload."
      )
    }

    // Escape HTML input strings for security/XSS prevention
    const sanitizedBody = sanitizeObject(body)

    // Validate body contents against the Zod schema
    const result = schema.safeParse(sanitizedBody)
    if (!result.success) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        "Input validation failed.",
        { fieldErrors: result.error.flatten().fieldErrors }
      )
    }

    ctx.validatedBody = result.data
  }
}
