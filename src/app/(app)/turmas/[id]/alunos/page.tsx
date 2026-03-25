'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/contexts/workspace-context'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  Trash2,
  MoreVertical,
  ArrowLeft,
  Upload,
  UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Aluno {
  id: string
  nome: string
  numero: number
  turma_id: string
  ativo: boolean
  user_id: string
}

interface Turma {
  id: string
  serie: string
  turma: string
}

export default function AlunosPage() {
  const params = useParams()
  const turmaId = params.id as string
  const supabase = createClient()
  const { workspaceId, role } = useWorkspace()
  const isCorretor = role === 'corretor'

  const [turma, setTurma] = useState<Turma | null>(null)
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingAluno, setEditingAluno] = useState<Aluno | null>(null)
  const [deletingAluno, setDeletingAluno] = useState<Aluno | null>(null)
  const [nome, setNome] = useState('')
  const [numero, setNumero] = useState('')
  const [importText, setImportText] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchTurma = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('turmas')
        .select('id, serie, turma')
        .eq('id', turmaId)
        .single()

      if (error) throw error
      setTurma(data)
    } catch {
      toast.error('Erro ao carregar dados da turma.')
    }
  }, [turmaId])

  const fetchAlunos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('alunos')
        .select('*')
        .eq('turma_id', turmaId)
        .eq('ativo', true)
        .order('numero')

      if (error) throw error
      setAlunos(data || [])
    } catch {
      toast.error('Erro ao carregar alunos.')
    } finally {
      setLoading(false)
    }
  }, [turmaId])

  useEffect(() => {
    fetchTurma()
    fetchAlunos()
  }, [fetchTurma, fetchAlunos])

  function getNextNumero(): number {
    if (alunos.length === 0) return 1
    return Math.max(...alunos.map((a) => a.numero)) + 1
  }

  function openAddDialog() {
    setEditingAluno(null)
    setNome('')
    setNumero(String(getNextNumero()))
    setDialogOpen(true)
  }

  function openEditDialog(aluno: Aluno) {
    setEditingAluno(aluno)
    setNome(aluno.nome)
    setNumero(String(aluno.numero))
    setDialogOpen(true)
  }

  function openDeleteDialog(aluno: Aluno) {
    setDeletingAluno(aluno)
    setDeleteDialogOpen(true)
  }

  function openImportDialog() {
    setImportText('')
    setImportDialogOpen(true)
  }

  async function handleSave() {
    if (!nome.trim()) {
      toast.error('O nome do aluno é obrigatório.')
      return
    }
    if (!numero || isNaN(Number(numero)) || Number(numero) < 1) {
      toast.error('Informe um número válido.')
      return
    }

    setSaving(true)
    try {
      if (editingAluno) {
        const { error } = await supabase
          .from('alunos')
          .update({ nome: nome.trim(), numero: Number(numero) })
          .eq('id', editingAluno.id)

        if (error) throw error
        toast.success('Aluno atualizado com sucesso.')
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Usuário não autenticado.')

        const { error } = await supabase.from('alunos').insert({
          nome: nome.trim(),
          numero: Number(numero),
          turma_id: turmaId,
          user_id: user.id,
          workspace_id: workspaceId,
        })

        if (error) throw error
        toast.success('Aluno adicionado com sucesso.')
      }

      setDialogOpen(false)
      setNome('')
      setNumero('')
      setEditingAluno(null)
      fetchAlunos()
    } catch {
      toast.error('Erro ao salvar aluno.')
    } finally {
      setSaving(false)
    }
  }

  async function handleImport() {
    const names = importText
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n.length > 0)

    if (names.length === 0) {
      toast.error('Cole pelo menos um nome de aluno.')
      return
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado.')

      const startNum = getNextNumero()
      const rows = names.map((name, i) => ({
        nome: name,
        numero: startNum + i,
        turma_id: turmaId,
        user_id: user.id,
        workspace_id: workspaceId,
      }))

      const { error } = await supabase.from('alunos').insert(rows)
      if (error) throw error

      toast.success(`${names.length} aluno(s) importado(s) com sucesso.`)
      setImportDialogOpen(false)
      setImportText('')
      fetchAlunos()
    } catch {
      toast.error('Erro ao importar alunos.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deletingAluno) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('alunos')
        .update({ ativo: false })
        .eq('id', deletingAluno.id)

      if (error) throw error
      toast.success('Aluno excluído com sucesso.')
      setDeleteDialogOpen(false)
      setDeletingAluno(null)
      fetchAlunos()
    } catch {
      toast.error('Erro ao excluir aluno.')
    } finally {
      setSaving(false)
    }
  }

  const turmaLabel = turma ? `${turma.serie} ${turma.turma}` : '...'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/turmas" />}>
          <ArrowLeft className="size-4" />
          <span className="sr-only">Voltar</span>
        </Button>
        <div className="flex flex-1 items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Alunos - {turmaLabel}
            </h1>
            {!loading && (
              <Badge variant="secondary">{alunos.length}</Badge>
            )}
          </div>
          {!isCorretor && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={openImportDialog}>
                <Upload className="size-4" data-icon="inline-start" />
                Importar em Lote
              </Button>
              <Button onClick={openAddDialog}>
                <Plus className="size-4" data-icon="inline-start" />
                Novo Aluno
              </Button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : alunos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
          <UserRound className="size-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhum aluno cadastrado nesta turma.
          </p>
          {!isCorretor && (
            <div className="mt-4 flex items-center gap-2">
              <Button onClick={openImportDialog} variant="outline">
                <Upload className="size-4" data-icon="inline-start" />
                Importar em Lote
              </Button>
              <Button onClick={openAddDialog}>
                <Plus className="size-4" data-icon="inline-start" />
                Adicionar aluno
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[70px]">N.º</TableHead>
                <TableHead>Nome</TableHead>
                {!isCorretor && <TableHead className="w-[70px]">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {alunos.map((aluno) => (
                <TableRow key={aluno.id}>
                  <TableCell>
                    <Badge variant="outline">{aluno.numero}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{aluno.nome}</TableCell>
                  {!isCorretor && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" />}
                        >
                          <MoreVertical className="size-4" />
                          <span className="sr-only">Ações</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(aluno)}>
                            <Pencil className="size-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => openDeleteDialog(aluno)}
                          >
                            <Trash2 className="size-4" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAluno ? 'Editar Aluno' : 'Novo Aluno'}
            </DialogTitle>
            <DialogDescription>
              {editingAluno
                ? 'Altere os dados do aluno.'
                : 'Preencha os dados do novo aluno.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="aluno-nome">Nome</Label>
              <Input
                id="aluno-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome completo do aluno"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aluno-numero">Número</Label>
              <Input
                id="aluno-numero"
                type="number"
                min={1}
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="Nº na chamada"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar Alunos em Lote</DialogTitle>
            <DialogDescription>
              Cole os nomes dos alunos, um por linha. Os números serão atribuídos
              automaticamente a partir de {getNextNumero()}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground rounded-md bg-muted px-3 py-2">
              Os números serão atribuídos automaticamente na ordem da lista.
            </p>
            <Label htmlFor="import-text">Nomes dos alunos</Label>
            <Textarea
              id="import-text"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={
                'João da Silva\nMaria Oliveira\nPedro Santos'
              }
              rows={8}
            />
            {importText.trim() && (
              <p className="text-xs text-muted-foreground">
                {importText.split('\n').filter((n) => n.trim()).length} aluno(s)
                detectado(s)
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={saving}>
              <Upload className="size-4" data-icon="inline-start" />
              {saving ? 'Importando...' : 'Importar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o aluno{' '}
              <strong>{deletingAluno?.nome}</strong>? Esta ação pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
