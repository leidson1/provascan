'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  Users,
  Camera,
  LogOut,
  ScanLine,
  Settings,
  UserPlus,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace, useIsDono } from '@/contexts/workspace-context'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SidebarProps {
  user: {
    nome: string
    email: string
  }
  currentPath: string
}

export function SidebarContent({ user, currentPath }: SidebarProps) {
  const router = useRouter()
  const supabase = createClient()
  const { workspace, memberships, switchWorkspace, workspaceId } = useWorkspace()
  const isDono = useIsDono()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string) => {
    if (href === '/dashboard') return currentPath === '/dashboard'
    return currentPath.startsWith(href)
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true },
    { href: '/provas', label: 'Provas', icon: FileText, visible: true },
    { href: '/disciplinas', label: 'Disciplinas', icon: BookOpen, visible: isDono },
    { href: '/turmas', label: 'Turmas', icon: Users, visible: isDono },
    { href: '/equipe', label: 'Equipe', icon: UserPlus, visible: isDono },
    { href: '/configuracoes', label: 'Configurações', icon: Settings, visible: isDono },
  ]

  const brandName = workspace.nome_instituicao || 'ProvaScan'

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-indigo-950 via-indigo-900 to-indigo-800">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
          <ScanLine className="h-5 w-5 text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight text-white truncate">
          {brandName}
        </span>
      </div>

      {/* Workspace switcher */}
      {memberships.length > 1 && (
        <div className="px-3 pb-3">
          <Select
            value={String(workspaceId)}
            onValueChange={(val) => switchWorkspace(Number(val))}
          >
            <SelectTrigger className="h-8 border-white/20 bg-white/10 text-sm text-white hover:bg-white/15 focus:ring-white/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {memberships.map((m) => (
                <SelectItem key={m.workspace_id} value={String(m.workspace_id)}>
                  {m.workspace?.nome_instituicao || m.workspace?.nome || `Workspace ${m.workspace_id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3">
        {navItems
          .filter((item) => item.visible)
          .map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? 'bg-white/10 font-semibold text-white'
                    : 'text-indigo-200 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            )
          })}

        <Separator className="!my-3 bg-white/10" />

        <a
          href="/camera"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-indigo-200 transition-colors hover:bg-white/5 hover:text-white"
        >
          <Camera className="h-5 w-5 shrink-0" />
          Câmera
        </a>
      </nav>

      {/* User info + Logout */}
      <div className="border-t border-white/10 p-4">
        <div className="mb-3">
          <p className="truncate text-sm font-medium text-white">
            {user.nome}
          </p>
          <p className="truncate text-xs text-indigo-300">{user.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-indigo-200 transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </div>
  )
}

export function Sidebar({ user, currentPath }: SidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 lg:block">
      <div className="fixed inset-y-0 left-0 z-30 w-64">
        <SidebarContent user={user} currentPath={currentPath} />
      </div>
    </aside>
  )
}
