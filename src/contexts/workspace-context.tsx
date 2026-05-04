'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Workspace, WorkspaceMember } from '@/types/database'

type MembershipWithWorkspace = WorkspaceMember & { workspace: Workspace }

interface WorkspaceContextType {
  workspaceId: number
  role: 'dono' | 'coordenador' | 'corretor'
  workspace: Workspace
  memberships: MembershipWithWorkspace[]
  switchWorkspace: (id: number) => void
  leaveWorkspace: (wsId: number) => Promise<boolean>
  refreshWorkspace: () => Promise<void>
  newWorkspacesCount: number
  markAllSeen: () => void
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null)

const STORAGE_KEY = 'provascan_workspace_id'
const SEEN_KEY = 'provascan_seen_workspaces'

interface Props {
  userId: string
  children: React.ReactNode
}

async function loadMembershipsData(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<MembershipWithWorkspace[]> {
  const { data } = await supabase
    .from('workspace_members')
    .select('*, workspace:workspaces(*)')
    .eq('user_id', userId)

  return (data as unknown as MembershipWithWorkspace[]) ?? []
}

function readSeenWorkspaceIds(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
  } catch {
    return []
  }
}

function writeSeenWorkspaceIds(ids: number[]) {
  localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(new Set(ids))))
}

export function WorkspaceProvider({ userId, children }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [memberships, setMemberships] = useState<MembershipWithWorkspace[]>([])
  const [currentWsId, setCurrentWsId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const applyMemberships = useCallback((typed: MembershipWithWorkspace[]) => {
    setMemberships(typed)

    if (typed.length === 0) {
      setCurrentWsId(null)
      return
    }

    const stored = localStorage.getItem(STORAGE_KEY)
    const storedId = stored ? Number(stored) : null
    const valid = typed.find((membership) => membership.workspace_id === storedId)
    const seenIds = readSeenWorkspaceIds()
    const unseenInvites = [...typed]
      .filter((membership) => membership.role !== 'dono' && !seenIds.includes(membership.workspace_id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    if (unseenInvites.length > 0) {
      const newestInvite = unseenInvites[0]
      setCurrentWsId(newestInvite.workspace_id)
      localStorage.setItem(STORAGE_KEY, String(newestInvite.workspace_id))
      writeSeenWorkspaceIds([...seenIds, newestInvite.workspace_id])
      return
    }

    if (valid) {
      setCurrentWsId(valid.workspace_id)
      return
    }

    const owned = typed.find((membership) => membership.role === 'dono')
    const first = owned || typed[0]
    setCurrentWsId(first.workspace_id)
    localStorage.setItem(STORAGE_KEY, String(first.workspace_id))
  }, [])

  const fetchMemberships = useCallback(async () => {
    const typed = await loadMembershipsData(supabase, userId)
    applyMemberships(typed)
    setLoading(false)
  }, [applyMemberships, supabase, userId])

  useEffect(() => {
    let cancelled = false

    async function syncMemberships() {
      const typed = await loadMembershipsData(supabase, userId)
      if (cancelled) return
      applyMemberships(typed)
      setLoading(false)
    }

    void syncMemberships()

    return () => {
      cancelled = true
    }
  }, [applyMemberships, supabase, userId])

  const switchWorkspace = useCallback((id: number) => {
    setCurrentWsId(id)
    localStorage.setItem(STORAGE_KEY, String(id))
  }, [])

  const leaveWorkspace = useCallback(async (wsId: number): Promise<boolean> => {
    const membership = memberships.find((item) => item.workspace_id === wsId)
    if (!membership || membership.role === 'dono') return false

    const { error } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', wsId)
      .eq('user_id', userId)

    if (error) return false

    if (currentWsId === wsId) {
      const owned = memberships.find((item) => item.workspace_id !== wsId && item.role === 'dono')
      const fallback = owned || memberships.find((item) => item.workspace_id !== wsId)
      if (fallback) {
        setCurrentWsId(fallback.workspace_id)
        localStorage.setItem(STORAGE_KEY, String(fallback.workspace_id))
      }
    }

    await fetchMemberships()
    return true
  }, [currentWsId, fetchMemberships, memberships, supabase, userId])

  const newWorkspacesCount = useMemo(() => {
    if (typeof window === 'undefined') return 0
    const seen = readSeenWorkspaceIds()
    return memberships.filter((membership) => !seen.includes(membership.workspace_id)).length
  }, [memberships])

  const markAllSeen = useCallback(() => {
    const ids = memberships.map((membership) => membership.workspace_id)
    writeSeenWorkspaceIds(ids)
  }, [memberships])

  if (loading || !currentWsId) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    )
  }

  const currentMembership = memberships.find((membership) => membership.workspace_id === currentWsId)!
  const currentWorkspace = currentMembership.workspace

  return (
    <WorkspaceContext.Provider
      value={{
        workspaceId: currentWsId,
        role: currentMembership.role,
        workspace: currentWorkspace,
        memberships,
        switchWorkspace,
        leaveWorkspace,
        refreshWorkspace: fetchMemberships,
        newWorkspacesCount,
        markAllSeen,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}

export function useIsDono() {
  const { role } = useWorkspace()
  return role === 'dono'
}

export function useIsGestor() {
  const { role } = useWorkspace()
  return role === 'dono' || role === 'coordenador'
}
