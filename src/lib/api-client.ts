/**
 * api-client.ts
 * Typed fetch helpers for all REST API routes.
 * Used exclusively in client components ('use client').
 */

type FetchOptions = Omit<RequestInit, "body"> & { body?: object }

async function apiFetch<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const { body, ...rest } = options
  const res = await fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...rest.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include", // Send NextAuth session cookie
  })

  const json = await res.json()

  if (!res.ok) {
    let message = `Request failed: ${res.status}`
    if (json) {
      if (json.error && typeof json.error === "object" && json.error.message) {
        message = json.error.message
      } else if (typeof json.error === "string") {
        message = json.error
      } else if (json.message) {
        message = json.message
      }
    }
    throw new Error(message)
  }

  return json as T
}

// ──────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────

export interface DocumentSummary {
  id: string
  title: string
  role: "OWNER" | "EDITOR" | "VIEWER"
  createdAt: string
  updatedAt: string
}

export interface DocumentDetail extends DocumentSummary {
  ydocState?: string | null
  currentVersion: number
}

export interface Membership {
  id: string
  documentId: string
  userId: string
  role: "OWNER" | "EDITOR" | "VIEWER"
  user?: {
    id: string
    name: string
    email: string
  }
}

export interface VersionSnapshot {
  id: string
  documentId: string
  createdBy: string
  createdAt: string
  snapshot?: string
}

export interface AuditEntry {
  id: string
  action: string
  userId: string
  actor: { name: string; email: string } | null
  metadata: any
  createdAt: string
}

export interface Change {
  id: string
  version: number
  change: string
  clientId: string
  createdAt: string
}

// ──────────────────────────────────────────────────
// Documents
// ──────────────────────────────────────────────────

export async function apiListDocuments(): Promise<DocumentSummary[]> {
  const data = await apiFetch<{ documents: DocumentSummary[] }>("/api/documents")
  return data.documents
}

export async function apiCreateDocument(
  title: string,
  initialContent?: string
): Promise<DocumentSummary> {
  const data = await apiFetch<{ document: DocumentSummary }>("/api/documents", {
    method: "POST",
    body: { title, ...(initialContent ? { initialContent } : {}) },
  })
  return data.document
}

export async function apiGetDocument(id: string): Promise<DocumentDetail> {
  const data = await apiFetch<{ document: DocumentDetail }>(`/api/documents/${id}`)
  return data.document
}

export async function apiRenameDocument(id: string, title: string): Promise<DocumentSummary> {
  const data = await apiFetch<{ document: DocumentSummary }>(`/api/documents/${id}`, {
    method: "PATCH",
    body: { title },
  })
  return data.document
}

export async function apiDeleteDocument(id: string): Promise<void> {
  await apiFetch(`/api/documents/${id}`, { method: "DELETE" })
}

// ──────────────────────────────────────────────────
// Members
// ──────────────────────────────────────────────────

export async function apiInviteMember(
  documentId: string,
  email: string,
  role: "EDITOR" | "VIEWER"
): Promise<Membership> {
  const data = await apiFetch<{ membership: Membership }>(
    `/api/documents/${documentId}/invite`,
    { method: "POST", body: { email, role } }
  )
  return data.membership
}

export async function apiUpdateMemberRole(
  documentId: string,
  memberId: string,
  role: "EDITOR" | "VIEWER"
): Promise<Membership> {
  const data = await apiFetch<{ membership: Membership }>(
    `/api/documents/${documentId}/member`,
    { method: "PATCH", body: { memberId, role } }
  )
  return data.membership
}

export async function apiRemoveMember(documentId: string, memberId: string): Promise<void> {
  await apiFetch(`/api/documents/${documentId}/member`, {
    method: "DELETE",
    body: { memberId },
  })
}

// ──────────────────────────────────────────────────
// History / Snapshots
// ──────────────────────────────────────────────────

export async function apiGetHistory(documentId: string): Promise<VersionSnapshot[]> {
  const data = await apiFetch<{ history: VersionSnapshot[] }>(
    `/api/documents/${documentId}/history`
  )
  return data.history
}

export async function apiCreateSnapshot(documentId: string, snapshot: string): Promise<VersionSnapshot> {
  const data = await apiFetch<{ version: VersionSnapshot }>(
    `/api/documents/${documentId}/snapshot`,
    { method: "POST", body: { snapshot } }
  )
  return data.version
}

export async function apiRestoreSnapshot(
  documentId: string,
  versionId: string
): Promise<{ success: boolean; version?: number; change?: string }> {
  const data = await apiFetch<{ result: { success: boolean; version?: number; change?: string } }>(
    `/api/documents/${documentId}/restore`,
    {
      method: "POST",
      body: { versionId },
    }
  )
  return data.result
}

export async function apiCompareSnapshots(
  documentId: string,
  versionAId: string,
  versionBId: string
): Promise<{ contentA: string; contentB: string; areIdentical: boolean }> {
  const data = await apiFetch<{ comparison: { contentA: string; contentB: string; areIdentical: boolean } }>(
    `/api/documents/${documentId}/compare`,
    { method: "POST", body: { versionAId, versionBId } }
  )
  return data.comparison
}

// ──────────────────────────────────────────────────
// Audit Log
// ──────────────────────────────────────────────────

export async function apiGetAuditLog(
  documentId: string,
  options: { action?: string; limit?: number } = {}
): Promise<{ logs: AuditEntry[]; total: number }> {
  const params = new URLSearchParams()
  if (options.action) params.set("action", options.action)
  if (options.limit) params.set("limit", String(options.limit))

  const query = params.toString() ? `?${params}` : ""
  const data = await apiFetch<{ logs: AuditEntry[]; total: number }>(
    `/api/documents/${documentId}/audit${query}`
  )
  return data
}

// ──────────────────────────────────────────────────
// WS Token
// ──────────────────────────────────────────────────

export async function apiGetWsToken(): Promise<string> {
  const data = await apiFetch<{ token: string }>("/api/auth/ws-token")
  return data.token
}
