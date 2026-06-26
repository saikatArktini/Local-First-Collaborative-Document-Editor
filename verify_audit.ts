import process from 'process';

import { documentRepository } from './src/server/repositories/document.repository';
import { userRepository } from './src/server/repositories/user.repository';
import { versionRepository } from './src/server/repositories/version.repository';
import { syncRepository } from './src/server/repositories/sync.repository';
import { auditRepository } from './src/server/repositories/audit.repository';
import { documentService } from './src/server/services/document.service';
import { syncService } from './src/server/services/sync.service';
import { AuditAction, Role } from '@prisma/client';
import { NextRequest } from 'next/server';
import { GET as getAuditRoute } from './src/app/api/documents/[id]/audit/route';
import prisma from './src/lib/prisma';
import * as Y from 'yjs';

// ============================================================
// Captured Audit Log entries
// ============================================================
let capturedLogs: Array<{ userId: string; action: AuditAction; documentId?: string; metadata?: any }> = [];

// ============================================================
// Mock: auditRepository.logAction
// ============================================================
const originalLogAction = auditRepository.logAction.bind(auditRepository);
const originalFindLogsByDocument = auditRepository.findLogsByDocument.bind(auditRepository);

auditRepository.logAction = async (userId, action, documentId?, metadata?) => {
  capturedLogs.push({ userId, action, documentId, metadata });
  return { id: `log-${capturedLogs.length}`, userId, action, documentId: documentId ?? null, metadata: metadata ?? null, createdAt: new Date() } as any;
};

auditRepository.findLogsByDocument = async (documentId: string, userId: string) => {
  return capturedLogs
    .filter(l => l.documentId === documentId)
    .map((l, i) => ({
      id: `log-${i + 1}`,
      userId: l.userId,
      action: l.action,
      documentId: l.documentId ?? null,
      metadata: l.metadata ?? null,
      createdAt: new Date(),
      user: { id: l.userId, name: `User ${l.userId}`, email: `${l.userId}@test.com` },
    })) as any;
};

// ============================================================
// Shared mock IDs
// ============================================================
const DOC_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OWNER_ID = 'owner-uuid-0000-0000-000000000001';
const MEMBER_ID = 'member-uuid-0000-0000-000000000002';
const VERSION_ID = '00000000-0000-4000-a000-000000000001';

// ============================================================
// Mock underlying repositories (so DB isn't hit)
// ============================================================
const origCreateDoc = documentRepository.createDocument;
const origFindById = documentRepository.findById;
const origDeleteDoc = documentRepository.deleteDocument;
const origUpdateMemberRole = documentRepository.updateMemberRole;
const origFindMember = documentRepository.findMember;
const origUserFindById = userRepository.findById;
const origCreateVersion = versionRepository.createVersion;
const origFindLatestVersion = versionRepository.findLatestVersion;
const origFindVersions = versionRepository.findVersions;
const origGetLatestVersion = syncRepository.getLatestVersion;
const origCreateOperation = syncRepository.createOperation;
const origFindOperations = syncRepository.findOperations;
const origPrismaDocVersionFindUnique = (prisma.documentVersion as any).findUnique;

documentRepository.createDocument = async (title, ownerId) => ({
  id: DOC_ID, title, ownerId, createdAt: new Date(), updatedAt: new Date(),
}) as any;

documentRepository.findById = async (id, userId) => ({
  id: DOC_ID, title: 'Test Doc', ownerId: OWNER_ID, createdAt: new Date(), updatedAt: new Date(),
}) as any;

documentRepository.deleteDocument = async (id, userId) => ({
  id: DOC_ID, title: 'Test Doc', ownerId: OWNER_ID, createdAt: new Date(), updatedAt: new Date(),
}) as any;

documentRepository.updateMemberRole = async (documentId, ownerId, memberId, role) => ({
  id: 'mem-1', userId: memberId, documentId, role, createdAt: new Date(), updatedAt: new Date(),
}) as any;

documentRepository.findMember = async (documentId, userId) => {
  if (userId === OWNER_ID) return { id: 'm1', userId, documentId, role: Role.OWNER, createdAt: new Date(), updatedAt: new Date() };
  return null;
};

userRepository.findById = async (id) => ({
  id, email: `${id}@test.com`, name: `User ${id}`, passwordHash: 'x', createdAt: new Date(), updatedAt: new Date(),
}) as any;

