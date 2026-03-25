'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/contexts/workspace-context'
import { toast } from 'sonner'
import { UserPlus, Trash2, Users, Copy, Loader2, RefreshCw } from 'lucide-react'
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
  role: 'dono' | 'corretor'
  created_at: string
  profile: { nome: string; email: string }
}

export default function EquipePage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const { workspaceId, role } = useWorkspace()

  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [formNome, setFormNome] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formToken, setFormToken] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdUser, setCreatedUser] = useState<{ nome: string; email: string; token: string } | null>(null)

  function gerarToken() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let token = ''
    for (let i = 0; i < 8; i++) token += chars[Math.floor(Math.random() * chars.length)]
    return token
  }

  // Remove dialog
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removingMember, setRemovingMember] = useState<Member | null>(null)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    if (role === 'corretor') router.replace('/dashboard')
  }, [role, router])

  const fetchMembers = useCallback(async () => {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('*, profile:profiles(nome, email)')
      .eq('workspace_id', workspaceId)

    if (error) { toast.error('Erro ao carregar equipe'); return }
    setMembers((data as unknown as Member[]) || [])
    setLoading(false)
  }, [supabase, workspaceId])

  useEffect(() => {
    if (role === 'dono') fetchMembers()
  }, [fetchMembers, role])

  function openCreateDialog() {
    setFormNome('')
    setFormEmail('')
    setFormToken(gerarToken())
    setCreatedUser(null)
    setCreateOpen(true)
  }

  async function handleCreate() {
    if (!formNome.trim() || !formEmail.trim()) {
      toast.error('Preencha nome e email')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/criar-corretor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: formNome.trim(),
          email: formEmail.trim().toLowerCase(),
          senha: formToken,
          workspaceId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Erro ao criar corretor')
        return
      }

      // Show success with credentials
      setCreatedUser({
        nome: formNome.trim(),
        email: formEmail.trim().toLowerCase(),
        token: formToken,
      })
      toast.success('Corretor criado com sucesso!')
      fetchMembers()
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setCreating(false)
    }
  }

  function copyCredentials() {
    if (!createdUser) return
    const text = `ProvaScan - Dados de Acesso\nNome: ${createdUser.nome}\nEmail: ${createdUser.email}\nSenha: ${createdUser.token}\nAcesse: ${window.location.origin}/login`
    navigator.clipboard.writeText(text)
    toast.success('Dados copiados! Cole no WhatsApp ou onde preferir.')
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
          <p className="mt-1 text-sm text-gray-500">Crie logins para os professores corretores</p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Novo Corretor
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
          <p className="mt-1 text-sm text-gray-500">Crie um login para o primeiro corretor</p>
          <Button onClick={openCreateDialog} variant="outline" className="mt-4 gap-2">
            <UserPlus className="h-4 w-4" /> Novo Corretor
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
                  <TableHead className="w-24">Ações</TableHead>
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
                      ) : (
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Corretor</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {m.role === 'dono' ? (
                        <span className="text-xs text-gray-400">(Você)</span>
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

      {/* ── Create Corretor Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{createdUser ? 'Corretor Criado!' : 'Novo Corretor'}</DialogTitle>
            <DialogDescription>
              {createdUser
                ? 'Passe os dados abaixo para o professor.'
                : 'Crie um login e senha para o corretor. Ele usará esses dados para entrar.'}
            </DialogDescription>
          </DialogHeader>

          {createdUser ? (
            /* ── Success: show credentials ── */
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-3">
                <div>
                  <span className="text-xs font-medium text-emerald-600">Nome</span>
                  <p className="text-sm font-semibold text-gray-900">{createdUser.nome}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-emerald-600">Email</span>
                  <p className="text-sm font-semibold text-gray-900">{createdUser.email}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-emerald-600">Senha (token)</span>
                  <p className="text-sm font-semibold text-gray-900 font-mono">{createdUser.token}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-emerald-600">Link de acesso</span>
                  <p className="text-sm text-gray-700">{typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login'}</p>
                </div>
              </div>
              <Button onClick={copyCredentials} variant="outline" className="w-full gap-2">
                <Copy className="h-4 w-4" />
                Copiar dados para enviar
              </Button>
              <DialogFooter>
                <Button onClick={() => setCreateOpen(false)} className="w-full">Fechar</Button>
              </DialogFooter>
            </div>
          ) : (
            /* ── Form: create corretor ── */
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome completo</Label>
                <Input value={formNome} onChange={e => setFormNome(e.target.value)} placeholder="Maria da Silva" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="maria@email.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Senha (token gerado)</Label>
                <div className="flex gap-2">
                  <Input value={formToken} readOnly className="font-mono bg-gray-50" />
                  <Button type="button" variant="outline" size="sm" onClick={() => setFormToken(gerarToken())}
                    className="shrink-0 gap-1.5 h-9 px-3" title="Gerar novo token">
                    <RefreshCw className="h-3.5 w-3.5" /> Novo
                  </Button>
                </div>
                <p className="text-[10px] text-gray-400">Token gerado automaticamente. Clique em &quot;Novo&quot; para gerar outro.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={creating} className="gap-2">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  {creating ? 'Criando...' : 'Criar Corretor'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Remove Dialog ── */}
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
