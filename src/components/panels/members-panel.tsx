"use client"

import { useState, useEffect } from "react"
import { apiUpdateMemberRole, apiRemoveMember, type Membership } from "@/lib/api-client"
import InviteModal from "../modals/invite-modal"

interface MembersPanelProps {
  documentId: string
  currentUserId: string
  currentUserRole: "OWNER" | "EDITOR" | "VIEWER"
  members: Membership[]
  onMembersChanged: () => void
}

/**
 * MembersPanel component
 * Side panel listing the active collaborators of the document, their roles,
 * and handles adding, editing, or deleting memberships.
 */
export default function MembersPanel({
  documentId,
  currentUserId,
  currentUserRole,
  members: initialMembers,
  onMembersChanged,
}: MembersPanelProps) {
  const [members, setMembers] = useState(initialMembers)
  const [showInvite, setShowInvite] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setMembers(initialMembers), [initialMembers])

  const isOwner = currentUserRole === "OWNER"

  /**
   * Modifies the role of a collaborator (Editor vs Viewer). Only Owners can perform this action.
   */
  async function handleRoleChange(memberId: string, role: "EDITOR" | "VIEWER") {
    setError(null)
    setLoadingId(memberId)
    try {
      const updated = await apiUpdateMemberRole(documentId, memberId, role)
      setMembers((prev) => prev.map((m) => (m.userId === memberId ? { ...m, role: updated.role } : m)))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingId(null)
    }
  }

  /**
   * Revokes a collaborator's access to the document. Only Owners can perform this action.
   */
  async function handleRemove(memberId: string) {
    if (!confirm("Remove this collaborator from the document?")) return
    setError(null)
    setLoadingId(memberId)
    try {
      await apiRemoveMember(documentId, memberId)
      setMembers((prev) => prev.filter((m) => m.userId !== memberId))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingId(null)
    }
  }

  // Resolves the class name for membership badges
  function roleBadgeClass(role: string) {
    if (role === "OWNER") return "badge badge-owner"
    if (role === "EDITOR") return "badge badge-editor"
    return "badge badge-viewer"
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-border-subtle shrink-0">
        <h3 className="text-[0.9rem] font-bold text-text-primary">Collaborators</h3>
        {isOwner && (
          <button
            id="invite-btn"
            className="btn btn-primary text-[0.8rem] py-[0.4rem] px-[0.85rem]"
            onClick={() => setShowInvite(true)}
          >
            + Invite
          </button>
        )}
      </div>

      {error && <div className="error-msg mb-4 mx-3 mt-3">{error}</div>}

      <ul className="list-none overflow-y-auto flex-1 p-3 flex flex-col gap-2">
        {members.map((m) => {
          const isLoading = loadingId === m.userId
          const isSelf = m.userId === currentUserId
          const canManage = isOwner && !isSelf && m.role !== "OWNER"

          return (
            <li key={m.userId} className="flex items-center gap-3 p-3 bg-bg-hover border border-border-subtle rounded-md transition-colors duration-150 hover:bg-bg-active">
              <div className="w-[34px] h-[34px] rounded-full bg-accent-gradient flex items-center justify-center text-[0.85rem] font-bold text-white shrink-0">
                {(m.user?.name?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[0.85rem] font-semibold text-text-primary truncate">
                  {m.user?.name ?? "Unknown"} {isSelf && <span className="text-text-muted text-[0.75em]">(you)</span>}
                </span>
                <span className="text-[0.75rem] text-text-muted truncate">{m.user?.email}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {canManage ? (
                  <>
                    <select
                      className="form-select text-[0.78rem] p-[0.3rem_0.5rem] w-auto"
                      value={m.role}
                      disabled={isLoading}
                      onChange={(e) => handleRoleChange(m.userId, e.target.value as "EDITOR" | "VIEWER")}
                    >
                      <option value="EDITOR">Editor</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                    <button
                      className="btn btn-danger text-[0.78rem] p-[0.3rem_0.6rem]"
                      disabled={isLoading}
                      onClick={() => handleRemove(m.userId)}
                    >
                      {isLoading ? <span className="spinner" /> : "Remove"}
                    </button>
                  </>
                ) : (
                  <span className={roleBadgeClass(m.role)}>{m.role}</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {showInvite && (
        <InviteModal
          documentId={documentId}
          onClose={() => setShowInvite(false)}
          onSuccess={() => {
            setShowInvite(false)
            onMembersChanged()
          }}
        />
      )}
    </div>
  )
}
