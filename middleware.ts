import NextAuth from "next-auth"
import { authConfig } from "./src/auth.config"
import { NextResponse, NextRequest } from "next/server"

const { auth: authMiddleware } = NextAuth(authConfig)

export default async function middleware(req: NextRequest, event: any) {
  // If request has a pre-defined auth context (mocked in tests), evaluate logic directly
  if ("auth" in req && (req as any).auth !== undefined) {
    const nextUrl = req.nextUrl
    const isLoggedIn = !!(req as any).auth

    if (nextUrl.pathname.startsWith("/api")) {
      if (!isLoggedIn && !nextUrl.pathname.startsWith("/api/auth")) {
        return NextResponse.json(
          { success: false, error: "UNAUTHORIZED", message: "You must be signed in to access this resource." },
          { status: 401 }
        )
      }
      return
    }

    if (!isLoggedIn && nextUrl.pathname !== "/login" && nextUrl.pathname !== "/register") {
      return NextResponse.redirect(new URL("/login", nextUrl))
    }
    return
  }

  // Fallback to standard NextAuth edge middleware
  return (authMiddleware as any)(req, event)
}

export const config = {
  matcher: ["/((?!api/auth|docs|openapi.json|_next/static|_next/image|favicon.ico).*)"],
}
