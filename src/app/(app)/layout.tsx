'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import type { Profile } from '@/types/database'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const [user, setUser] = useState<Pick<Profile, 'nome' | 'email'> | null>(null)
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
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} currentPath={pathname} />

      <div className="flex flex-1 flex-col overflow-hidden lg:pl-0">
        <Header user={user} currentPath={pathname} />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
