"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import * as Y from "yjs"
import { apiGetWsToken, type Membership } from "@/lib/api-client"
import MembersPanel from "@/components/panels/members-panel"
import HistoryPanel from "@/components/panels/history-panel"
import AuditPanel from "@/components/panels/audit-panel"

// Browser-safe hex utility: Converts hex string back to a Uint8Array
function hexToUint8Array(hex: string): Uint8Array {
  const pairs = hex.match(/.{1,2}/g) ?? []
  return new Uint8Array(pairs.map((byte) => parseInt(byte, 16)))
}

// Browser-safe hex utility: Encodes a Uint8Array buffer into a hexadecimal string representation
function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("")
}

// Stable color palette for active user presence avatars
const PRESENCE_COLORS = [
  "#a855f7", "#6366f1", "#ec4899", "#f59e0b",
  "#10b981", "#3b82f6", "#f97316", "#14b8a6",
]

type WsStatus = "connecting" | "connected" | "disconnected"
type SidebarTab = "members" | "history" | "audit"

interface ActiveUser {
  user: { id: string; name: string; email: string }
  role: string
  cursor?: any
}

interface EditorClientProps {
  documentId: string
  initialTitle: string
  currentUserId: string
  currentUserRole: "OWNER" | "EDITOR" | "VIEWER"
  members: Membership[]
}

/**
 * EditorClient Component
 * Orchestrates the real-time collaborative editor using Yjs CRDTs over WebSockets.
 * Manages sidebars for collaborators, snapshot histories, and audit logs.
 */
