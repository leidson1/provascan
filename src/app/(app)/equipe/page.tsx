'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/contexts/workspace-context'
import { toast } from 'sonner'
import { UserPlus, Trash2, Users, Copy, Loader2, Mail, Clock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

interface Member {
  id: number
  workspace_id: number
  user_id: string
  role: 'dono' | 'coordenador' | 'corretor'
  created_at: string
  profile: { nome: string; email: string }
}

interface Convite {
  id: number
  email: string
  token: string
  usado: boolean
  created_at: string
}

export default function EquipePage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const { workspaceId, role, workspace } = useWorkspace()

  const [members, setMembers] = useState<Member[]>([])
  const [convites, setConvites] = useState<Convite[]>([])
  const [loading, setLoading] = useState(true)

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false)
  const [formEmail, setFormEmail] = useState('')
  const [formRole, setFormRole] = useState<'coordenador' | 'corretor'>('corretor')
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{
    tipo: 'adicionado' | 'convite'
    nome?: string
    email?: string
    link?: string
  } | null>(null)

  // Remove dialog
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removingMember, setRemovingMember] = useState<Member | null>(null)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    if (role === 'corretor') router.replace('/dashboard')
  }, [role, router])

  const fetchMembers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('*, profile:profiles(nome, email)')
        .eq('workspace_id', workspaceId)

      if (!error && data) {
        setMembers((data as unknown as Member[]) || [])
      } else {
        // Fallback
        const { data: membersData } = await supabase
          .from('workspace_members')
          .select('*')
          .eq('workspace_id', workspaceId)

        if (membersData && membersData.length > 0) {
          const userIds = membersData.map((m: { user_id: string }) => m.user_id)
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, nome, email')
            .in('id', userIds)

          const profileMap = new Map((profiles || []).map((p: { id: string; nome: string; email: string }) => [p.id, p]))
          const merged = membersData.map((m: { user_id: string }) => ({
            ...m,
            profile: profileMap.get(m.user_id) || { nome: 'Sem nome', email: m.user_id },
          })) as unknown as Member[]
          setMembers(merged)
        } else {
          setMembers([])
        }
      }
    } catch {
      toast.error('Erro ao carregar equipe')
    }
  }, [supabase, workspaceId])

  const fetchConvites = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('convites')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('usado', false)
        .order('created_at', { ascending: false })

      setConvites((data as Convite[]) || [])
    } catch {
      // tabela pode nÃ£o existir ainda
      setConvites([])
    }
  }, [supabase, workspaceId])

  useEffect(() => {
    if (role === 'dono') {
      Promise.all([fetchMembers(), fetchConvites()]).finally(() => setLoading(false))
    }
  }, [fetchMembers, fetchConvites, role])

  function openInviteDialog() {
    setFormEmail('')
    setFormRole('corretor')
    setInviteResult(null)
    setInviteOpen(true)
  }

  async function handleInvite() {
    if (!formEmail.trim()) {
      toast.error('Preencha o email')
      return
    }

    setInviting(true)
    try {
      const res = await fetch('/api/convidar-corretor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formEmail.trim().toLowerCase(),
          workspaceId,
          role: formRole,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Erro ao convidar')
        return
      }

      setInviteResult({
        tipo: data.tipo,
        nome: data.user?.nome,
        email: data.user?.email || formEmail.trim().toLowerCase(),
        link: data.link,
      })

      if (data.tipo === 'adicionado') {
        toast.success('Professor adicionado com sucesso!', {
          description: 'Nenhum e-mail foi enviado. Se ele nao lembrar a senha, deve usar a recuperacao no login.',
        })
      } else {
        toast.success('Convite gerado!')
      }

      fetchMembers()
      fetchConvites()
    } catch {
      toast.error('Erro de conexÃ£o')
    } finally {
      setInviting(false)
    }
  }

  function copyInviteLink(link: string) {
    const nomeEscola = workspace.nome_instituicao || 'ProvaScan'
    const text = `Ola! Voce foi convidado(a) para a equipe *${nomeEscola}* no ProvaScan.\n\nClique no link abaixo para criar sua conta ou entrar na conta existente e entrar na equipe:\n${link}`
    navigator.clipboard.writeText(text)
    toast.success('Link copiado! Cole no WhatsApp.')
  }

  async function cancelConvite(id: number) {
    const { error } = await supabase
      .from('convites')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error('Erro ao cancelar convite')
      return
    }
    toast.success('Convite cancelado')
    fetchConvites()
  }

  async function handleRemove() {
    if (!removingMember) return
    setRemoving(true)
    const { error } = await supabase
      .from('workspace_members')
      .delete()
      .eq('id', removingMember.id)

    if (error) { toast.error('Erro ao remover'); setRemoving(false); return }
    toast.success('Membro removido')
    setRemoveOpen(false)
    setRemovingMember(null)
    setRemoving(false)
    fetchMembers()
  }

  if (role === 'corretor') return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-gray-400" />
            <h1 className="text-2xl font-bold text-gray-900">Equipe</h1>
            {!loading && <Badge variant="secondary">{members.length}</Badge>}
          </div>
          <p className="mt-1 text-sm text-gray-500">Convide professores para corrigir provas</p>
        </div>
        <Button onClick={openInviteDialog} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Convidar
        </Button>
      </div>

      {/* Members list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16">
          <Users className="h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm font-medium text-gray-900">Nenhum membro na equipe</p>
          <p className="mt-1 text-sm text-gray-500">Convide o primeiro professor corretor</p>
          <Button onClick={openInviteDialog} variant="outline" className="mt-4 gap-2">
            <UserPlus className="h-4 w-4" /> Convidar
          </Button>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Membros</CardTitle>
            <CardDescription>{members.length} membro(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead className="w-24">AÃ§Ãµes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.profile.nome}</TableCell>
                    <TableCell className="text-gray-500">{m.profile.email}</TableCell>
                    <TableCell>
                      {m.role === 'dono' ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Dono</Badge>
                      ) : m.role === 'coordenador' ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Coordenador</Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Corretor</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {m.role === 'dono' ? (
                        <span className="text-xs text-gray-400">(VocÃª)</span>
                      ) : (
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700"
                          onClick={() => { setRemovingMember(m); setRemoveOpen(true) }}>
                          <Trash2 className="h-4 w-4" />
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

      {/* Convites pendentes */}
      {convites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Convites Pendentes
            </CardTitle>
            <CardDescription>Aguardando cadastro</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {convites.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{c.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => copyInviteLink(`${window.location.origin}/signup?convite=${c.token}`)}
                    >
                      <Copy className="h-3 w-3" /> Copiar Link
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => cancelConvite(c.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* â”€â”€ Invite Dialog â”€â”€ */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{inviteResult ? (inviteResult.tipo === 'adicionado' ? 'Professor Adicionado!' : 'Convite Gerado!') : 'Convidar Professor'}</DialogTitle>
            <DialogDescription>
              {inviteResult
                ? (inviteResult.tipo === 'adicionado'
                  ? 'Este e-mail ja tinha conta. O acesso ao workspace foi liberado sem envio de convite por e-mail.'
                  : 'Envie o link abaixo por WhatsApp para o professor.')
                : 'Digite o email do professor que deseja convidar.'}
            </DialogDescription>
          </DialogHeader>

          {inviteResult ? (
            inviteResult.tipo === 'adicionado' ? (
              /* â”€â”€ Adicionado direto â”€â”€ */
              <div className="space-y-4">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
                  <p className="text-sm text-emerald-700">
                    <strong>{inviteResult.nome || inviteResult.email}</strong> foi adicionado(a) como corretor(a).
                    Ao entrar no ProvaScan, este workspace ficara disponivel no seletor. Se nao lembrar a senha, use &quot;Esqueci minha senha&quot;.
                  </p>
                </div>
                <DialogFooter>
                  <Button onClick={() => setInviteOpen(false)} className="w-full">Fechar</Button>
                </DialogFooter>
              </div>
            ) : (
              /* â”€â”€ Link de convite â”€â”€ */
              <div className="space-y-4">
                <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-4 space-y-3">
                  <div>
                    <span className="text-[11px] font-medium text-indigo-500 uppercase tracking-wide">Email convidado</span>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{inviteResult.email}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-indigo-500 uppercase tracking-wide">Link de cadastro</span>
                    <p className="mt-1 rounded-lg bg-white border border-indigo-100 px-3 py-2.5 text-xs text-gray-600 font-mono break-all select-all">
                      {inviteResult.link}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => copyInviteLink(inviteResult.link!)}
                  className="w-full gap-2"
                >
                  <Copy className="h-4 w-4" />
                  Copiar convite para WhatsApp
                </Button>
                <Button variant="outline" onClick={() => setInviteOpen(false)} className="w-full">
                  Fechar
                </Button>
              </div>
            )
          ) : (
            /* â”€â”€ FormulÃ¡rio â”€â”€ */
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Email do professor</Label>
                <Input
                  type="email"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  placeholder="professor@email.com"
                  onKeyDown={e => e.key === 'Enter' && handleInvite()}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Papel</Label>
                <select
                  value={formRole}
                  onChange={e => setFormRole(e.target.value as 'coordenador' | 'corretor')}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="corretor">Corretor â€” Corrige provas e vÃª estatÃ­sticas</option>
                  <option value="coordenador">Coordenador â€” Cria e edita provas, turmas e disciplinas</option>
                </select>
              </div>
              <div>
                <p className="text-[11px] text-gray-400">
                  Se o professor ja tiver conta, ele sera adicionado direto e nao recebera e-mail automatico. Se nao tiver, um link de convite sera gerado.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
                <Button onClick={handleInvite} disabled={inviting} className="gap-2">
                  {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {inviting ? 'Processando...' : 'Convidar'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* â”€â”€ Remove Dialog â”€â”€ */}
      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover membro</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover <strong>{removingMember?.profile.nome}</strong> da equipe?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removing}>
              {removing ? 'Removendo...' : 'Remover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
