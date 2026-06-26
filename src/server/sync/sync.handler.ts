import { syncService } from '@/server/services/sync.service';
import { documentService } from '@/server/services/document.service';

export interface SyncInitResponse {
  documentId: string;
  title: string;
  role: string;
  baseState: string | null; // hex encoded
  latestVersion: number;
  changes: Array<{
    clientId: string;
    version: number;
    change: string; // hex encoded
  }>;
}

export interface SyncUpdateMessage {
  clientId: string;
  version: number;
  change: string; // hex encoded
}

export class SyncHandler {
  /**
   * Initializes synchronization for a document client.
   * Sends the base state (from the latest snapshot if available) and all delta changes.
   */
  async initializeSync(documentId: string, userId: string): Promise<SyncInitResponse> {
    // Retrieve the document (verifies view permissions)
    const doc = await documentService.getDocument(documentId, userId);
    
    // Fetch latest snapshot
    const latestSnapshot = await syncService.getLatestSnapshot(documentId, userId);
    const baseState = latestSnapshot ? latestSnapshot.snapshot : null;

    // Fetch all changes for this document since version 0 (or since snapshot version if snapshot is added)
    const changes = await syncService.getChanges(documentId, userId, 0);
    const latestVersion = changes.length > 0 ? Math.max(...changes.map((c) => c.version)) : 0;

    return {
      documentId: doc.id,
      title: doc.title,
      role: doc.role,
      baseState,
      latestVersion,
      changes: changes.map((c) => ({
        clientId: c.clientId,
        version: c.version,
        change: c.change,
      })),
    };
  }

  /**
   * Processes a client's delta change.
   * Applies the change if no version conflict is detected.
   */
  async processClientUpdate(
    documentId: string,
    userId: string,
    update: SyncUpdateMessage
  ) {
    // Submit the update to the sync service (verifies edit permissions and version constraints)
    const result = await syncService.submitChange(
      documentId,
      userId,
      update.clientId,
      update.version,
      update.change
    );

    if (!result.success && result.error === 'VERSION_CONFLICT') {
      // Return details of conflict so the client can pull changes and rebase
      const missingChanges = await syncService.getChanges(
        documentId,
        userId,
        update.version - 1
      );
      
      return {
        status: 'conflict',
        latestVersion: result.latestVersion,
        missingChanges: missingChanges.map((c) => ({
          clientId: c.clientId,
          version: c.version,
          change: c.change,
        })),
      };
    }

    return {
      status: 'success',
      version: update.version,
    };
  }
}

export const syncHandler = new SyncHandler();
