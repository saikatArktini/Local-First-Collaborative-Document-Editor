import { NextRequest } from 'next/server';
import { POST as createSnapshotRoute } from './src/app/api/documents/[id]/snapshot/route';
import { GET as getHistoryRoute } from './src/app/api/documents/[id]/history/route';
import { POST as compareRoute } from './src/app/api/documents/[id]/compare/route';
import { POST as restoreRoute } from './src/app/api/documents/[id]/restore/route';
import { documentRepository } from './src/server/repositories/document.repository';
import { userRepository } from './src/server/repositories/user.repository';
import { versionRepository } from './src/server/repositories/version.repository';
import { syncRepository } from './src/server/repositories/sync.repository';
import { syncService } from './src/server/services/sync.service';
import { auditRepository } from './src/server/repositories/audit.repository';
import { Role } from '@prisma/client';
import prisma from './src/lib/prisma';
import * as Y from 'yjs';

// Original methods
const originalFindMember = documentRepository.findMember;
const originalFindById = userRepository.findById;
const originalCreateVersion = versionRepository.createVersion;
const originalFindVersions = versionRepository.findVersions;
const originalFindLatestVersion = versionRepository.findLatestVersion;
const originalFindUniqueVersion = prisma.documentVersion.findUnique;
const originalGetLatestVersion = syncRepository.getLatestVersion;
const originalCreateOperation = syncRepository.createOperation;
const originalFindOperations = syncRepository.findOperations;
const originalLogAction = auditRepository.logAction;

// Mocks state
let versionsDb: any[] = [];
let operationsDb: any[] = [];
let latestVersionNum = 2;

// Injected Mocks
auditRepository.logAction = async (userId, action, documentId?, metadata?) => {
  return { id: 'log-id', userId, action, documentId: documentId ?? null, metadata: metadata ?? null, createdAt: new Date() } as any;
};

documentRepository.findMember = async (documentId: string, userId: string) => {
  if (userId === 'owner-1') return { id: 'm1', documentId, userId, role: Role.OWNER, createdAt: new Date(), updatedAt: new Date() };
  if (userId === 'viewer-1') return { id: 'm2', documentId, userId, role: Role.VIEWER, createdAt: new Date(), updatedAt: new Date() };
  return null;
};

