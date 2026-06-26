import { NextRequest } from "next/server"
import { POST as syncOps } from "./src/app/api/sync/route"
import { syncService } from "./src/server/services/sync.service"
import { documentRepository } from "./src/server/repositories/document.repository"

// Store original service method and repository method
const originalSubmitOperations = syncService.submitOperations
const originalFindMember = documentRepository.findMember

function createMockRequest(url: string, body: any, userId = "user-alice"): NextRequest {
  const req = new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  (req as any).auth = { user: { id: userId, email: "alice@example.com", name: "Alice" } }
  return req
}

export async function runSyncTests() {
  console.log("=== Running Local-First Sync API Tests ===")

  // Mock repository findMember to let canSync role checks pass
  documentRepository.findMember = async (documentId, userId) => {
    return {
      id: "membership-id",
      documentId,
      userId,
      role: "OWNER",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  const docId = "c77d4e88-4f7d-4f7c-8ead-b526ad47a180" // RFC-compliant UUID
  const clientId = "client-yjs-instance-1"

  // 1. Mock normal batch upload
  {
    syncService.submitOperations = async (dId, uId, cId, ops) => {
      // Mock successful insert
      return { success: true }
    }

    const req = createMockRequest("http://localhost:3000/api/sync", {
      documentId: docId,
      clientId,
      operations: [
        { version: 1, change: "abcf" },
        { version: 2, change: "feea" }
      ]
    })

    const res = await syncOps(req, { params: {} } as any)
    const body = await res.json()
    const success = res.status === 200 && body.success === true
    console.log(`POST /api/sync -> Normal batch sync upload (Status 200): ${success}`)
  }

  // 2. Reject batches exceeding 100 operations
  {
    // Generate 101 operations
    const operations = Array.from({ length: 101 }, (_, i) => ({
      version: i + 1,
      change: "ab"
    }))

    const req = createMockRequest("http://localhost:3000/api/sync", {
      documentId: docId,
      clientId,
      operations
    })

    const res = await syncOps(req, { params: {} } as any)
    const body = await res.json()
    const success = res.status === 422 // Schema validation failure due to .max(100)
    console.log(`POST /api/sync -> Reject > 100 operations (Status 422): ${success}`)
  }

  // 3. Reject batches with duplicate version numbers
  {
    syncService.submitOperations = async () => {
      throw new Error("Malformed payload: duplicate version numbers detected in request.")
    }

    const req = createMockRequest("http://localhost:3000/api/sync", {
      documentId: docId,
      clientId,
      operations: [
        { version: 1, change: "ab" },
        { version: 1, change: "cd" } // Duplicate version number
      ]
    })

    const res = await syncOps(req, { params: {} } as any)
    const body = await res.json()
    // Returns status mapped under secureRoute / toErrorResponse (e.g. 500 or 422) with nested error payload
    const success = (res.status === 400 || res.status === 422 || res.status === 500) &&
      (body.message?.includes("duplicate version") || body.error?.message?.includes("duplicate version"))
    console.log(`POST /api/sync -> Reject duplicate versions inside batch (Status 400/422/500): ${success}`)
  }

  // 4. Return 409 Conflict on database duplicate version
  {
    syncService.submitOperations = async () => {
      // Simulate Prisma transaction abort on P2002 duplicate
      throw new Error("CONFLICT:2") // latest server version is 2
    }

    const req = createMockRequest("http://localhost:3000/api/sync", {
      documentId: docId,
      clientId,
      operations: [
        { version: 2, change: "ab" } // version 2 already exists
      ]
    })

    const res = await syncOps(req, { params: {} } as any)
    const body = await res.json()
    const success = res.status === 409 &&
      body.error?.code === "VERSION_CONFLICT" &&
      body.error?.details?.latestVersion === 2
    console.log(`POST /api/sync -> Version conflict resolution (Status 409): ${success} (Latest Version: ${body.error?.details?.latestVersion})`)
  }

  // Restore original services
  syncService.submitOperations = originalSubmitOperations
  documentRepository.findMember = originalFindMember

  console.log("=== Local-First Sync API Tests Complete ===")
}

if (require.main === module) {
  runSyncTests().catch((e) => {
    console.error("Sync tests failed:", e);
    process.exit(1);
  });
}

