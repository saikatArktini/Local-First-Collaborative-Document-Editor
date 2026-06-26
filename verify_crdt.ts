import * as Y from "yjs"
import { mergeCRDTUpdates } from "./src/lib/crdt"
import { subscribeToUpdates, broadcastUpdate } from "./src/lib/broadcast"

export async function runCRDTTests() {
  console.log("=== Running CRDT & Broadcast Integration Tests ===")

  // 1. Test Yjs CRDT Deterministic Merges
  {
    // Document A
    const ydocA = new Y.Doc()
    const ytextA = ydocA.getText("content")
    ytextA.insert(0, "Hello ")
    const updateA = Y.encodeStateAsUpdate(ydocA)

    // Document B (applies updateA and appends "World!")
    const ydocB = new Y.Doc()
    Y.applyUpdate(ydocB, updateA)
    const ytextB = ydocB.getText("content")
    ytextB.insert(6, "World!")
    const updateB = Y.encodeStateAsUpdate(ydocB)

    // Merge updates
    const mergedUpdate = mergeCRDTUpdates([updateA, updateB])

    // Apply merged updates to a clean Document C
    const ydocC = new Y.Doc()
    Y.applyUpdate(ydocC, mergedUpdate)
    const finalText = ydocC.getText("content").toString()

    const success = finalText === "Hello World!"
    console.log(`CRDT Merge Test: Text is "${finalText}" (Expected: "Hello World!") -> ${success ? "PASSED" : "FAILED"}`)
  }

  // 2. Test Real-time Broadcast Event Emitter
  {
    const documentId = "test-crdt-broadcast-doc-id"
    let receivedPayload: any = null

    // Subscribe
    const unsubscribe = subscribeToUpdates(documentId, (data) => {
      receivedPayload = data
    })

    // Trigger broadcast
    const mockPayload = {
      clientId: "client-mock-1",
      version: 5,
      change: "deadbeef"
    }
    broadcastUpdate(documentId, mockPayload)

    // Unsubscribe
    unsubscribe()

    // Verify
    const success = receivedPayload !== null &&
      receivedPayload.clientId === mockPayload.clientId &&
      receivedPayload.version === mockPayload.version &&
      receivedPayload.change === mockPayload.change

    console.log(`Real-Time Broadcast Event Test -> ${success ? "PASSED" : "FAILED"}`)
  }

  console.log("=== CRDT & Broadcast Tests Complete ===")
}

if (require.main === module) {
  runCRDTTests().catch((e) => {
    console.error("CRDT tests failed:", e);
    process.exit(1);
  });
}

