import './env';
console.log('[WebSocket] Loaded environment variables.');
console.log('[WebSocket] DATABASE_URL configuration:', process.env.DATABASE_URL ? `${process.env.DATABASE_URL.substring(0, 30)}...` : 'undefined');
console.log('[WebSocket] NODE_ENV:', process.env.NODE_ENV);

import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from '../lib/jwt';
import { userRepository } from './repositories/user.repository';
import { getDocumentRole } from './permissions/document.permissions';
import { syncService } from './services/sync.service';
import { Role } from '@prisma/client';

const PORT = parseInt(process.env.WS_PORT || '3001', 10);
const wss = new WebSocketServer({ port: PORT });

interface ClientConnection {
  socket: WebSocket;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  role: Role;
  cursor?: any;
}

// Room mapping: documentId -> Map of active socket connections and user details
const rooms = new Map<string, Map<WebSocket, ClientConnection>>();

console.log(`[WebSocket] Standalone server running on ws://localhost:${PORT}`);

/**
 * WebSocket Server Connection Handler
 * Manages token verification, authorization checks, room routing,
 * real-time synchronization updates, presence propagation, and cursors.
 */
wss.on('connection', async (socket, req) => {
  let currentDocId: string | null = null;
  let currentClient: ClientConnection | null = null;

  try {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token');
    const documentId = url.searchParams.get('documentId');

    // 1. Verify required query parameters exist
    if (!token || !documentId) {
      socket.send(JSON.stringify({ event: 'error', data: { message: 'Missing token or documentId parameter' } }));
      socket.close(4000, 'Missing token or documentId');
      return;
    }

    currentDocId = documentId;

    // 2. Validate JWT credentials
    const decoded = await verifyToken(token);
    if (!decoded) {
      socket.send(JSON.stringify({ event: 'error', data: { message: 'Invalid or expired token' } }));
      socket.close(4001, 'Invalid token');
      return;
    }

    // 3. Retrieve user profile
    const user = await userRepository.findById(decoded.userId);
    if (!user) {
      socket.send(JSON.stringify({ event: 'error', data: { message: 'User not found' } }));
      socket.close(4002, 'User not found');
      return;
    }

    // 4. Verify user membership role on the target document
    const role = await getDocumentRole(documentId, user.id);
    if (!role) {
      socket.send(JSON.stringify({ event: 'error', data: { message: 'Access denied: you do not have permission to access this document' } }));
      socket.close(4003, 'Access denied');
      return;
    }

    // Initialize authenticated connection schema
    currentClient = {
      socket,
      userId: user.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      role,
    };

    // 5. Append client connection to room mapping
    if (!rooms.has(documentId)) {
      rooms.set(documentId, new Map());
    }
    const roomClients = rooms.get(documentId)!;
    roomClients.set(socket, currentClient);

    console.log(`[WebSocket] User ${user.name} (${role}) connected to room ${documentId}`);

    // Send historical operations list for synchronizing client Yjs CRDT state
    const operations = await syncService.getChanges(documentId, user.id, 0);
    socket.send(JSON.stringify({
      event: 'sync',
      data: { operations },
    }));

    // Broadcast user join event to all other room members
    const joinMsg = JSON.stringify({
      event: 'join',
      data: {
        user: currentClient.user,
        role: currentClient.role,
      },
    });
    for (const [otherSocket] of roomClients.entries()) {
      if (otherSocket !== socket) {
        otherSocket.send(joinMsg);
      }
    }

    // Send active presence details to the newly connected user
    const activeUsers = Array.from(roomClients.values()).map(c => ({
      user: c.user,
      role: c.role,
      cursor: c.cursor,
    }));
    socket.send(JSON.stringify({
      event: 'presence',
      data: { users: activeUsers },
    }));

    // Register event listeners for messages
    socket.on('message', async (messageData) => {
      if (!currentClient || !currentDocId) return;

      try {
        const message = JSON.parse(messageData.toString());
        const { event, data } = message;

        if (event === 'cursor') {
          // Update local cursor reference
          currentClient.cursor = data?.cursor;

          // Broadcast cursor to other room members
          const cursorMsg = JSON.stringify({
            event: 'cursor',
            data: {
              userId: currentClient.userId,
              cursor: currentClient.cursor,
            },
          });
          const room = rooms.get(currentDocId);
          if (room) {
            for (const [otherSocket] of room.entries()) {
              if (otherSocket !== socket) {
                otherSocket.send(cursorMsg);
              }
            }
          }
        } else if (event === 'update') {
          // Enforce write permission locks (Viewers are denied edit sync)
          if (currentClient.role === Role.VIEWER) {
            socket.send(JSON.stringify({
              event: 'error',
              data: { message: 'Read-only: Viewers cannot perform document updates' },
            }));
            return;
          }

          const { clientId, version, change } = data || {};
          if (!clientId || version === undefined || !change) {
            socket.send(JSON.stringify({
              event: 'error',
              data: { message: 'Malformed update payload: missing clientId, version, or change' },
            }));
            return;
          }

          // Persist the delta edit via syncService. P2002 duplicates handled transparently.
          const result = await syncService.submitChange(currentDocId, currentClient.userId, clientId, version, change);
          if (!result.success) {
            socket.send(JSON.stringify({
              event: 'error',
              data: {
                type: result.error,
                latestVersion: result.latestVersion,
                message: result.message,
              },
            }));
            return;
          }

          // Broadcast update successfully committed to all other room members
          const updateMsg = JSON.stringify({
            event: 'update',
            data: {
              clientId,
              version: result.version,
              change,
            },
          });
          const room = rooms.get(currentDocId);
          if (room) {
            for (const [otherSocket] of room.entries()) {
              if (otherSocket !== socket) {
                otherSocket.send(updateMsg);
              }
            }
          }

          // Acknowledge save write back to the sender
          socket.send(JSON.stringify({
            event: 'ack',
            data: {
              version: result.version,
              clientId,
            },
          }));
        } else if (event === 'restore') {
          // Enforce write privileges
          if (currentClient.role === Role.VIEWER) {
            return;
          }

          const { version, change } = data || {};
          if (version === undefined || !change) {
            return;
          }

          // Broadcast the snapshot restore update operation to other users
          const updateMsg = JSON.stringify({
            event: 'update',
            data: {
              clientId: `system-restore-${currentClient.userId}`,
              version,
              change,
            },
          });
          const room = rooms.get(currentDocId);
          if (room) {
            for (const [otherSocket] of room.entries()) {
              if (otherSocket !== socket) {
                otherSocket.send(updateMsg);
              }
            }
          }
        }
      } catch (err: any) {
        console.error('[WebSocket] Error processing message:', err);
        socket.send(JSON.stringify({
          event: 'error',
          data: { message: 'Invalid message payload or parsing error' },
        }));
      }
    });

    /**
     * Handles user connection teardown, removing sockets from rooms.
     */
    const handleDisconnect = () => {
      if (currentDocId && currentClient) {
        const roomClients = rooms.get(currentDocId);
        if (roomClients && roomClients.has(socket)) {
          roomClients.delete(socket);
          console.log(`[WebSocket] User ${currentClient.user.name} disconnected from room ${currentDocId}`);

          // Broadcast leave presence notification
          const leaveMsg = JSON.stringify({
            event: 'leave',
            data: {
              userId: currentClient.userId,
            },
          });
          for (const [otherSocket] of roomClients.entries()) {
            otherSocket.send(leaveMsg);
          }

          // Clean up room allocation mapping if empty
          if (roomClients.size === 0) {
            rooms.delete(currentDocId);
            console.log(`[WebSocket] Room ${currentDocId} is empty, cleaned up`);
          }
        }
      }
    };

    socket.on('close', handleDisconnect);
    socket.on('error', (err) => {
      console.error(`[WebSocket] Socket error for user ${user.name}:`, err);
      handleDisconnect();
    });

  } catch (err: any) {
    console.error('[WebSocket] Connection initialization error:', err);
    socket.send(JSON.stringify({ event: 'error', data: { message: 'Internal server initialization error' } }));
    socket.close(4500, 'Internal server error');
  }
});
