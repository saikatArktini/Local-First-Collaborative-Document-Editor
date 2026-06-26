import { NextRequest } from "next/server"
import { POST as createDoc, GET as listDocs } from "./src/app/api/documents/route"
import { GET as getDoc, PATCH as patchDoc, DELETE as deleteDoc } from "./src/app/api/documents/[id]/route"
import { documentService } from "./src/server/services/document.service"
import { documentRepository } from "./src/server/repositories/document.repository"

// Store original service calls
const originalCreateDocument = documentService.createDocument
const originalListUserDocuments = documentService.listUserDocuments
const originalGetDocument = documentService.getDocument
const originalRenameDocument = documentService.renameDocument
const originalDeleteDocument = documentService.deleteDocument
const originalFindMember = documentRepository.findMember

// Mock helper states
let dbDocs: any[] = []

function createMockRequest(url: string, method: string, body?: any, userId = "user-alice"): NextRequest {
  const req = new NextRequest(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  (req as any).auth = { user: { id: userId, email: "alice@example.com", name: "Alice" } }
  return req
}

export async function runCRUDTests() {
  console.log("=== Running Document CRUD API Tests ===")

  // Mock repository findMember to let canRead/canEdit/canDelete role checks pass
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

  // Mock documentService methods
  documentService.createDocument = async (title: string, userId: string, initialContent?: string) => {
    const doc = {
      id: "doc-uuid-999",
      title,
      ownerId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    dbDocs.push(doc)
    return doc as any
  }

  documentService.listUserDocuments = async (userId: string) => {
    return dbDocs.map(d => ({
      id: d.id,
      title: d.title,
      role: d.ownerId === userId ? "OWNER" : "EDITOR",
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })) as any
  }

  documentService.getDocument = async (docId: string, userId: string) => {
    const found = dbDocs.find(d => d.id === docId)
    if (!found) throw new Error("Document not found")
    return { ...found, role: "OWNER" } as any
  }

  documentService.renameDocument = async (docId: string, title: string, userId: string) => {
    const found = dbDocs.find(d => d.id === docId)
    if (!found) throw new Error("Document not found")
    found.title = title
    found.updatedAt = new Date()
    return found as any
  }

  documentService.deleteDocument = async (docId: string, userId: string) => {
    const foundIndex = dbDocs.findIndex(d => d.id === docId)
    if (foundIndex === -1) throw new Error("Document not found")
    const deleted = dbDocs[foundIndex]
    dbDocs.splice(foundIndex, 1)
    return deleted as any
  }

  // 1. Test POST /api/documents (Create document)
  let docId = ""
  {
    const req = createMockRequest("http://localhost:3000/api/documents", "POST", {
      title: "My Test Document",
      initialContent: "Base content"
    })

    const res = await createDoc(req, { params: {} } as any)
    const body = await res.json()
    docId = body.document?.id
    const success = res.status === 201 && body.success === true && body.document?.title === "My Test Document"
    console.log(`POST /api/documents -> Created document (Status 201): ${success} (ID: ${docId})`)
  }

  // 2. Test GET /api/documents (List documents)
  {
    const req = createMockRequest("http://localhost:3000/api/documents", "GET")
    const res = await listDocs(req, { params: {} } as any)
    const body = await res.json()
    const success = res.status === 200 && body.success === true && body.documents.length === 1
    console.log(`GET /api/documents -> Listed ${body.documents.length} docs (Status 200): ${success}`)
  }

  // 3. Test GET /api/documents/[id] (Fetch specific doc)
  {
    const req = createMockRequest(`http://localhost:3000/api/documents/${docId}`, "GET")
    const res = await getDoc(req, { params: Promise.resolve({ id: docId }) } as any)
    const body = await res.json()
    const success = res.status === 200 && body.success === true && body.document?.id === docId
    console.log(`GET /api/documents/${docId} -> Fetched doc (Status 200): ${success}`)
  }

  // 4. Test PATCH /api/documents/[id] (Rename doc)
  {
    const req = createMockRequest(`http://localhost:3000/api/documents/${docId}`, "PATCH", {
      title: "My Renamed Document"
    })
    const res = await patchDoc(req, { params: Promise.resolve({ id: docId }) } as any)
    const body = await res.json()
    const success = res.status === 200 && body.success === true && body.document?.title === "My Renamed Document"
    console.log(`PATCH /api/documents/${docId} -> Renamed doc (Status 200): ${success}`)
  }

  // 5. Test DELETE /api/documents/[id] (Delete doc)
  {
    const req = createMockRequest(`http://localhost:3000/api/documents/${docId}`, "DELETE")
    const res = await deleteDoc(req, { params: Promise.resolve({ id: docId }) } as any)
    const body = await res.json()
    const success = res.status === 200 && body.success === true && dbDocs.length === 0
    console.log(`DELETE /api/documents/${docId} -> Deleted doc (Status 200): ${success}`)
  }

  // Restore original services
  documentService.createDocument = originalCreateDocument
  documentService.listUserDocuments = originalListUserDocuments
  documentService.getDocument = originalGetDocument
  documentService.renameDocument = originalRenameDocument
  documentService.deleteDocument = originalDeleteDocument
  documentRepository.findMember = originalFindMember

  console.log("=== Document CRUD API Tests Complete ===")
}

if (require.main === module) {
  runCRUDTests().catch((e) => {
    console.error("CRUD tests failed:", e);
    process.exit(1);
  });
}

