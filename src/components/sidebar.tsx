'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
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
  ChevronDown,
  Check,
  LogOut as LeaveIcon,
  Crown,
  UserCheck,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace, useIsDono } from '@/contexts/workspace-context'
import { toast } from 'sonner'

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
  const { workspace, memberships, switchWorkspace, leaveWorkspace, workspaceId, role, newWorkspacesCount, markAllSeen } = useWorkspace()
  const isDono = useIsDono()
  const [wsMenuOpen, setWsMenuOpen] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Fechar menu ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setWsMenuOpen(false)
        setConfirmLeave(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleLeave = async (wsId: number) => {
    const ok = await leaveWorkspace(wsId)
    if (ok) {
      toast.success('Você saiu do workspace')
      setConfirmLeave(null)
      setWsMenuOpen(false)
    } else {
      toast.error('Erro ao sair do workspace')
    }
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

  const currentWsName = workspace.nome_instituicao || workspace.nome || 'Workspace'

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-indigo-950 via-indigo-900 to-indigo-800">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
          <ScanLine className="h-5 w-5 text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight text-white truncate">
          ProvaScan
        </span>
      </div>

      {/* Workspace switcher */}
      <div className="px-3 pb-3 relative" ref={menuRef}>
        <button
          onClick={() => { setWsMenuOpen(!wsMenuOpen); setConfirmLeave(null); if (!wsMenuOpen) markAllSeen() }}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 transition-colors relative"
        >
          {newWorkspacesCount > 0 && !wsMenuOpen && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {newWorkspacesCount}
            </span>
          )}
          <div className="flex items-center gap-2 min-w-0">
            {role === 'dono' ? (
              <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            ) : (
              <UserCheck className="h-3.5 w-3.5 text-indigo-300 shrink-0" />
            )}
            <span className="truncate">{currentWsName}</span>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-indigo-300 transition-transform ${wsMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {wsMenuOpen && (
          <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-lg border border-white/20 bg-indigo-950 shadow-xl overflow-hidden">
            {memberships.map((m) => {
              const wsName = m.workspace?.nome_instituicao || m.workspace?.nome || `Workspace ${m.workspace_id}`
              const isActive = m.workspace_id === workspaceId
              const isOwner = m.role === 'dono'
              const isConfirming = confirmLeave === m.workspace_id

              return (
                <div key={m.workspace_id} className={`${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                  {isConfirming ? (
                    <div className="px-3 py-2.5">
                      <p className="text-xs text-amber-300 mb-2">Sair de &quot;{wsName}&quot;?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleLeave(m.workspace_id)}
                          className="flex-1 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setConfirmLeave(null)}
                          className="flex-1 rounded bg-white/10 px-2 py-1 text-xs font-medium text-indigo-200 hover:bg-white/15"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <button
                        onClick={() => { switchWorkspace(m.workspace_id); setWsMenuOpen(false) }}
                        className="flex flex-1 items-center gap-2 px-3 py-2.5 text-sm text-left min-w-0"
                      >
                        {isActive ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <span className="w-3.5 shrink-0" />
                        )}
                        <span className={`truncate ${isActive ? 'text-white font-medium' : 'text-indigo-200'}`}>
                          {wsName}
                        </span>
                        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                          isOwner
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-indigo-500/20 text-indigo-300'
                        }`}>
                          {isOwner ? 'dono' : 'corretor'}
                        </span>
                      </button>
                      {!isOwner && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmLeave(m.workspace_id) }}
                          className="px-2.5 py-2.5 text-indigo-400 hover:text-red-400 transition-colors"
                          title="Sair deste workspace"
                        >
                          <LeaveIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

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
          Sair da Conta
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
