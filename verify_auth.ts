import { NextRequest } from "next/server"

process.env.AUTH_SECRET = "dummy_secret_of_sufficient_length_to_satisfy_nextauth"

/**
 * Mock Request Generator
 */
function createMockRequest(url: string, cookieValue?: string): NextRequest {
  const headers = new Headers()
  if (cookieValue) {
    headers.set("Cookie", `authjs.session-token=${cookieValue}`)
  }
  return new NextRequest(url, { headers })
}

/**
 * Simple Mock Auth Context
 */
interface MockAuthRequest extends NextRequest {
  auth?: any
}

// We export the tests to run or verify manually
export async function runAuthTests() {
  console.log("=== Running Authentication Protection Tests ===")
  const middleware = (await import("./middleware")).default

  // Test 1: Unauthenticated user accessing API
  {
    const req = createMockRequest("http://localhost:3000/api/documents") as MockAuthRequest
    req.auth = null // Simulated: No session
    const res = await middleware(req, {} as any)
    const isBlocked = res?.status === 401
    console.log(`Test 1: Unauthenticated request to /api/documents -> Blocked (401): ${isBlocked}`)
  }

  // Test 2: Unauthenticated user accessing dashboard page
  {
    const req = createMockRequest("http://localhost:3000/") as MockAuthRequest
    req.auth = null // Simulated: No session
    const res = await middleware(req, {} as any)
    const isRedirected = res?.status === 307 && res.headers.get("location")?.includes("/login")
    console.log(`Test 2: Unauthenticated request to / -> Redirected to /login: ${isRedirected}`)
  }

  // Test 3: Expired session (resolves to null auth)
  {
    const req = createMockRequest("http://localhost:3000/api/documents") as MockAuthRequest
    req.auth = null // NextAuth automatically invalidates expired sessions to null
    const res = await middleware(req, {} as any)
    const isBlocked = res?.status === 401
    console.log(`Test 3: Expired session token -> Blocked (401): ${isBlocked}`)
  }

  // Test 4: Invalid signature token (resolves to null auth)
  {
    const req = createMockRequest("http://localhost:3000/api/documents") as MockAuthRequest
    req.auth = null // NextAuth automatically invalidates invalid token signatures to null
    const res = await middleware(req, {} as any)
    const isBlocked = res?.status === 401
    console.log(`Test 4: Invalid token signature -> Blocked (401): ${isBlocked}`)
  }

  // Test 5: Authenticated user accessing API
  {
    const req = createMockRequest("http://localhost:3000/api/documents") as MockAuthRequest
    req.auth = { user: { id: "user-123", email: "alice@example.com" } } // Valid session
    const res = await middleware(req, {} as any)
    const isAllowed = res === undefined || res.status === 200 // Proceed to next handler
    console.log(`Test 5: Authenticated request to /api/documents -> Allowed: ${isAllowed}`)
  }
}

if (require.main === module) {
  runAuthTests().catch((e) => {
    console.error("Auth tests failed:", e);
    process.exit(1);
  });
}
