import { NextRequest, NextResponse } from "next/server"
import { secureRoute, authMiddleware } from "@/lib/api-middleware"
import { generateToken } from "@/lib/jwt"

/**
 * GET /api/auth/ws-token
 * Mints a short-lived JWT for authenticating WebSocket connections.
 * The standalone WS server (src/server/websocket.ts) uses this token to
 * verify identity — it cannot read NextAuth session cookies directly.
 */
export const GET = secureRoute(
  [authMiddleware],
  async (_req: NextRequest, ctx) => {
    const user = ctx.user!
    const token = await generateToken({ userId: user.id, email: user.email })
    return NextResponse.json({ token }, { status: 200 })
  }
)
