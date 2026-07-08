import process from 'process';

// Force WS_PORT for test isolation
process.env.WS_PORT = '3002';

// Import mocks before importing the websocket server
import { documentRepository } from './src/server/repositories/document.repository';
import { userRepository } from './src/server/repositories/user.repository';
import { syncService } from './src/server/services/sync.service';
import { Role } from '@prisma/client';
import { generateToken } from './src/lib/jwt';
import WebSocket from 'ws';

// Mock Repository implementations
const originalFindMember = documentRepository.findMember;
const originalFindById = userRepository.findById;
const originalGetChanges = syncService.getChanges;
const originalSubmitChange = syncService.submitChange;

documentRepository.findMember = async (documentId: string, userId: string) => {
  if (userId === 'owner-1') {
    return { id: 'm1', documentId, userId, role: Role.OWNER, createdAt: new Date(), updatedAt: new Date() };
  }
  if (userId === 'editor-1') {
    return { id: 'm2', documentId, userId, role: Role.EDITOR, createdAt: new Date(), updatedAt: new Date() };
  }
  if (userId === 'viewer-1') {
    return { id: 'm3', documentId, userId, role: Role.VIEWER, createdAt: new Date(), updatedAt: new Date() };
  }
  return null; // Deny access
};

userRepository.findById = async (id: string) => {
  if (id === 'owner-1' || id === 'editor-1' || id === 'viewer-1' || id === 'unauthorized-1') {
    return {
      id,
      email: `${id}@example.com`,
      name: id === 'owner-1' ? 'Alice Owner' : id === 'editor-1' ? 'Bob Editor' : id === 'viewer-1' ? 'Charlie Viewer' : 'Unauthorized User',
      passwordHash: 'dummy-hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  return null;
};

syncService.getChanges = async (documentId: string, userId: string, sinceVersion: number) => {
  return [
    { id: 'op-init-1', clientId: 'client-initial', version: 1, change: '01020304' }
  ];
};

syncService.submitChange = async (documentId: string, userId: string, clientId: string, version: number, changeHex: string) => {
  if (version === 999) {
    return {
      success: false,
      error: 'VERSION_CONFLICT',
      latestVersion: 5,
      message: 'Mock version conflict',
    };
  }
  return {
    success: true,
    version,
  };
};

// Now import the websocket server to start it
// Dynamic import will be done inside the test runner to ensure environment variables are applied first

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectClient(userId: string, documentId: string): Promise<{
  ws: WebSocket;
  events: any[];
  errors: any[];
  closeInfo: { code?: number; reason?: string };
}> {
  const token = await generateToken({ userId, email: `${userId}@example.com` });
  const ws = new WebSocket(`ws://localhost:3002?token=${token}&documentId=${documentId}`);
  const events: any[] = [];
  const errors: any[] = [];
  const closeInfo: { code?: number; reason?: string } = {};

  ws.on('message', (data) => {
    try {
      events.push(JSON.parse(data.toString()));
    } catch {
      events.push(data.toString());
    }
  });

  ws.on('error', (err) => {
    errors.push(err);
  });

  ws.on('close', (code, reason) => {
    closeInfo.code = code;
    closeInfo.reason = reason.toString();
  });

  // Wait for connection to open, or fail if it closes immediately
  await new Promise<void>((resolve) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
    } else {
      ws.once('open', () => resolve());
      ws.once('close', () => resolve());
    }
  });

  return { ws, events, errors, closeInfo };
}

