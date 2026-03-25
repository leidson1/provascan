'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Workspace, WorkspaceMember } from '@/types/database'

interface WorkspaceContextType {
  workspaceId: number
  role: 'dono' | 'corretor'
  workspace: Workspace
  memberships: WorkspaceMember[]
  switchWorkspace: (id: number) => void
  refreshWorkspace: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null)

const STORAGE_KEY = 'provascan_workspace_id'

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
        refreshWorkspace: fetchMemberships,
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
