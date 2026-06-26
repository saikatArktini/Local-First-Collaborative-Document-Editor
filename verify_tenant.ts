import { documentRepository } from './src/server/repositories/document.repository';
import { syncRepository } from './src/server/repositories/sync.repository';
import { versionRepository } from './src/server/repositories/version.repository';
import { Role } from '@prisma/client';
import prisma from './src/lib/prisma';

// Keep track of parameters passed to prisma
let lastFindFirstArgs: any = null;
let lastFindManyArgs: any = null;
let lastAggregateArgs: any = null;
let lastCreateArgs: any = null;
let lastDeleteArgs: any = null;

// Original Prisma methods
const originalDocFindFirst = prisma.document.findFirst;
const originalDocDelete = prisma.document.delete;
const originalDocUpdate = prisma.document.update;
const originalMemberFindFirst = prisma.documentMember.findFirst;
const originalMemberCreate = prisma.documentMember.create;
const originalMemberDelete = prisma.documentMember.delete;
const originalMemberUpdate = prisma.documentMember.update;
const originalSyncFindMany = prisma.syncOperation.findMany;
const originalSyncCreate = prisma.syncOperation.create;
const originalSyncAggregate = prisma.syncOperation.aggregate;
const originalSyncDeleteMany = prisma.syncOperation.deleteMany;
const originalVersionCreate = prisma.documentVersion.create;
const originalVersionFindFirst = prisma.documentVersion.findFirst;
const originalVersionFindMany = prisma.documentVersion.findMany;

// Set up Prisma mocks
(prisma.document.findFirst as any) = async (args: any) => {
  lastFindFirstArgs = args;
  return { id: args.where?.id || 'doc-1', ownerId: args.where?.ownerId || 'owner-1' };
};

(prisma.document.delete as any) = async (args: any) => {
  lastDeleteArgs = args;
  return { id: args.where?.id };
};

(prisma.document.update as any) = async (args: any) => {
  return { id: args.where?.id };
};

(prisma.documentMember.findFirst as any) = async (args: any) => {
  lastFindFirstArgs = args;
  const userId = args.where?.userId;
  const roleFilter = args.where?.role?.in;
  
  if (userId === 'user-alice' || userId === 'user-bob') {
    const role = userId === 'user-alice' ? Role.OWNER : Role.EDITOR;
    if (roleFilter && !roleFilter.includes(role)) {
      return null;
    }
    return { userId, documentId: 'doc-1', role };
  }
  if (userId === 'user-charlie') {
    const role = Role.VIEWER;
    if (roleFilter && !roleFilter.includes(role)) {
      return null;
    }
    return { userId, documentId: 'doc-1', role };
  }
  return null;
};

(prisma.documentMember.create as any) = async (args: any) => {
  lastCreateArgs = args;
  return { id: 'm-new' };
};

(prisma.documentMember.delete as any) = async (args: any) => {
  lastDeleteArgs = args;
  return { id: 'm-deleted' };
};

(prisma.documentMember.update as any) = async (args: any) => {
  return { id: 'm-updated' };
};

(prisma.syncOperation.findMany as any) = async (args: any) => {
  lastFindManyArgs = args;
  return [];
};

(prisma.syncOperation.create as any) = async (args: any) => {
  lastCreateArgs = args;
  return { id: 'op-1', version: args.data?.version };
};

(prisma.syncOperation.aggregate as any) = async (args: any) => {
  lastAggregateArgs = args;
  return { _max: { version: 5 } };
};

(prisma.syncOperation.deleteMany as any) = async (args: any) => {
  lastDeleteArgs = args;
  return { count: 1 };
};

(prisma.documentVersion.create as any) = async (args: any) => {
  lastCreateArgs = args;
  return { id: 'v-1' };
};

(prisma.documentVersion.findFirst as any) = async (args: any) => {
  lastFindFirstArgs = args;
  return null;
};

(prisma.documentVersion.findMany as any) = async (args: any) => {
  lastFindManyArgs = args;
  return [];
};

