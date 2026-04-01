'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { TutorialModal } from '@/components/tutorial-modal'
import { WorkspaceProvider } from '@/contexts/workspace-context'
import type { Profile } from '@/types/database'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const [user, setUser] = useState<Pick<Profile, 'nome' | 'email'> | null>(null)
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      if (!authUser) {
        router.push('/login')
        return
      }

      setAuthUserId(authUser.id)

      const { data: profile } = await supabase
        .from('profiles')
        .select('nome, email')
        .eq('id', authUser.id)
        .single()

      if (profile) {
        setUser({ nome: profile.nome, email: profile.email })
      } else {
        setUser({ nome: '', email: authUser.email ?? '' })
      }

      setLoading(false)
    }

    loadUser()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        {/* Skeleton sidebar */}
        <div className="hidden w-64 flex-col border-r bg-white p-4 lg:flex">
          <div className="mb-8 h-8 w-32 animate-pulse rounded-md bg-muted" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
          <div className="mt-auto h-10 animate-pulse rounded-md bg-muted" />
        </div>

        {/* Skeleton content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Skeleton header */}
          <div className="flex h-14 items-center justify-between border-b bg-white px-4 sm:px-6">
            <div className="h-6 w-40 animate-pulse rounded bg-muted" />
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          </div>

          {/* Skeleton main */}
          <div className="flex-1 p-4 sm:p-6 lg:p-8">
            <div className="space-y-4">
              <div className="h-8 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-72 animate-pulse rounded bg-muted" />
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!user || !authUserId) return null

  return (
    <WorkspaceProvider userId={authUserId}>
      <TutorialModal />
      <div className="flex h-screen bg-gray-50">
        <Sidebar user={user} currentPath={pathname} />

        <div className="flex flex-1 flex-col overflow-hidden lg:pl-0">
          <Header user={user} currentPath={pathname} />

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </WorkspaceProvider>
  )
}