versionRepository.createVersion = async (documentId, createdBy, snapshot) => ({
  id: VERSION_ID, documentId, createdBy, snapshot: Buffer.from(snapshot), createdAt: new Date(),
}) as any;

versionRepository.findLatestVersion = async (documentId, userId?) => null;
versionRepository.findVersions = async (documentId, userId?) => [];

syncRepository.getLatestVersion = async (documentId, userId?) => 5;
syncRepository.createOperation = async (documentId, userId, clientId, version, operation) => ({
  id: 'op-1', documentId, clientId, version, operation: Buffer.from(operation),
}) as any;
syncRepository.findOperations = async (documentId, userId?, sinceVersion?) => [];

(prisma.documentVersion as any).findUnique = async (args: any) => {
  const doc = new Y.Doc();
  doc.getText('content').insert(0, 'Hello');
  return { id: args.where.id, documentId: DOC_ID, snapshot: Buffer.from(Y.encodeStateAsUpdate(doc)) };
};

// ============================================================
// Permissions mock
// ============================================================
// Inline mock — permissions module needs document member lookup which is already mocked above via findMember
// The canRead/canEdit/canDelete checks use documentRepository.findMember internally; OWNER_ID has OWNER role mock

// ============================================================
// Helpers
// ============================================================
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function createMockRequest(url: string, method = 'GET', body?: any, userId = OWNER_ID): NextRequest {
  const req = new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  (req as any).auth = { user: { id: userId, email: `${userId}@test.com`, name: 'Owner' } };
  return req;
}

