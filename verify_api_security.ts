import { NextRequest } from "next/server"
import { z } from "zod"
import {
  secureRoute,
  authMiddleware,
  validationMiddleware,
  rateLimitMiddleware,
} from "./src/lib/api-middleware"

// A dummy schema for validation testing
const testSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
})

// Helper to simulate request size
function createSizeRequest(sizeInBytes: number): NextRequest {
  const headers = new Headers()
  headers.set("content-length", sizeInBytes.toString())
  return new NextRequest("http://localhost:3000/api/test", { headers })
}

// Helper to simulate IP headers
function createIPRequest(ip: string): NextRequest {
  const headers = new Headers()
  headers.set("x-forwarded-for", ip)
  return new NextRequest("http://localhost:3000/api/test", { headers })
}

// Helper to simulate JSON body
function createBodyRequest(bodyObj: any): NextRequest {
  return new NextRequest("http://localhost:3000/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bodyObj),
  })
}

export async function runSecurityTests() {
  console.log("=== Running API Security Layer Tests ===")

  // 1. Request Size Limits Test
  {
    const reqUnder = createSizeRequest(500 * 1024) // 500KB
    const handler = secureRoute([], async () => new Response("Allowed"))
    const resUnder = await handler(reqUnder, {} as any)
    const allowed = resUnder.status === 200

    const reqOver = createSizeRequest(2 * 1024 * 1024) // 2MB
    const resOver = await handler(reqOver, {} as any)
    const blockedOver = resOver.status === 413 // Payload Too Large

    console.log(`Payload Size Limit Tests:`)
    console.log(`- 500KB request allowed: ${allowed}`)
    console.log(`- 2MB request blocked with 413: ${blockedOver}`)
  }

  // 2. Sliding Window Rate Limiting Test
  {
    console.log("Rate Limiting Tests:")
    const testIp = "192.168.10.50"
    let lastStatus = 0
    let requestsCount = 0

    // Send 65 rapid requests to trigger limit
    for (let i = 0; i < 65; i++) {
      const req = createIPRequest(testIp)
      try {
        await rateLimitMiddleware(req)
      } catch (error: any) {
        if (error && error.code === "RATE_LIMITED") {
          lastStatus = 429
          requestsCount = i + 1
          break
        }
        throw error
      }
    }
    console.log(`- Rate limit triggered after ${requestsCount} requests with status ${lastStatus} (Expected: 61st request triggers 429)`)
  }

  // 3. Input Sanitization Test (XSS Prevention)
  {
    console.log("Input HTML Sanitization Tests:")
    const dirtyPayload = {
      title: "<script>alert('xss')</script> Hello",
      description: "<iframe>test</iframe>",
    }
    const req = createBodyRequest(dirtyPayload)
    const ctx: any = {}
    const validate = validationMiddleware(testSchema)
    await validate(req, ctx)

    const titleSanitized = ctx.validatedBody?.title === "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt; Hello"
    const descSanitized = ctx.validatedBody?.description === "&lt;iframe&gt;test&lt;&#x2F;iframe&gt;"

    console.log(`- XSS script tag escaped: ${titleSanitized}`)
    console.log(`- XSS iframe tag escaped: ${descSanitized}`)
  }

  // 4. Zod Structure Validation Test
  {
    console.log("Zod Schema Validation Tests:")
    // A: Invalid shorter title
    const invalidPayload = { title: "ab" }
    const req = createBodyRequest(invalidPayload)
    const ctx: any = {}
    const validate = validationMiddleware(testSchema)
    let isValidationError = false
    try {
      await validate(req, ctx)
    } catch (error: any) {
      if (error && error.code === "VALIDATION_ERROR") {
        isValidationError = true
      }
    }
    console.log(`- Input under minimum length rejected with 422 (VALIDATION_ERROR): ${isValidationError}`)
  }

  console.log("=== API Security Tests Complete ===")
}

if (require.main === module) {
  runSecurityTests().catch((e) => {
    console.error("Security tests failed:", e);
    process.exit(1);
  });
}
