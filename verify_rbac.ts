import { canRead, canEdit, canDelete, canSync } from "./src/server/permissions/document.permissions"
import { documentRepository } from "./src/server/repositories/document.repository"
import { Role } from "@prisma/client"

// Store original repository method
const originalFindMember = documentRepository.findMember

// Mock state
let mockRole: Role | null = null

// Inject mock
documentRepository.findMember = async (documentId: string, userId: string) => {
  if (mockRole === null) return null
  return {
    id: "mock-membership-id",
    documentId,
    userId,
    role: mockRole,
    createdAt: new Date(),
    updatedAt: new Date()
  }
}

export async function runRBACTests() {
  console.log("=== Running RBAC Permission Matrix Verification ===")
  const docId = "test-doc-id"
  const userId = "test-user-id"

  let allTestsPassed = true

  // 1. OWNER tests (can do everything: read, edit, delete, sync)
  mockRole = Role.OWNER
  const ownerRead = await canRead(docId, userId)
  const ownerEdit = await canEdit(docId, userId)
  const ownerDelete = await canDelete(docId, userId)
  const ownerSync = await canSync(docId, userId)
  const ownerPassed = ownerRead === true && ownerEdit === true && ownerDelete === true && ownerSync === true
  console.log(`[OWNER]  Read: ${ownerRead} | Edit: ${ownerEdit} | Delete: ${ownerDelete} | Sync: ${ownerSync} -> ${ownerPassed ? "PASSED" : "FAILED"}`)
  if (!ownerPassed) allTestsPassed = false

  // 2. EDITOR tests (can read, edit, sync, but CANNOT delete)
  mockRole = Role.EDITOR
  const editorRead = await canRead(docId, userId)
  const editorEdit = await canEdit(docId, userId)
  const editorDelete = await canDelete(docId, userId)
  const editorSync = await canSync(docId, userId)
  const editorPassed = editorRead === true && editorEdit === true && editorDelete === false && editorSync === true
  console.log(`[EDITOR] Read: ${editorRead} | Edit: ${editorEdit} | Delete: ${editorDelete} | Sync: ${editorSync} -> ${editorPassed ? "PASSED" : "FAILED"}`)
  if (!editorPassed) allTestsPassed = false

  // 3. VIEWER tests (can read and sync, but CANNOT edit or delete)
  mockRole = Role.VIEWER
  const viewerRead = await canRead(docId, userId)
  const viewerEdit = await canEdit(docId, userId)
  const viewerDelete = await canDelete(docId, userId)
  const viewerSync = await canSync(docId, userId)
  const viewerPassed = viewerRead === true && viewerEdit === false && viewerDelete === false && viewerSync === true
  console.log(`[VIEWER] Read: ${viewerRead} | Edit: ${viewerEdit} | Delete: ${viewerDelete} | Sync: ${viewerSync} -> ${viewerPassed ? "PASSED" : "FAILED"}`)
  if (!viewerPassed) allTestsPassed = false

  // Restore original repository method
  documentRepository.findMember = originalFindMember

  console.log(`=== RBAC Verification Status: ${allTestsPassed ? "SUCCESS" : "FAILURE"} ===`)
  return allTestsPassed
}

if (require.main === module) {
  runRBACTests().then(passed => {
    process.exit(passed ? 0 : 1);
  }).catch((e) => {
    console.error("RBAC tests failed:", e);
    process.exit(1);
  });
}