// ============================================================
// Tests
// ============================================================
export async function runAuditTests() {
  console.log('=== Running Audit Logging Verification Tests ===');
  let testsPassed = true;

  try {
    // ---- Test 1: documentService.createDocument → DOCUMENT_CREATED ----
    {
      capturedLogs = [];
      await documentService.createDocument('My Doc', OWNER_ID);

      const log = capturedLogs.find(l => l.action === AuditAction.DOCUMENT_CREATED);
      const passed = !!log && log.userId === OWNER_ID && log.documentId === DOC_ID && log.metadata?.title === 'My Doc';
      console.log(`Test 1: createDocument → DOCUMENT_CREATED -> ${passed ? 'PASSED' : 'FAILED'} (${JSON.stringify(log)})`);
      if (!passed) testsPassed = false;
    }

    // ---- Test 2: documentService.deleteDocument → DOCUMENT_DELETED ----
    {
      capturedLogs = [];
      // Mock canDelete = owner check via findMember with OWNER role
      await documentService.deleteDocument(DOC_ID, OWNER_ID);

      const log = capturedLogs.find(l => l.action === AuditAction.DOCUMENT_DELETED);
      const passed = !!log && log.userId === OWNER_ID && log.documentId === DOC_ID && !!log.metadata?.title;
      console.log(`Test 2: deleteDocument → DOCUMENT_DELETED -> ${passed ? 'PASSED' : 'FAILED'} (${JSON.stringify(log)})`);
      if (!passed) testsPassed = false;
    }

    // ---- Test 3: documentService.updateMemberRole → ROLE_CHANGED ----
    {
      capturedLogs = [];
      // Mock canDelete (owner-only) via findMember  
      await documentService.updateMemberRole(DOC_ID, OWNER_ID, MEMBER_ID, Role.EDITOR);

      const log = capturedLogs.find(l => l.action === AuditAction.ROLE_CHANGED);
      const passed = !!log && log.userId === OWNER_ID && log.documentId === DOC_ID && log.metadata?.newRole === Role.EDITOR;
      console.log(`Test 3: updateMemberRole → ROLE_CHANGED -> ${passed ? 'PASSED' : 'FAILED'} (${JSON.stringify(log)})`);
      if (!passed) testsPassed = false;
    }

    // ---- Test 4: syncService.createSnapshot → SNAPSHOT_CREATED ----
    {
      capturedLogs = [];
      const doc = new Y.Doc();
      doc.getText('content').insert(0, 'Hello snapshot');
      const snapshotHex = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('hex');

      await syncService.createSnapshot(DOC_ID, OWNER_ID, snapshotHex);

      const log = capturedLogs.find(l => l.action === AuditAction.SNAPSHOT_CREATED);
      const passed = !!log && log.userId === OWNER_ID && log.documentId === DOC_ID && !!log.metadata?.versionId;
      console.log(`Test 4: createSnapshot → SNAPSHOT_CREATED -> ${passed ? 'PASSED' : 'FAILED'} (${JSON.stringify(log)})`);
      if (!passed) testsPassed = false;
    }

    // ---- Test 5: syncService.restoreSnapshot → RESTORE_PERFORMED ----
    {
      capturedLogs = [];

      await syncService.restoreSnapshot(DOC_ID, OWNER_ID, VERSION_ID);

      const log = capturedLogs.find(l => l.action === AuditAction.RESTORE_PERFORMED);
      const passed = !!log && log.userId === OWNER_ID && log.documentId === DOC_ID && log.metadata?.targetVersionId === VERSION_ID;
      console.log(`Test 5: restoreSnapshot → RESTORE_PERFORMED -> ${passed ? 'PASSED' : 'FAILED'} (${JSON.stringify(log)})`);
      if (!passed) testsPassed = false;
    }

    // ---- Test 6: GET /api/documents/:id/audit → structured response ----
    {
      capturedLogs = [
        { userId: OWNER_ID, action: AuditAction.DOCUMENT_CREATED, documentId: DOC_ID, metadata: { title: 'My Doc' } },
        { userId: OWNER_ID, action: AuditAction.SNAPSHOT_CREATED, documentId: DOC_ID, metadata: { versionId: VERSION_ID } },
      ];

      const req = createMockRequest(`http://localhost:3000/api/documents/${DOC_ID}/audit`);
      const res = await getAuditRoute(req, { params: { id: DOC_ID } } as any);
      const body = await res.json();

      const passed =
        res.status === 200 &&
        body.success === true &&
        Array.isArray(body.logs) &&
        body.logs.length === 2 &&
        body.logs[0].action === AuditAction.DOCUMENT_CREATED &&
        body.logs[1].action === AuditAction.SNAPSHOT_CREATED;

      console.log(`Test 6: GET /audit returns structured logs -> ${passed ? 'PASSED' : 'FAILED'} (status: ${res.status}, logs: ${body.logs?.length})`);
      if (!passed) testsPassed = false;
    }

    // ---- Test 7: GET /api/documents/:id/audit?action=SNAPSHOT_CREATED → filtered ----
    {
      capturedLogs = [
        { userId: OWNER_ID, action: AuditAction.DOCUMENT_CREATED, documentId: DOC_ID, metadata: { title: 'My Doc' } },
        { userId: OWNER_ID, action: AuditAction.SNAPSHOT_CREATED, documentId: DOC_ID, metadata: { versionId: VERSION_ID } },
        { userId: OWNER_ID, action: AuditAction.ROLE_CHANGED, documentId: DOC_ID, metadata: { memberId: MEMBER_ID } },
      ];

      const req = createMockRequest(`http://localhost:3000/api/documents/${DOC_ID}/audit?action=SNAPSHOT_CREATED`);
      const res = await getAuditRoute(req, { params: { id: DOC_ID } } as any);
      const body = await res.json();

      const passed =
        res.status === 200 &&
        body.logs?.length === 1 &&
        body.logs[0].action === AuditAction.SNAPSHOT_CREATED;

      console.log(`Test 7: GET /audit?action=SNAPSHOT_CREATED filters correctly -> ${passed ? 'PASSED' : 'FAILED'} (logs: ${body.logs?.length})`);
      if (!passed) testsPassed = false;
    }

  } catch (error) {
    console.error('An error occurred during audit verification:', error);
    testsPassed = false;
  } finally {
    // Restore originals
    auditRepository.logAction = originalLogAction;
    auditRepository.findLogsByDocument = originalFindLogsByDocument;
    documentRepository.createDocument = origCreateDoc;
    documentRepository.findById = origFindById;
    documentRepository.deleteDocument = origDeleteDoc;
    documentRepository.updateMemberRole = origUpdateMemberRole;
    documentRepository.findMember = origFindMember;
    userRepository.findById = origUserFindById;
    versionRepository.createVersion = origCreateVersion;
    versionRepository.findLatestVersion = origFindLatestVersion;
    versionRepository.findVersions = origFindVersions;
    syncRepository.getLatestVersion = origGetLatestVersion;
    syncRepository.createOperation = origCreateOperation;
    syncRepository.findOperations = origFindOperations;
    (prisma.documentVersion as any).findUnique = origPrismaDocVersionFindUnique;

    console.log(`=== Audit Tests Status: ${testsPassed ? 'SUCCESS' : 'FAILURE'} ===`);
    process.exit(testsPassed ? 0 : 1);
  }
}

if (require.main === module) {
  runAuditTests();
}
