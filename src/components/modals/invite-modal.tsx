"use client"

import { useState, useRef, useEffect } from "react"
import { apiInviteMember } from "@/lib/api-client"

interface InviteModalProps {
  documentId: string
  onClose: () => void
  onSuccess: () => void
}

/**
 * InviteModal component
 * Allows document owners to invite other users via email and select their role.
 */
export default function InviteModal({ documentId, onClose, onSuccess }: InviteModalProps) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"EDITOR" | "VIEWER">("EDITOR")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input automatically
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      await apiInviteMember(documentId, email, role)
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to invite collaborator.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h2 className="modal-title">Invite Collaborator</h2>
        <p className="modal-subtitle">Add a registered user to this document by their email address.</p>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="invite-email">Email Address</label>
            <input
              ref={inputRef}
              id="invite-email"
              type="email"
              className="form-input"
              placeholder="collaborator@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="invite-role">Role</label>
            <select
              id="invite-role"
              className="form-select"
              value={role}
              onChange={(e) => setRole(e.target.value as "EDITOR" | "VIEWER")}
            >
              <option value="EDITOR">Editor — can read and write</option>
              <option value="VIEWER">Viewer — can only read</option>
            </select>
          </div>

          <div className="btn-row">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? <><span className="spinner" /> Inviting…</> : "Send Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
