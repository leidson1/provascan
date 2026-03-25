'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/contexts/workspace-context'
import { toast } from 'sonner'
import { UserPlus, Trash2, Users, Copy, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Member {
  id: number
  workspace_id: number
  user_id: string
  role: 'dono' | 'corretor'
  created_at: string
  profile: {
    nome: string
    email: string
  }
}

export default function EquipePage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const { workspaceId, role } = useWorkspace()

  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [removingMember, setRemovingMember] = useState<Member | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [notFoundEmail, setNotFoundEmail] = useState<string | null>(null)

  useEffect(() => {
    if (role === 'corretor') {
      router.replace('/dashboard')
    }
  }, [role, router])

  const fetchMembers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('*, profile:profiles(nome, email)')
        .eq('workspace_id', workspaceId)

      if (error) throw error
      setMembers((data as unknown as Member[]) || [])
    } catch {
      toast.error('Erro ao carregar membros.')
    } finally {
      setLoading(false)
    }
  }, [supabase, workspaceId])

  useEffect(() => {
    if (role === 'dono') {
      fetchMembers()
    }
  }, [fetchMembers, role])

  function openInviteDialog() {
    setInviteEmail('')
    setNotFoundEmail(null)
    setInviteDialogOpen(true)
  }

  function openRemoveDialog(member: Member) {
    setRemovingMember(member)
    setRemoveDialogOpen(true)
  }

  async function handleInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email) {
      toast.error('Informe o e-mail do corretor.')
      return
    }

    setInviting(true)
    setNotFoundEmail(null)
    try {
      // Check if already a member
      const existingMember = members.find(
        (m) => m.profile.email.toLowerCase() === email
      )
      if (existingMember) {
        toast.error('Esse usuário já faz parte da equipe.')
        setInviting(false)
        return
      }

      // Search for profile by email
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single()

      if (profileError || !profile) {
        setNotFoundEmail(email)
        setInviting(false)
        return
      }

      // Insert workspace member
      const { error: insertError } = await supabase
        .from('workspace_members')
        .insert({
          workspace_id: workspaceId,
          user_id: profile.id,
          role: 'corretor',
        })

      if (insertError) throw insertError

      toast.success('Corretor adicionado com sucesso.')
      setInviteDialogOpen(false)
      setInviteEmail('')
      setNotFoundEmail(null)
      fetchMembers()
    } catch {
      toast.error('Erro ao convidar corretor.')
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove() {
    if (!removingMember) return

    setRemoving(true)
    try {
      const { error } = await supabase
        .from('workspace_members')
        .delete()
        .eq('id', removingMember.id)

      if (error) throw error

      toast.success('Membro removido com sucesso.')
      setRemoveDialogOpen(false)
      setRemovingMember(null)
      fetchMembers()
    } catch {
      toast.error('Erro ao remover membro.')
    } finally {
      setRemoving(false)
    }
  }

  function copySignupLink() {
    const url = `${window.location.origin}/signup`
    navigator.clipboard.writeText(url)
    toast.success('Link copiado para a área de transferência.')
  }

  if (role === 'corretor') return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Users className="size-6 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">Equipe</h1>
            {!loading && (
              <Badge variant="secondary">{members.length}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie os membros do seu workspace
          </p>
        </div>
        <Button onClick={openInviteDialog}>
          <UserPlus className="size-4" data-icon="inline-start" />
          Convidar Corretor
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
          <Users className="size-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhum membro na equipe.
          </p>
          <Button onClick={openInviteDialog} variant="outline" className="mt-4">
            <UserPlus className="size-4" data-icon="inline-start" />
            Convidar corretor
          </Button>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Membros</CardTitle>
            <CardDescription>
              {members.length} {members.length === 1 ? 'membro' : 'membros'} no workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      {member.profile.nome}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.profile.email}
                    </TableCell>
                    <TableCell>
                      {member.role === 'dono' ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
                          Dono
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400">
                          Corretor
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {member.role === 'dono' ? (
                        <span className="text-xs text-muted-foreground">(Você)</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => openRemoveDialog(member)}
                        >
                          <Trash2 className="size-4" />
                          Remover
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar Corretor</DialogTitle>
            <DialogDescription>
              Adicione um corretor ao seu workspace usando o e-mail cadastrado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">E-mail do corretor</Label>
              <div className="flex gap-2">
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value)
                    setNotFoundEmail(null)
                  }}
                  placeholder="corretor@exemplo.com"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleInvite()
                  }}
                />
              </div>
            </div>

            {notFoundEmail && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 size-5 text-amber-600 dark:text-amber-400" />
                  <div className="space-y-2">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Esse e-mail ainda não tem conta no ProvaScan.
                      Compartilhe o link de cadastro:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate rounded bg-amber-100 px-2 py-1 text-xs dark:bg-amber-900/50">
                        {typeof window !== 'undefined'
                          ? `${window.location.origin}/signup`
                          : '/signup'}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={copySignupLink}
                      >
                        <Copy className="size-3" />
                        Copiar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleInvite} disabled={inviting}>
              {inviting ? 'Convidando...' : 'Convidar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover membro</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover{' '}
              <strong>{removingMember?.profile.nome}</strong> da equipe?
              Essa pessoa perderá acesso ao workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={removing}
            >
              {removing ? 'Removendo...' : 'Remover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