export default function EditorClient({
  documentId,
  initialTitle,
  currentUserId,
  currentUserRole,
  members: initialMembers,
}: EditorClientProps) {
  const router = useRouter()

  // Yjs document container storing the synchronized CRDT state
  const ydocRef = useRef<Y.Doc | null>(null)

  // Active WebSocket reference connecting to the standalone sync server
  const wsRef = useRef<WebSocket | null>(null)

  // Ref referencing the HTML textarea element
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Unique client session ID to filter out self-broadcasted echo updates
  const clientId = useRef(`client-${Math.random().toString(36).slice(2)}`)

  // Tracks the current document version version sequence number acknowledged by the server
  const versionRef = useRef<number>(0)

  // State indicating if we are waiting for an acknowledgment ('ack') from the sync server
  const pendingAck = useRef(false)

  // Timers to handle debouncing and autosaving logic
  const autoSnapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasUnsavedChanges = useRef(false)
  const hasPendingUpdatesRef = useRef(false)
  const lastSyncedContent = useRef<string>("")
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // React States for UI synchronization
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting")
  const [wsError, setWsError] = useState<string | null>(null)
  const [content, setContent] = useState("")
  const [title, setTitle] = useState(initialTitle)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<SidebarTab>("members")
  const [members, setMembers] = useState<Membership[]>(initialMembers)
  const [historyVersion, setHistoryVersion] = useState(0)

  const isReadOnly = currentUserRole === "VIEWER"

  /**
   * Encodes the current local Yjs state and pushes a persistent snapshot to the server database.
   */
  async function handleSaveSnapshot() {
    if (!ydocRef.current || isReadOnly) return
    setSaveStatus("saving")
    try {
      // 1. Encode local Yjs doc state as a binary update buffer
      const update = Y.encodeStateAsUpdate(ydocRef.current)
      const hex = uint8ArrayToHex(update)

      // 2. Persist the snapshot via HTTP POST REST API
      const res = await fetch(`/api/documents/${documentId}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: hex }),
      })
      if (!res.ok) throw new Error("Failed to save snapshot.")

      setSaveStatus("saved")
      hasUnsavedChanges.current = false
      setHistoryVersion((v) => v + 1) // Trigger HistoryPanel component reload
      setTimeout(() => setSaveStatus("idle"), 2000)
    } catch (err: any) {
      setWsError(err.message || "Failed to save snapshot.")
      setSaveStatus("idle")
    }
  }

  /**
   * Pushes the latest unsynced Yjs updates to the WebSocket server.
   * Debounced to minimize unnecessary DB writes.
   */
  const sendPendingUpdate = useCallback(() => {
    // Queue updates if connection is offline/reconnecting
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      hasPendingUpdatesRef.current = true
      return
    }
    if (!ydocRef.current) return

    const currentText = textareaRef.current?.value || ""
    if (currentText === lastSyncedContent.current) return

    // Encode the entire local state as an update operation
    const update = Y.encodeStateAsUpdate(ydocRef.current)
    const change = uint8ArrayToHex(update)
    const version = versionRef.current + 1

    // Transmit update event to WebSocket sync server
    wsRef.current.send(JSON.stringify({
      event: "update",
      data: { clientId: clientId.current, version, change },
    }))

    pendingAck.current = true
    setSaveStatus("saving")
  }, [documentId])

  /**
   * Broadcasts a snapshot restore operation to all active sockets on the server.
   */
  const handleRestoreBroadcast = useCallback((version: number, change: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        event: "restore",
        data: { version, change }
      }))
    }
  }, [])

  // Clean up all debouncing/autosave timers when component unmounts
  useEffect(() => {
    return () => {
      if (autoSnapshotTimer.current) clearTimeout(autoSnapshotTimer.current)
      if (sendTimer.current) clearTimeout(sendTimer.current)
      if (titleTimer.current) clearTimeout(titleTimer.current)
    }
  }, [])

  // Listen to window online events to push changes queued during offline periods
  useEffect(() => {
    const handleOnline = () => {
      setWsError(null)
      if (hasPendingUpdatesRef.current) {
        hasPendingUpdatesRef.current = false
        sendPendingUpdate()
      }
    }
    window.addEventListener("online", handleOnline)
    return () => {
      window.removeEventListener("online", handleOnline)
    }
  }, [sendPendingUpdate])

  // Initialize standard Yjs Document and observe local/remote edits
  useEffect(() => {
    ydocRef.current = new Y.Doc()
    const ytext = ydocRef.current.getText("content")

    const observer = () => {
      const text = ytext.toString()
      setContent(text)

      // Update DOM textarea value only if user is not actively typing inside it
      if (textareaRef.current && document.activeElement !== textareaRef.current) {
        textareaRef.current.value = text
      }
    }

    ytext.observe(observer)
    return () => {
      ytext.unobserve(observer)
      ydocRef.current?.destroy()
    }
  }, [])

  // Automatically adjust textarea height based on content to prevent inner scrollbars
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [content])

  // Establish WebSocket connection and register message handlers
  useEffect(() => {
    let ws: WebSocket
    let destroyed = false

    async function connect() {
      setWsStatus("connecting")
      setWsError(null)

      try {
        // Authenticate connection request by retrieving a temporary token
        const token = await apiGetWsToken()
        if (destroyed) return

        const port = process.env.NEXT_PUBLIC_WS_PORT || "3001"
        ws = new WebSocket(`ws://localhost:${port}?token=${token}&documentId=${documentId}`)
        wsRef.current = ws

        ws.onopen = () => {
          if (!destroyed) {
            setWsStatus("connected")
            setWsError(null)
          }
        }

        ws.onclose = () => {
          if (!destroyed) {
            setWsStatus("disconnected")
            pendingAck.current = false
            // Reconnect logic: wait 3 seconds before retrying
            setTimeout(() => { if (!destroyed) connect() }, 3000)
          }
        }

        ws.onerror = () => {
          setWsError("WebSocket connection error. Retrying…")
          pendingAck.current = false
        }

        ws.onmessage = (event) => {
          if (destroyed) return
          try {
            const msg = JSON.parse(event.data)
            handleWsMessage(msg)
          } catch {
            // Ignore malformed payloads
          }
        }
      } catch (err: any) {
        if (!destroyed) {
          setWsStatus("disconnected")
          setWsError(err.message || "Failed to connect to sync server.")
        }
      }
    }

    connect()
    return () => {
      destroyed = true
      ws?.close()
    }
  }, [documentId])

  /**
   * Router/Dispatcher for incoming WebSocket events
   */
  const handleWsMessage = useCallback((msg: any) => {
    const { event, data } = msg

    if (event === "sync") {
      setWsError(null)
      // Replay all operations historically tracked in DB to load current document state
      if (data.operations && ydocRef.current) {
        ydocRef.current.transact(() => {
          for (const op of data.operations) {
            try {
              const update = hexToUint8Array(op.change)
              Y.applyUpdate(ydocRef.current!, update)
              versionRef.current = Math.max(versionRef.current, op.version)
            } catch { /* skip corrupted operation frames */ }
          }
        })
      }
      pendingAck.current = false
      if (hasPendingUpdatesRef.current) {
        hasPendingUpdatesRef.current = false
        sendPendingUpdate()
      } else {
        lastSyncedContent.current = textareaRef.current?.value || ""
      }
    } else if (event === "update") {
      // Apply remote delta edits into the Yjs Doc
      if (ydocRef.current && data.change) {
        try {
          const update = hexToUint8Array(data.change)
          Y.applyUpdate(ydocRef.current, update)
          versionRef.current = Math.max(versionRef.current, data.version)
          lastSyncedContent.current = ydocRef.current.getText("content").toString()
        } catch { /* ignore applyUpdate errors */ }
      }
    } else if (event === "ack") {
      // Server acknowledged our update!
      setWsError(null)
      versionRef.current = data.version
      pendingAck.current = false
      setSaveStatus("saved")
      lastSyncedContent.current = textareaRef.current?.value || ""

      // Dispatch next buffered changes if they accumulated during the request period
      if (hasPendingUpdatesRef.current) {
        hasPendingUpdatesRef.current = false
        sendPendingUpdate()
      } else {
        setTimeout(() => setSaveStatus("idle"), 2000)
      }
    } else if (event === "presence") {
      setActiveUsers(data.users || [])
    } else if (event === "join") {
      setActiveUsers((prev) => {
        const exists = prev.find((u) => u.user.id === data.user.id)
        if (exists) return prev
        return [...prev, { user: data.user, role: data.role }]
      })
    } else if (event === "leave") {
      setActiveUsers((prev) => prev.filter((u) => u.user.id !== data.userId))
    } else if (event === "cursor") {
      setActiveUsers((prev) =>
        prev.map((u) => (u.user.id === data.userId ? { ...u, cursor: data.cursor } : u))
      )
    } else if (event === "error") {
      setWsError(data.message)
      pendingAck.current = false
      hasPendingUpdatesRef.current = true

      // Conflict recovery: aligned sequence index if version conflict detected
      if (data.type === "VERSION_CONFLICT" && data.latestVersion !== undefined) {
        versionRef.current = Math.max(versionRef.current, data.latestVersion)
        if (hasPendingUpdatesRef.current) {
          hasPendingUpdatesRef.current = false
          sendPendingUpdate()
        }
      }
    }
  }, [sendPendingUpdate])

  /**
   * Captures document text editing. Translates raw input to transactional
   * CRDT updates inside the Yjs Document.
   */
  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (isReadOnly) return
    const newText = e.target.value

    hasUnsavedChanges.current = true

    // Apply delta edits in a Yjs transaction block
    if (ydocRef.current) {
      const ytext = ydocRef.current.getText("content")
      ydocRef.current.transact(() => {
        ytext.delete(0, ytext.length)
        ytext.insert(0, newText)
      })
    }

    setContent(newText)

    // Debounce pushing updates to WebSocket server (600ms typing gap)
    if (sendTimer.current) clearTimeout(sendTimer.current)
    sendTimer.current = setTimeout(() => {
      if (pendingAck.current) {
        hasPendingUpdatesRef.current = true
      } else {
        sendPendingUpdate()
      }
    }, 600)

    // Debounce autosnapshot creation (save snapshot after 20 seconds of typing inactivity)
    if (autoSnapshotTimer.current) clearTimeout(autoSnapshotTimer.current)
    autoSnapshotTimer.current = setTimeout(async () => {
      if (hasUnsavedChanges.current) {
        await handleSaveSnapshot()
      }
    }, 20000)
  }

  /**
   * Debounces document title changes and saves them to the database.
   */
  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newTitle = e.target.value
    setTitle(newTitle)
    if (titleTimer.current) clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(async () => {
      if (!newTitle.trim()) return
      try {
        const res = await fetch(`/api/documents/${documentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ title: newTitle.trim() }),
        })
        if (res.ok) setSaveStatus("saved")
      } catch { /* silent */ }
    }, 1000)
  }

  function getAvatarColor(index: number) {
    return PRESENCE_COLORS[index % PRESENCE_COLORS.length]
  }

  const wsStatusClasses = {
    connected: "bg-[#4ade80] shadow-[0_0_6px_#4ade80]",
    connecting: "bg-[#fbbf24] animate-pulse",
    disconnected: "bg-[#f87171]",
  }

  const saveStatusClasses = {
    saving: "text-[#fbbf24] animate-pulse",
    saved: "text-text-success",
    idle: "",
  }

  return (
    <div className="h-screen bg-bg-base flex flex-col font-sans text-text-primary">
      {/* ── Top Bar ── */}
      <header className="flex items-center gap-4 px-5 h-[52px] border-b border-border-subtle bg-bg-base/70 backdrop-blur-md sticky top-0 z-10 shrink-0">
        <button
          className="flex items-center gap-1.5 bg-none border-none text-text-secondary text-[0.825rem] font-semibold cursor-pointer py-1.5 px-2 rounded-sm transition-all duration-150 hover:text-text-primary hover:bg-bg-hover"
          onClick={() => router.push("/")}
          id="back-to-dashboard"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Dashboard
        </button>
        <div className="w-[1px] h-5 bg-border-default shrink-0" />

        <div className="flex-1 flex items-center gap-2 min-w-0">
          <input
            className="bg-transparent border-none outline-none text-[0.95rem] font-bold text-text-primary w-full min-w-0 py-1 px-1.5 rounded-sm transition-colors duration-150 hover:bg-bg-hover focus:bg-bg-hover focus:outline-2 focus:outline-accent-primary focus:outline-offset-1"
            value={title}
            onChange={handleTitleChange}
            disabled={isReadOnly}
            placeholder="Untitled Document"
            maxLength={100}
            id="doc-title-input"
          />
          <span className={`text-[0.73rem] text-text-muted whitespace-nowrap shrink-0 ${saveStatus !== "idle" ? saveStatusClasses[saveStatus] : ""}`}>
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved" && "✓ Saved"}
          </span>
        </div>

        {/* Presence avatars for real-time online users */}
        <div className="flex items-center -space-x-1.5 shrink-0">
          {activeUsers.map((u, i) => (
            <div
              key={u.user.id}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[0.72rem] font-bold text-white border-2 border-bg-base relative cursor-default group"
              style={{ background: getAvatarColor(i) }}
              title={`${u.user.name} (${u.role})`}
            >
              {u.user.name[0].toUpperCase()}
              <span className="absolute top-[calc(100%+6px)] left-1/2 -translate-x-1/2 bg-bg-elevated border border-border-default rounded-sm px-2.5 py-1 text-[0.72rem] whitespace-nowrap text-text-primary pointer-events-none opacity-0 transition-opacity duration-150 z-10 group-hover:opacity-100">{u.user.name}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isReadOnly && (
            <button
              className="btn btn-secondary text-[0.78rem] py-[0.35rem] px-[0.7rem] mr-2"
              id="save-snapshot-btn"
              onClick={handleSaveSnapshot}
              disabled={saveStatus === "saving"}
            >
              Save Snapshot
            </button>
          )}
          <button
            className="btn btn-secondary text-[0.78rem] py-[0.35rem] px-[0.7rem]"
            id="toggle-sidebar-btn"
            onClick={() => setSidebarOpen((o) => !o)}
          >
            {sidebarOpen ? "Hide Panel" : "Show Panel"}
          </button>
        </div>
      </header>

      {wsError && <div className="py-2 px-5 bg-danger-bg border-b border-danger-border text-danger-text text-sm text-center shrink-0">{wsError}</div>}

      {/* ── Main Layout ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Editor canvas */}
        <div className="flex-1 overflow-y-auto flex flex-col items-center py-12 px-8 bg-bg-base">
          <div className="w-full max-w-[780px] min-h-[calc(100vh-200px)] bg-bg-surface border border-border-subtle rounded-xl py-12 px-14 shadow-md">
            <textarea
              ref={textareaRef}
              className="w-full min-h-[500px] bg-transparent border-none outline-none resize-none overflow-hidden font-sans text-base leading-[1.8] text-text-primary caret-accent-primary"
              value={content}
              onChange={handleTextChange}
              readOnly={isReadOnly}
              placeholder={isReadOnly ? "You have read-only access to this document." : "Start writing your document here…"}
              spellCheck
              id="editor-textarea"
            />
          </div>
        </div>

        {/* Sidebar panels */}
        <aside className={`shrink-0 border-l border-border-subtle bg-bg-surface flex flex-col overflow-hidden transition-[width] duration-250 ${sidebarOpen ? "w-[340px]" : "w-0 border-l-0"}`}>
          <div className="flex border-b border-border-subtle shrink-0">
            {(["members", "history", "audit"] as SidebarTab[]).map((tab) => (
              <button
                key={tab}
                id={`sidebar-tab-${tab}`}
                className={`flex-1 py-3 px-2 bg-none border-none border-b-2 text-[0.775rem] font-semibold cursor-pointer transition-all duration-150 whitespace-nowrap ${activeTab === tab
                    ? "text-accent-primary border-b-accent-primary bg-accent-glow"
                    : "border-transparent text-text-muted hover:text-text-secondary hover:bg-bg-hover"
                  }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === "members" && (
              <MembersPanel
                documentId={documentId}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                members={members}
                onMembersChanged={async () => {
                  try {
                    const res = await fetch(`/api/documents/${documentId}`, { credentials: "include" })
                    if (res.ok) {
                      const data = await res.json()
                      if (data.document?.members) {
                        setMembers(data.document.members)
                      }
                    }
                  } catch { /* silent */ }
                }}
              />
            )}
            {activeTab === "history" && (
              <HistoryPanel
                key={historyVersion}
                documentId={documentId}
                canEdit={!isReadOnly}
                onRestore={handleRestoreBroadcast}
              />
            )}
            {activeTab === "audit" && (
              <AuditPanel documentId={documentId} />
            )}
          </div>
        </aside>
      </div>

      {/* ── Status Bar ── */}
      <div className="flex items-center gap-1.5 px-5 h-7 border-t border-border-subtle bg-bg-surface shrink-0">
        <div className={`w-[7px] h-[7px] rounded-full shrink-0 ${wsStatusClasses[wsStatus]}`} />
        <span className="text-[0.7rem] text-text-muted">
          {wsStatus === "connected" && `Connected · ${activeUsers.length} online`}
          {wsStatus === "connecting" && "Connecting to sync server…"}
          {wsStatus === "disconnected" && "Disconnected · Retrying…"}
        </span>
      </div>
    </div>
  )
}
