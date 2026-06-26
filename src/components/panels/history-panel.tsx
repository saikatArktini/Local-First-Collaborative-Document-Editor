"use client"

import { useState, useEffect } from "react"
import {
  apiGetHistory,
  apiRestoreSnapshot,
  apiCompareSnapshots,
  type VersionSnapshot,
} from "@/lib/api-client"

interface HistoryPanelProps {
  documentId: string
  canEdit: boolean
  onRestore?: (version: number, change: string) => void
}

/**
 * HistoryPanel component
 * Side panel rendering snapshot logs of the document.
 * Supports viewing specific snapshots, comparing two snapshots side-by-side,
 * and performing a state restore rollback to a target version.
 */
export default function HistoryPanel({ documentId, canEdit, onRestore }: HistoryPanelProps) {
  const [snapshots, setSnapshots] = useState<VersionSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [restoring, setRestoring] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [selectedRestoreVersion, setSelectedRestoreVersion] = useState<string>("")

  // Modal States
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState("")
  const [modalData, setModalData] = useState<{
    type: "preview" | "compare"
    contentA: string
    contentB?: string
    versionAId?: string
    versionBId?: string
    areIdentical?: boolean
  } | null>(null)

  useEffect(() => {
    loadHistory()
  }, [documentId])

  async function loadHistory() {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGetHistory(documentId)
      setSnapshots(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Manage selection (max 2 versions can be compared)
  function toggleSelect(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return [prev[1], id] // Keep only 2 selected
      return [...prev, id]
    })
  }

  /**
   * Compares the text content of two selected snapshots side-by-side.
   */
  async function handleCompare() {
    if (selected.length < 2) return
    setError(null)
    try {
      const snapA = snapshots.find(s => s.id === selected[0])
      const snapB = snapshots.find(s => s.id === selected[1])
      let olderId = selected[0]
      let newerId = selected[1]
      if (snapA && snapB) {
        const timeA = new Date(snapA.createdAt).getTime()
        const timeB = new Date(snapB.createdAt).getTime()
        if (timeA > timeB) {
          olderId = selected[1]
          newerId = selected[0]
        }
      }

      const result = await apiCompareSnapshots(documentId, olderId, newerId)
      setModalTitle("Compare Snapshot Versions")
      setModalData({
        type: "compare",
        contentA: result.contentA,
        contentB: result.contentB,
        versionAId: olderId,
        versionBId: newerId,
        areIdentical: result.areIdentical
      })
      setSelectedRestoreVersion(newerId)
      setModalOpen(true)
    } catch (e: any) {
      setError(e.message)
    }
  }

  /**
   * Opens a preview modal for a single selected snapshot.
   */
  async function handlePreview() {
    if (selected.length !== 1) return
    setError(null)
    try {
      const result = await apiCompareSnapshots(documentId, selected[0], selected[0])
      setModalTitle("Version Snapshot Preview")
      setModalData({
        type: "preview",
        contentA: result.contentA,
        versionAId: selected[0]
      })
      setModalOpen(true)
    } catch (e: any) {
      setError(e.message)
    }
  }

  /**
   * Restores document content to a selected historical snapshot by broadcasting
   * a revert transaction.
   */
  async function handleRestore(versionId: string) {
    if (!confirm("Restore document to this snapshot? This will create a new version.")) return
    setRestoring(versionId)
    setError(null)
    setActionMsg(null)
    try {
      const res = await apiRestoreSnapshot(documentId, versionId)
      setActionMsg("Document restored successfully. Reloading…")
      await loadHistory()
      if (onRestore && res.version && res.change) {
        onRestore(res.version, res.change)
      }
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (e: any) {
      setError(e.message)
      setRestoring(null)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-border-subtle shrink-0">
        <h3 className="text-[0.9rem] font-bold text-text-primary">Version History</h3>
        <button className="btn btn-secondary text-[0.78rem] py-[0.35rem] px-[0.7rem]" onClick={loadHistory} disabled={loading}>
          ↺ Refresh
        </button>
      </div>

      {error && <div className="error-msg mx-3 mt-3">{error}</div>}
      {actionMsg && <div className="success-msg mx-3 mt-3">{actionMsg}</div>}

      {selected.length > 0 && (
        <div className="flex items-center gap-2 py-2.5 px-4 bg-accent-glow border-b border-border-subtle shrink-0">
          <span className="text-[0.8rem] text-text-secondary">
            {selected.length === 1 ? "1 version selected" : "2 versions selected"}
          </span>
          {selected.length === 1 ? (
            <button className="btn btn-secondary text-[0.78rem] py-[0.35rem] px-[0.7rem]" onClick={handlePreview}>
              Preview
            </button>
          ) : (
            <button className="btn btn-secondary text-[0.78rem] py-[0.35rem] px-[0.7rem]" onClick={handleCompare}>
              Compare
            </button>
          )}
          <button className="btn btn-ghost text-[0.78rem]" onClick={() => { setSelected([]); setModalOpen(false); setModalData(null); }}>
            Clear
          </button>
        </div>
      )}

      {modalOpen && modalData && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]" 
          onClick={() => setModalOpen(false)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-xl w-[90%] max-w-[900px] max-h-[85vh] flex flex-col shadow-2xl" 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center p-[1.25rem_1.5rem] border-b border-zinc-800">
              <h3 className="m-0 text-[1.1rem] font-semibold text-zinc-100">
                {modalTitle}
              </h3>
              <button 
                className="bg-transparent border-none text-zinc-400 text-[1.2rem] cursor-pointer w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 hover:bg-zinc-800 hover:text-zinc-100"
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1">
              {modalData.type === "preview" ? (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[0.85rem] text-zinc-400">
                      Version ID: <code className="text-zinc-200">{modalData.versionAId}</code>
                    </span>
                  </div>
                  <textarea
                    readOnly
                    value={modalData.contentA}
                    className="w-full h-[350px] bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-zinc-200 font-mono text-[0.85rem] leading-normal resize-none outline-none"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {/* Status Banner */}
                  <div className={`p-3 rounded-md border text-sm font-semibold text-center ${modalData.areIdentical ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-red-500/10 border-red-500/20 text-red-500"}`}>
                    {modalData.areIdentical ? "✓ These two versions are identical." : "⚠ Differences detected between versions."}
                  </div>

                  {/* Side-by-side view */}
                  <div className="grid grid-cols-2 gap-5">
                    {(() => {
                      const snapOlder = snapshots.find(s => s.id === modalData.versionAId)
                      const snapNewer = snapshots.find(s => s.id === modalData.versionBId)
                      const dateOlderStr = snapOlder ? new Date(snapOlder.createdAt).toLocaleString() : ""
                      const dateNewerStr = snapNewer ? new Date(snapNewer.createdAt).toLocaleString() : ""

                      return (
                        <>
                          {/* Older version */}
                          <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center min-h-[24px]">
                              {canEdit ? (
                                <label className={`flex items-center gap-2 cursor-pointer text-[0.85rem] font-semibold ${selectedRestoreVersion === modalData.versionAId ? "text-text-primary" : "text-text-secondary"}`}>
                                  <input
                                    type="radio"
                                    name="restoreVersion"
                                    value={modalData.versionAId}
                                    checked={selectedRestoreVersion === modalData.versionAId}
                                    onChange={() => setSelectedRestoreVersion(modalData.versionAId || "")}
                                    className="accent-accent-primary cursor-pointer w-[15px] h-[15px]"
                                  />
                                  <span>Keep Older Version</span>
                                </label>
                              ) : (
                                <div className="text-[0.85rem] font-semibold text-text-secondary">
                                  Older Version
                                </div>
                              )}
                              <div className="flex gap-2 items-center text-[0.75rem] text-text-muted">
                                <span>{dateOlderStr}</span>
                                <code className="bg-white/5 px-1.5 py-0.5 rounded text-text-secondary">
                                  {modalData.versionAId?.slice(0, 8)}
                                </code>
                              </div>
                            </div>
                            <textarea
                              readOnly
                              value={modalData.contentA}
                              className="w-full h-[350px] bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-zinc-200 font-mono text-[0.85rem] leading-normal resize-none outline-none"
                            />
                          </div>

                          {/* Newer version */}
                          <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center min-h-[24px]">
                              {canEdit ? (
                                <label className={`flex items-center gap-2 cursor-pointer text-[0.85rem] font-semibold ${selectedRestoreVersion === modalData.versionBId ? "text-text-primary" : "text-text-secondary"}`}>
                                  <input
                                    type="radio"
                                    name="restoreVersion"
                                    value={modalData.versionBId}
                                    checked={selectedRestoreVersion === modalData.versionBId}
                                    onChange={() => setSelectedRestoreVersion(modalData.versionBId || "")}
                                    className="accent-accent-primary cursor-pointer w-[15px] h-[15px]"
                                  />
                                  <span>Keep Newer Version</span>
                                </label>
                              ) : (
                                <div className="text-[0.85rem] font-semibold text-text-secondary">
                                  Newer Version
                                </div>
                              )}
                              <div className="flex gap-2 items-center text-[0.75rem] text-text-muted">
                                <span>{dateNewerStr}</span>
                                <code className="bg-white/5 px-1.5 py-0.5 rounded text-text-secondary">
                                  {modalData.versionBId?.slice(0, 8)}
                                </code>
                              </div>
                            </div>
                            <textarea
                              readOnly
                              value={modalData.contentB}
                              className="w-full h-[350px] bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-zinc-200 font-mono text-[0.85rem] leading-normal resize-none outline-none"
                            />
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-[1rem_1.5rem] border-t border-zinc-800 flex justify-end gap-3">
              <button
                className="btn btn-secondary text-[0.85rem] py-[0.45rem] px-4"
                onClick={() => setModalOpen(false)}
              >
                Close
              </button>
              {modalData.type === "compare" && canEdit && (
                <button
                  className="btn btn-primary text-[0.85rem] py-[0.45rem] px-4"
                  disabled={!selectedRestoreVersion || !!restoring}
                  onClick={() => selectedRestoreVersion && handleRestore(selectedRestoreVersion)}
                >
                  {restoring ? (
                    <>
                      <span className="spinner w-3 h-3 border-2 border-white border-t-transparent" />
                      Restoring…
                    </>
                  ) : (
                    "Restore Selected Version"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-12 px-4 text-text-secondary text-[0.85rem]">
          <span className="spinner" />
          <span>Loading history…</span>
        </div>
      ) : snapshots.length === 0 ? (
        <div className="py-12 px-6 text-center text-text-muted text-[0.85rem] leading-relaxed">No snapshots yet. Save a snapshot from the editor to track versions.</div>
      ) : (
        <ul className="list-none overflow-y-auto flex-1 p-3 flex flex-col gap-1.5">
          {snapshots.map((snap) => {
            const isSelected = selected.includes(snap.id)
            const isRestoring = restoring === snap.id
            return (
              <li key={snap.id} className={`flex items-center gap-2.5 py-[0.65rem] px-[0.8rem] bg-bg-hover border border-border-subtle rounded-md transition-all duration-150 hover:bg-bg-active ${isSelected ? "border-accent-primary bg-accent-glow" : ""}`}>
                <input
                  type="checkbox"
                  className="accent-accent-primary cursor-pointer shrink-0"
                  checked={isSelected}
                  onChange={() => toggleSelect(snap.id)}
                  id={`snap-${snap.id}`}
                />
                <label htmlFor={`snap-${snap.id}`} className="flex-1 flex flex-col gap-0.5 cursor-pointer min-w-0">
                  <span className="text-[0.8rem] text-text-primary font-medium">
                    {new Date(snap.createdAt).toLocaleString()}
                  </span>
                  <span className="text-[0.7rem] text-text-muted font-mono" title={snap.id}>
                    {snap.id.slice(0, 8)}…
                  </span>
                </label>
                {canEdit && (
                  <button
                    className="btn btn-secondary text-[0.75rem] py-1 px-2"
                    onClick={() => handleRestore(snap.id)}
                    disabled={isRestoring}
                    title="Restore to this version"
                  >
                    {isRestoring ? <span className="spinner" /> : "Restore"}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
