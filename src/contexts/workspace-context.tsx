'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Workspace, WorkspaceMember } from '@/types/database'

interface WorkspaceContextType {
  workspaceId: number
  role: 'dono' | 'coordenador' | 'corretor'
  workspace: Workspace
  memberships: (WorkspaceMember & { workspace: Workspace })[]
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

export function WorkspaceProvider({ userId, children }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [memberships, setMemberships] = useState<(WorkspaceMember & { workspace: Workspace })[]>([])
  const [currentWsId, setCurrentWsId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMemberships = useCallback(async () => {
    const { data } = await supabase
      .from('workspace_members')
      .select('*, workspace:workspaces(*)')
      .eq('user_id', userId)

    if (data && data.length > 0) {
      const typed = data as unknown as (WorkspaceMember & { workspace: Workspace })[]
      setMemberships(typed)

      // Restore from localStorage or default to first owned workspace
      const stored = localStorage.getItem(STORAGE_KEY)
      const storedId = stored ? Number(stored) : null
      const valid = typed.find(m => m.workspace_id === storedId)

      if (valid) {
        setCurrentWsId(valid.workspace_id)
      } else {
        const owned = typed.find(m => m.role === 'dono')
        const first = owned || typed[0]
        setCurrentWsId(first.workspace_id)
        localStorage.setItem(STORAGE_KEY, String(first.workspace_id))
      }
    }
    setLoading(false)
  }, [supabase, userId])

  useEffect(() => {
    fetchMemberships()
  }, [fetchMemberships])

  const switchWorkspace = useCallback((id: number) => {
    setCurrentWsId(id)
    localStorage.setItem(STORAGE_KEY, String(id))
  }, [])

  const leaveWorkspace = useCallback(async (wsId: number): Promise<boolean> => {
    // Não pode sair de workspace onde é dono
    const membership = memberships.find(m => m.workspace_id === wsId)
    if (!membership || membership.role === 'dono') return false

    const { error } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', wsId)
      .eq('user_id', userId)

    if (error) return false

    // Se era o workspace ativo, trocar para o workspace próprio (dono)
    if (currentWsId === wsId) {
      const owned = memberships.find(m => m.workspace_id !== wsId && m.role === 'dono')
      const fallback = owned || memberships.find(m => m.workspace_id !== wsId)
      if (fallback) {
        setCurrentWsId(fallback.workspace_id)
        localStorage.setItem(STORAGE_KEY, String(fallback.workspace_id))
      }
    }

    await fetchMemberships()
    return true
  }, [supabase, userId, memberships, currentWsId, fetchMemberships])

  // Contagem de workspaces novos (não vistos)
  const newWorkspacesCount = useMemo(() => {
    if (typeof window === 'undefined') return 0
    try {
      const seen: number[] = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')
      return memberships.filter(m => !seen.includes(m.workspace_id)).length
    } catch {
      return 0
    }
  }, [memberships])

  const markAllSeen = useCallback(() => {
    const ids = memberships.map(m => m.workspace_id)
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids))
  }, [memberships])

  if (loading || !currentWsId) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    )
  }

  const currentMembership = memberships.find(m => m.workspace_id === currentWsId)!
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

/** Dono ou Coordenador — pode criar, editar, corrigir (quase tudo) */
export function useIsGestor() {
  const { role } = useWorkspace()
  return role === 'dono' || role === 'coordenador'
}
