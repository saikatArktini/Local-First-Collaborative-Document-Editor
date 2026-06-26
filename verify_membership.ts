import { NextRequest } from "next/server"
import { POST as inviteDocMember } from "./src/app/api/documents/[id]/invite/route"
import { PATCH as updateDocMember, DELETE as removeDocMember } from "./src/app/api/documents/[id]/member/route"
import { documentService } from "./src/server/services/document.service"
import { documentRepository } from "./src/server/repositories/document.repository"
import { Role } from "@prisma/client"

// Store original calls
const originalAddMember = documentService.addMember
const originalUpdateMemberRole = documentService.updateMemberRole
const originalRemoveMember = documentService.removeMember
const originalFindMember = documentRepository.findMember

function createMockRequest(url: string, method: string, body: any, userId = "user-alice"): NextRequest {
  const req = new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  (req as any).auth = { user: { id: userId, email: "alice@example.com", name: "Alice" } }
  return req
}

// Mock states
let mockMembers: any[] = []

export async function runMembershipTests() {
  console.log("=== Running Document Membership API Tests ===")

  // Mock repository findMember to let canDelete role checks pass
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

  const docId = "doc-uuid-888"
  const ownerId = "user-alice"
  const memberId = "c77d4e88-4f7d-4f7c-8ead-b526ad47a180" // valid UUID format

  // Mock documentService methods
  documentService.addMember = async (documentId: string, ownerId: string, email: string, role: Role) => {
    const membership = {
      id: memberId,
      documentId,
      userId: "user-bob",
      role,
    }
    mockMembers.push(membership)
    return membership as any
  }

  documentService.updateMemberRole = async (documentId: string, ownerId: string, collaboratorId: string, role: Role) => {
    const found = mockMembers.find(m => m.id === collaboratorId)
    if (!found) throw new Error("Member not found")
    found.role = role
    return found as any
  }

  documentService.removeMember = async (documentId: string, ownerId: string, collaboratorId: string) => {
    const foundIndex = mockMembers.findIndex(m => m.id === collaboratorId)
    if (foundIndex === -1) throw new Error("Member not found")
    const deleted = mockMembers[foundIndex]
    mockMembers.splice(foundIndex, 1)
    return deleted as any
  }

  // 1. Test POST /api/documents/[id]/invite (Invite editor)
  {
    const req = createMockRequest(`http://localhost:3000/api/documents/${docId}/invite`, "POST", {
      email: "bob@example.com",
      role: "EDITOR"
    })
    const res = await inviteDocMember(req, { params: Promise.resolve({ id: docId }) } as any)
    const body = await res.json()
    const success = res.status === 201 && body.success === true && body.membership?.role === "EDITOR"
    console.log(`POST /api/documents/${docId}/invite -> Invited editor (Status 201): ${success}`)
  }

  // 2. Test PATCH /api/documents/[id]/member (Change role)
  {
    const req = createMockRequest(`http://localhost:3000/api/documents/${docId}/member`, "PATCH", {
      memberId,
      role: "VIEWER"
    })
    const res = await updateDocMember(req, { params: Promise.resolve({ id: docId }) } as any)
    const body = await res.json()
    const success = res.status === 200 && body.success === true && body.membership?.role === "VIEWER"
    console.log(`PATCH /api/documents/${docId}/member -> Changed role to VIEWER (Status 200): ${success}`)
  }

  // 3. Test DELETE /api/documents/[id]/member (Remove member)
  {
    const req = createMockRequest(`http://localhost:3000/api/documents/${docId}/member`, "DELETE", {
      memberId
    })
    const res = await removeDocMember(req, { params: Promise.resolve({ id: docId }) } as any)
    const body = await res.json()
    const success = res.status === 200 && body.success === true && mockMembers.length === 0
    console.log(`DELETE /api/documents/${docId}/member -> Removed member (Status 200): ${success}`)
  }

  // Restore original services
  documentService.addMember = originalAddMember
  documentService.updateMemberRole = originalUpdateMemberRole
  documentService.removeMember = originalRemoveMember
  documentRepository.findMember = originalFindMember

  console.log("=== Document Membership API Tests Complete ===")
}

if (require.main === module) {
  runMembershipTests().catch((e) => {
    console.error("Membership tests failed:", e);
    process.exit(1);
  });
}