userRepository.findById = async (id: string) => {
  return {
    id,
    email: `${id}@example.com`,
    name: `User ${id}`,
    passwordHash: 'dummy',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};

versionRepository.createVersion = async (documentId: string, createdBy: string, snapshot: Uint8Array) => {
  const version = {
    id: `00000000-0000-4000-a000-${String(versionsDb.length + 1).padStart(12, '0')}`,
    documentId,
    snapshot: Buffer.from(snapshot),
    createdBy,
    createdAt: new Date(),
    creator: { id: createdBy, name: `User ${createdBy}`, email: `${createdBy}@example.com` },
  };
  versionsDb.push(version);
  return version as any;
};

versionRepository.findVersions = async (documentId: string) => {
  return versionsDb.filter(v => v.documentId === documentId);
};

versionRepository.findLatestVersion = async (documentId: string) => {
  const filtered = versionsDb.filter(v => v.documentId === documentId);
  return filtered.length > 0 ? filtered[filtered.length - 1] : null;
};

(prisma.documentVersion.findUnique as any) = async (args: any) => {
  const id = args.where.id;
  const version = versionsDb.find(v => v.id === id);
  return version ? { ...version, snapshot: Buffer.from(version.snapshot) } : null;
};

syncRepository.getLatestVersion = async (documentId: string, userId: string) => {
  return latestVersionNum;
};

syncRepository.createOperation = async (documentId: string, userId: string, clientId: string, version: number, operation: Uint8Array) => {
  const op = { id: `op-${version}`, documentId, clientId, version, operation: Buffer.from(operation) };
  operationsDb.push(op);
  latestVersionNum = version;
  return op as any;
};

syncRepository.findOperations = async (documentId: string, userId: string, sinceVersion: number) => {
  return operationsDb.filter(op => op.documentId === documentId && op.version > sinceVersion);
};

// Create mock Request
function createMockRequest(url: string, bodyObj?: any, userId = 'owner-1'): NextRequest {
  const req = new NextRequest(url, {
    method: bodyObj ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });
  // Inject mock auth context
  (req as any).auth = { user: { id: userId, email: `${userId}@example.com`, name: `User ${userId}` } };
  return req;
}

export async function runVersionTests() {
  console.log('=== Running Document Version History Tests ===');
  let testsPassed = true;

  const docId = 'doc-1-uuid-0000-0000-000000000000';

  // Helper to generate a Yjs snapshot for string content
  const makeSnapshotHex = (textStr: string) => {
    const doc = new Y.Doc();
    const text = doc.getText('content');
    text.insert(0, textStr);
    return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('hex');
  };

  const snapshotAHex = makeSnapshotHex('Hello');
  const snapshotBHex = makeSnapshotHex('Hello World!');

  try {
    // 1. Store Snapshot (POST /api/documents/:id/snapshot)
    {
      const req = createMockRequest(`http://localhost:3000/api/documents/${docId}/snapshot`, {
        snapshot: snapshotAHex
      }, 'owner-1');
      const res = await createSnapshotRoute(req, { params: { id: docId } } as any);
      const body = await res.json();
      
      const passed = res.status === 201 && body.success === true && versionsDb.length === 1;
      console.log(`Test 1a: Store snapshot A (Owner) -> ${passed ? 'PASSED' : 'FAILED'} (Status: ${res.status})`);
      if (!passed) testsPassed = false;
    }

    {
      const req = createMockRequest(`http://localhost:3000/api/documents/${docId}/snapshot`, {
        snapshot: snapshotBHex
      }, 'viewer-1');
      const res = await createSnapshotRoute(req, { params: { id: docId } } as any);
      
      const passed = res.status === 403;
      console.log(`Test 1b: Store snapshot B (Viewer Blocked) -> ${passed ? 'PASSED' : 'FAILED'} (Status: ${res.status})`);
      if (!passed) testsPassed = false;
    }

    // Store version B as owner so we have two versions in db
    const reqStoreB = createMockRequest(`http://localhost:3000/api/documents/${docId}/snapshot`, {
      snapshot: snapshotBHex
    }, 'owner-1');
    await createSnapshotRoute(reqStoreB, { params: { id: docId } } as any);

    // 2. Fetch History (GET /api/documents/:id/history)
    {
      const req = createMockRequest(`http://localhost:3000/api/documents/${docId}/history`, undefined, 'owner-1');
      const res = await getHistoryRoute(req, { params: { id: docId } } as any);
      const body = await res.json();

      const passed = res.status === 200 && body.success === true && body.history?.length === 2;
      console.log(`Test 2: Fetch snapshot history list -> ${passed ? 'PASSED' : 'FAILED'} (History count: ${body.history?.length})`);
      if (!passed) testsPassed = false;
    }

    // 3. Compare Snapshots (POST /api/documents/:id/compare)
    {
      const versionAId = versionsDb[0].id;
      const versionBId = versionsDb[1].id;

      const req = createMockRequest(`http://localhost:3000/api/documents/${docId}/compare`, {
        versionAId,
        versionBId
      }, 'owner-1');
      const res = await compareRoute(req, { params: { id: docId } } as any);
      const body = await res.json();

      const comparison = body.comparison;
      console.log('Compare Response Body:', body);
      const passed = res.status === 200 && 
                     body.success === true && 
                     comparison?.contentA === 'Hello' && 
                     comparison?.contentB === 'Hello World!' && 
                     comparison?.areIdentical === false;

      console.log(`Test 3: Compare snapshot differences -> ${passed ? 'PASSED' : 'FAILED'} (contentA: "${comparison?.contentA}", contentB: "${comparison?.contentB}", identical: ${comparison?.areIdentical})`);
      if (!passed) testsPassed = false;
    }

    // 4. Restore Snapshot (POST /api/documents/:id/restore)
    {
      // The current state is snapshot B ('Hello World!'). We restore to version A ('Hello').
      // Let's populate the operations log first to represent current state
      operationsDb = [
        { id: 'op-1', documentId: docId, clientId: 'client-1', version: 1, operation: Buffer.from(Y.encodeStateAsUpdate(new Y.Doc())) }
      ];
      latestVersionNum = 1;

      const versionAId = versionsDb[0].id; // target is 'Hello'
      const req = createMockRequest(`http://localhost:3000/api/documents/${docId}/restore`, {
        versionId: versionAId
      }, 'owner-1');
      
      const res = await restoreRoute(req, { params: { id: docId } } as any);
      const body = await res.json();
      console.log('Restore Response Body:', body);

      // Check that a new version operation version was generated (latestVersion + 1 = 2)
      // Check that the history contains 3 versions now (version A, version B, and restored version A as the new V3 snapshot)
      const passed = res.status === 200 && 
                     body.success === true && 
                     latestVersionNum === 2 && 
                     versionsDb.length === 3;

      console.log(`Test 4: Restore previous snapshot state -> ${passed ? 'PASSED' : 'FAILED'} (New Head Version: ${latestVersionNum}, History Snapshots Count: ${versionsDb.length})`);
      if (!passed) testsPassed = false;
    }

  } catch (error) {
    console.error('An error occurred during verification execution:', error);
    testsPassed = false;
  } finally {
    // Restore original methods
    documentRepository.findMember = originalFindMember;
    userRepository.findById = originalFindById;
    versionRepository.createVersion = originalCreateVersion;
    versionRepository.findVersions = originalFindVersions;
    versionRepository.findLatestVersion = originalFindLatestVersion;
    prisma.documentVersion.findUnique = originalFindUniqueVersion;
    syncRepository.getLatestVersion = originalGetLatestVersion;
    syncRepository.createOperation = originalCreateOperation;
    syncRepository.findOperations = originalFindOperations;
    auditRepository.logAction = originalLogAction;

    console.log(`=== Version Tests Status: ${testsPassed ? 'SUCCESS' : 'FAILURE'} ===`);
    process.exit(testsPassed ? 0 : 1);
  }
}

if (require.main === module) {
  runVersionTests();
}
