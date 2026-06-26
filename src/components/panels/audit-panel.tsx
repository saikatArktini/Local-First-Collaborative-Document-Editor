"use client"

import { useState, useEffect } from "react"
import { apiGetAuditLog, type AuditEntry } from "@/lib/api-client"

const ACTION_COLORS: Record<string, string> = {
  DOCUMENT_CREATED: "#4ade80",
  DOCUMENT_DELETED: "#f87171",
  ROLE_CHANGED: "#fbbf24",
  SNAPSHOT_CREATED: "#60a5fa",
  RESTORE_PERFORMED: "#a78bfa",
  SYNC_FAILED: "#f87171",
}

interface AuditPanelProps {
  documentId: string
}

/**
 * AuditPanel component
 * Side panel listing user activities and operations on the document.
 * Includes filtering by action type, view detail popups for snapshot and restore metadata.
 */
export default function AuditPanel({ documentId }: AuditPanelProps) {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const [limit, setLimit] = useState(50)
  const [activeMetadata, setActiveMetadata] = useState<{
    action: string
    actorName: string
    actorEmail: string
    timestamp: string
    data: Record<string, any>
  } | null>(null)

  useEffect(() => {
    loadLogs()
  }, [documentId, filter, limit])

  async function loadLogs() {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGetAuditLog(documentId, {
        action: filter || undefined,
        limit,
      })
      setLogs(data.logs)
      setTotal(data.total)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Prettifies metadata camelCase keys for tabular listing
  function formatKey(key: string): string {
    const spaced = key.replace(/[_-]/g, " ")
    const camelSpaced = spaced.replace(/([a-z])([A-Z])/g, "$1 $2")
    return camelSpaced
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  const actionOptions = [
    "",
    "DOCUMENT_CREATED",
    "DOCUMENT_DELETED",
    "ROLE_CHANGED",
    "SNAPSHOT_CREATED",
    "RESTORE_PERFORMED",
    "SYNC_FAILED",
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-border-subtle shrink-0">
        <h3 className="text-[0.9rem] font-bold text-text-primary">Audit Log</h3>
        <div className="flex gap-2 items-center">
          <select
            className="form-select text-[0.78rem] p-[0.3rem_0.5rem] w-auto"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {actionOptions.map((a) => (
              <option key={a} value={a}>{a || "All events"}</option>
            ))}
          </select>
          <button 
            className="btn btn-secondary text-[0.78rem] p-[0.35rem_0.7rem]" 
            onClick={loadLogs} 
            disabled={loading}
            title="Refresh logs"
          >
            ↺
          </button>
        </div>
      </div>

      {error && <div className="error-msg m-3">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-12 px-4 text-text-secondary text-[0.85rem]">
          <span className="spinner" />
          <span>Loading logs…</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="py-12 px-6 text-center text-text-muted text-[0.85rem] leading-relaxed">No audit events found.</div>
      ) : (
        <>
          <div className="px-4 py-1.5 text-[0.75rem] text-text-muted shrink-0">
            Showing {logs.length} of {total} events
          </div>
          <ul className="list-none overflow-y-auto flex-1 p-3 flex flex-col gap-1.5">
            {logs.map((log) => {
              const color = ACTION_COLORS[log.action] ?? "var(--text-secondary)"
              return (
                <li key={log.id} className="flex items-start gap-3 p-3 bg-bg-hover border border-border-subtle rounded-md transition-colors duration-150 hover:bg-bg-active">
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: color }} />
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="text-[0.8rem] font-semibold" style={{ color }}>
                      {log.action.replace(/_/g, " ")}
                    </div>
                    <div className="text-[0.73rem] text-text-muted">
                      {log.actor?.name ?? "Unknown"} · {log.actor?.email}
                    </div>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div className="mt-1">
                        <button
                          type="button"
                          className="text-[0.7rem] text-accent-primary hover:underline font-semibold cursor-pointer"
                          onClick={() => setActiveMetadata({
                            action: log.action,
                            actorName: log.actor?.name ?? "Unknown",
                            actorEmail: log.actor?.email ?? "",
                            timestamp: new Date(log.createdAt).toLocaleString(),
                            data: log.metadata
                          })}
                        >
                          View Details
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="text-[0.7rem] text-text-muted whitespace-nowrap shrink-0 pt-0.5">
                    {new Date(log.createdAt).toLocaleString()}
                  </div>
                </li>
              )
            })}
          </ul>
          {total > limit && (
            <button
              className="btn btn-ghost w-full mt-3 text-[0.8rem]"
              onClick={() => setLimit((l) => l + 50)}
            >
              Load more ({total - limit} remaining)
            </button>
          )}
        </>
      )}

      {/* Metadata Details Modal */}
      {activeMetadata && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setActiveMetadata(null)}
        >
          <div 
            className="bg-bg-elevated border border-border-default rounded-xl w-full max-w-lg shadow-2xl flex flex-col animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-border-subtle">
              <div>
                <h3 className="text-base font-bold text-text-primary">
                  {activeMetadata.action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())} Details
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Logged at {activeMetadata.timestamp}
                </p>
              </div>
              <button 
                className="bg-transparent border-none text-text-secondary text-lg cursor-pointer w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-bg-hover hover:text-text-primary"
                onClick={() => setActiveMetadata(null)}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[60vh] flex flex-col gap-4">
              {/* Actor Info Card */}
              <div className="p-3 bg-bg-surface border border-border-subtle rounded-lg flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-accent-gradient flex items-center justify-center text-sm font-bold text-white shrink-0">
                  {(activeMetadata.actorName?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex flex-col">
                  <span className="text-xs font-semibold text-text-primary truncate">
                    {activeMetadata.actorName}
                  </span>
                  <span className="text-[0.7rem] text-text-muted truncate">
                    {activeMetadata.actorEmail}
                  </span>
                </div>
              </div>

              {/* Metadata Fields */}
              <div className="bg-bg-surface border border-border-subtle rounded-lg p-4">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border-default text-text-muted text-[0.7rem] uppercase tracking-wider text-left">
                      <th className="pb-2 font-semibold">Field</th>
                      <th className="pb-2 font-semibold">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {Object.entries(activeMetadata.data).map(([key, val]) => {
                      const label = formatKey(key)
                      const isCode = typeof val === "string" && (val.length >= 8 && (/^[0-9a-fA-F-]+$/.test(val) || val.includes("-")))
                      return (
                        <tr key={key} className="hover:bg-bg-hover transition-colors">
                          <td className="py-2 pr-4 font-semibold text-text-secondary text-xs whitespace-nowrap pt-2">{label}</td>
                          <td className="py-2 text-text-primary text-xs break-all pt-2">
                            {isCode ? (
                              <code className="bg-bg-base border border-border-default rounded px-1.5 py-0.5 font-mono text-[0.72rem] text-text-primary break-all">
                                {val}
                              </code>
                            ) : typeof val === "object" && val !== null ? (
                              <pre className="font-mono text-[0.7rem] bg-bg-base border border-border-default rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">{JSON.stringify(val, null, 2)}</pre>
                            ) : (
                              String(val)
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-border-subtle flex justify-end">
              <button 
                className="btn btn-secondary text-xs px-4 py-1.5"
                onClick={() => setActiveMetadata(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
