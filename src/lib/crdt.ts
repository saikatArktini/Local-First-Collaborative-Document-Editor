import * as Y from "yjs"

/**
 * Merges multiple Yjs binary update patches into a single cumulative update buffer.
 * This operation is fast, deterministic, and commutative.
 */
export function mergeCRDTUpdates(updates: Uint8Array[]): Uint8Array {
  if (updates.length === 0) {
    return new Uint8Array()
  }
  if (updates.length === 1) {
    return updates[0]
  }
  return Y.mergeUpdates(updates)
}