export async function runTenantTests() {
  console.log('=== Running Tenant Isolation Verification Tests ===');
  let testsPassed = true;

  try {
    // Test 1: findById Scoping
    {
      lastFindFirstArgs = null;
      await documentRepository.findById('doc-1', 'user-alice');
      
      const scopedToUser = lastFindFirstArgs?.where?.members?.some?.userId === 'user-alice';
      const docMatched = lastFindFirstArgs?.where?.id === 'doc-1';
      const passed = scopedToUser && docMatched;
      console.log(`Test 1: findById is scoped to caller user-alice -> ${passed ? 'PASSED' : 'FAILED'} (Args: ${JSON.stringify(lastFindFirstArgs)})`);
      if (!passed) testsPassed = false;
    }

    // Test 2: updateDocument Scoping
    {
      // Owner/Editor should succeed
      lastFindFirstArgs = null;
      await documentRepository.updateDocument('doc-1', 'user-bob', { title: 'New Title' });
      const checkedRole = lastFindFirstArgs?.where?.userId === 'user-bob' && lastFindFirstArgs?.where?.role?.in?.includes(Role.EDITOR);
      console.log(`Test 2a: updateDocument checks user-bob membership -> ${checkedRole ? 'PASSED' : 'FAILED'}`);
      if (!checkedRole) testsPassed = false;

      // Viewer/Non-member should throw
      try {
        await documentRepository.updateDocument('doc-1', 'user-charlie', { title: 'New Title' });
        console.log(`Test 2b: updateDocument allowed viewer-charlie (Expected throw) -> FAILED`);
        testsPassed = false;
      } catch (e: any) {
        const passed = e.message.includes('Access denied');
        console.log(`Test 2b: updateDocument throws Access denied for viewer-charlie -> ${passed ? 'PASSED' : 'FAILED'}`);
        if (!passed) testsPassed = false;
      }
    }

    // Test 3: deleteDocument Scoping
    {
      lastFindFirstArgs = null;
      lastDeleteArgs = null;
      await documentRepository.deleteDocument('doc-1', 'user-alice');

      const checkedOwner = lastFindFirstArgs?.where?.id === 'doc-1' && lastFindFirstArgs?.where?.ownerId === 'user-alice';
      const deletedDoc = lastDeleteArgs?.where?.id === 'doc-1';
      const passed = checkedOwner && deletedDoc;
      console.log(`Test 3: deleteDocument scopes lookup to ownerId user-alice -> ${passed ? 'PASSED' : 'FAILED'}`);
      if (!passed) testsPassed = false;
    }

    // Test 4: findOperations Scoping
    {
      lastFindManyArgs = null;
      await syncRepository.findOperations('doc-1', 'user-alice', 10);

      const scopedToUser = lastFindManyArgs?.where?.document?.members?.some?.userId === 'user-alice';
      const docMatched = lastFindManyArgs?.where?.documentId === 'doc-1';
      const versionMatched = lastFindManyArgs?.where?.version?.gt === 10;
      const passed = scopedToUser && docMatched && versionMatched;
      console.log(`Test 4: findOperations scopes query through document members -> ${passed ? 'PASSED' : 'FAILED'}`);
      if (!passed) testsPassed = false;
    }

    // Test 5: createOperation Scoping
    {
      // Editor should succeed
      lastFindFirstArgs = null;
      lastCreateArgs = null;
      await syncRepository.createOperation('doc-1', 'user-bob', 'client-1', 5, new Uint8Array());
      const checkedRole = lastFindFirstArgs?.where?.userId === 'user-bob' && lastFindFirstArgs?.where?.role?.in?.includes(Role.EDITOR);
      const createdOp = lastCreateArgs?.data?.version === 5;
      const passed = checkedRole && createdOp;
      console.log(`Test 5a: createOperation checks user-bob permissions -> ${passed ? 'PASSED' : 'FAILED'}`);
      if (!passed) testsPassed = false;

      // Viewer should fail
      try {
        await syncRepository.createOperation('doc-1', 'user-charlie', 'client-1', 6, new Uint8Array());
        console.log(`Test 5b: createOperation allowed viewer-charlie (Expected throw) -> FAILED`);
        testsPassed = false;
      } catch (e: any) {
        const passed = e.message.includes('Access denied');
        console.log(`Test 5b: createOperation throws Access denied for viewer-charlie -> ${passed ? 'PASSED' : 'FAILED'}`);
        if (!passed) testsPassed = false;
      }
    }

    // Test 6: createVersion Scoping
    {
      // Owner should succeed
      lastFindFirstArgs = null;
      lastCreateArgs = null;
      await versionRepository.createVersion('doc-1', 'user-alice', new Uint8Array());
      const checkedRole = lastFindFirstArgs?.where?.userId === 'user-alice' && lastFindFirstArgs?.where?.role?.in?.includes(Role.OWNER);
      const createdVersion = lastCreateArgs?.data?.documentId === 'doc-1';
      const passed = checkedRole && createdVersion;
      console.log(`Test 6a: createVersion checks user-alice permissions -> ${passed ? 'PASSED' : 'FAILED'}`);
      if (!passed) testsPassed = false;

      // Viewer should fail
      try {
        await versionRepository.createVersion('doc-1', 'user-charlie', new Uint8Array());
        console.log(`Test 6b: createVersion allowed viewer-charlie (Expected throw) -> FAILED`);
        testsPassed = false;
      } catch (e: any) {
        const passed = e.message.includes('Access denied');
        console.log(`Test 6b: createVersion throws Access denied for viewer-charlie -> ${passed ? 'PASSED' : 'FAILED'}`);
        if (!passed) testsPassed = false;
      }
    }

  } catch (error) {
    console.error('An error occurred during verification execution:', error);
    testsPassed = false;
  } finally {
    // Restore original Prisma methods
    prisma.document.findFirst = originalDocFindFirst;
    prisma.document.delete = originalDocDelete;
    prisma.document.update = originalDocUpdate;
    prisma.documentMember.findFirst = originalMemberFindFirst;
    prisma.documentMember.create = originalMemberCreate;
    prisma.documentMember.delete = originalMemberDelete;
    prisma.documentMember.update = originalMemberUpdate;
    prisma.syncOperation.findMany = originalSyncFindMany;
    prisma.syncOperation.create = originalSyncCreate;
    prisma.syncOperation.aggregate = originalSyncAggregate;
    prisma.syncOperation.deleteMany = originalSyncDeleteMany;
    prisma.documentVersion.create = originalVersionCreate;
    prisma.documentVersion.findFirst = originalVersionFindFirst;
    prisma.documentVersion.findMany = originalVersionFindMany;

    console.log(`=== Tenant Tests Status: ${testsPassed ? 'SUCCESS' : 'FAILURE'} ===`);
    process.exit(testsPassed ? 0 : 1);
  }
}

if (require.main === module) {
  runTenantTests();
}