export async function runWebSocketTests() {
  console.log('=== Running WebSocket Collaborative Server Tests ===');
  let testsPassed = true;

  try {
    // Dynamic import to start WebSocket server on WS_PORT (3002)
    await import('./src/server/websocket');

    // 1. Connection with missing parameters should fail
    {
      const ws = new WebSocket(`ws://localhost:3002`);
      let closeCode: number | undefined;
      await new Promise<void>((resolve) => {
        ws.on('close', (code) => {
          closeCode = code;
          resolve();
        });
      });
      const passed = closeCode === 4000;
      console.log(`Test 1: Missing parameters rejection -> ${passed ? 'PASSED' : 'FAILED'} (Close Code: ${closeCode})`);
      if (!passed) testsPassed = false;
    }

    // 2. Unauthorized connection (no role on document) should fail
    {
      const { ws, closeInfo } = await connectClient('unauthorized-1', 'doc-1');
      await sleep(150);
      const passed = closeInfo.code === 4003;
      console.log(`Test 2: Access denied rejection -> ${passed ? 'PASSED' : 'FAILED'} (Close Code: ${closeInfo.code})`);
      if (!passed) testsPassed = false;
      ws.terminate();
    }

    // 3. Owner joins and receives sync / presence
    {
      const { ws, events } = await connectClient('owner-1', 'doc-1');
      await sleep(150);

      const hasSync = events.some(e => e.event === 'sync' && e.data?.operations?.length > 0);
      const hasPresence = events.some(e => e.event === 'presence' && e.data?.users?.some((u: any) => u.user.id === 'owner-1'));

      const passed = hasSync && hasPresence;
      console.log(`Test 3: Owner join sync & presence -> ${passed ? 'PASSED' : 'FAILED'} (Events: ${JSON.stringify(events)})`);
      if (!passed) testsPassed = false;
      ws.terminate();
    }

    // 4. Editor joins, broadcasts join to Owner, and gets full presence list
    {
      const ownerSession = await connectClient('owner-1', 'doc-1');
      await sleep(100);

      const editorSession = await connectClient('editor-1', 'doc-1');
      await sleep(150);

      const ownerReceivedJoin = ownerSession.events.some(e => e.event === 'join' && e.data?.user?.id === 'editor-1');
      const editorReceivedPresence = editorSession.events.some(
        e => e.event === 'presence' &&
          e.data?.users?.some((u: any) => u.user.id === 'owner-1') &&
          e.data?.users?.some((u: any) => u.user.id === 'editor-1')
      );

      const passed = ownerReceivedJoin && editorReceivedPresence;
      console.log(`Test 4: Join broadcast & presence updates -> ${passed ? 'PASSED' : 'FAILED'}`);
      if (!passed) testsPassed = false;

      // Keep sessions alive for subsequent tests
      // 5. Cursor movement broadcast
      editorSession.ws.send(JSON.stringify({
        event: 'cursor',
        data: { cursor: { line: 5, ch: 10 } }
      }));
      await sleep(150);

      const ownerReceivedCursor = ownerSession.events.some(
        e => e.event === 'cursor' && e.data?.userId === 'editor-1' && e.data?.cursor?.line === 5
      );
      console.log(`Test 5: Cursor broadcast -> ${ownerReceivedCursor ? 'PASSED' : 'FAILED'}`);
      if (!ownerReceivedCursor) testsPassed = false;

      // 6. Viewer join and update block (Read-Only)
      const viewerSession = await connectClient('viewer-1', 'doc-1');
      await sleep(100);

      viewerSession.ws.send(JSON.stringify({
        event: 'update',
        data: { clientId: 'client-v', version: 2, change: '112233' }
      }));
      await sleep(150);

      const viewerBlocked = viewerSession.events.some(
        e => e.event === 'error' && e.data?.message?.includes('Read-only')
      );
      console.log(`Test 6: Viewer read-only check -> ${viewerBlocked ? 'PASSED' : 'FAILED'}`);
      if (!viewerBlocked) testsPassed = false;
      viewerSession.ws.terminate();

      // 7. Editor updates document successfully (broadcasting to Owner & ack to Editor)
      editorSession.ws.send(JSON.stringify({
        event: 'update',
        data: { clientId: 'client-e', version: 2, change: 'aabbccdd' }
      }));
      await sleep(150);

      const editorAcked = editorSession.events.some(
        e => e.event === 'ack' && e.data?.version === 2 && e.data?.clientId === 'client-e'
      );
      const ownerReceivedUpdate = ownerSession.events.some(
        e => e.event === 'update' && e.data?.version === 2 && e.data?.change === 'aabbccdd'
      );

      const updatePassed = editorAcked && ownerReceivedUpdate;
      console.log(`Test 7: Editor update broadcast & ACK -> ${updatePassed ? 'PASSED' : 'FAILED'}`);
      if (!updatePassed) testsPassed = false;

      // 8. Version Conflict error handling
      editorSession.ws.send(JSON.stringify({
        event: 'update',
        data: { clientId: 'client-e', version: 999, change: 'deadbeef' }
      }));
      await sleep(150);

      const conflictHandled = editorSession.events.some(
        e => e.event === 'error' && e.data?.type === 'VERSION_CONFLICT' && e.data?.latestVersion === 5
      );
      console.log(`Test 8: Version conflict response -> ${conflictHandled ? 'PASSED' : 'FAILED'}`);
      if (!conflictHandled) testsPassed = false;

      // 9. Editor leaves and Owner receives leave event
      editorSession.ws.terminate();
      await sleep(150);

      const ownerReceivedLeave = ownerSession.events.some(
        e => e.event === 'leave' && e.data?.userId === 'editor-1'
      );
      console.log(`Test 9: Leave event broadcast -> ${ownerReceivedLeave ? 'PASSED' : 'FAILED'}`);
      if (!ownerReceivedLeave) testsPassed = false;

      ownerSession.ws.terminate();
    }

  } catch (error) {
    console.error('An error occurred during verification execution:', error);
    testsPassed = false;
  } finally {
    // Restore repository methods
    documentRepository.findMember = originalFindMember;
    userRepository.findById = originalFindById;
    syncService.getChanges = originalGetChanges;
    syncService.submitChange = originalSubmitChange;

    console.log(`=== WebSocket Tests Status: ${testsPassed ? 'SUCCESS' : 'FAILURE'} ===`);

    // Terminate test runner process cleanly
    process.exit(testsPassed ? 0 : 1);
  }
}

// Self executing if called directly
if (require.main === module) {
  runWebSocketTests();
}
