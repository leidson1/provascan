'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/contexts/workspace-context'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, MoreVertical, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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

interface Disciplina {
  id: string
  nome: string
  ativo: boolean
  user_id: string
}

export default function DisciplinasPage() {
  const supabase = createClient()
  const { workspaceId, role } = useWorkspace()
  const isCorretor = role === 'corretor'
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingDisciplina, setEditingDisciplina] = useState<Disciplina | null>(null)
  const [deletingDisciplina, setDeletingDisciplina] = useState<Disciplina | null>(null)
  const [nome, setNome] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchDisciplinas = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('disciplinas')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('ativo', true)
        .order('nome')

      if (error) throw error
      setDisciplinas(data || [])
    } catch {
      toast.error('Erro ao carregar disciplinas.')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    fetchDisciplinas()
  }, [fetchDisciplinas])

  function openAddDialog() {
    setEditingDisciplina(null)
    setNome('')
    setDialogOpen(true)
  }

  function openEditDialog(disciplina: Disciplina) {
    setEditingDisciplina(disciplina)
    setNome(disciplina.nome)
    setDialogOpen(true)
  }

  function openDeleteDialog(disciplina: Disciplina) {
    setDeletingDisciplina(disciplina)
    setDeleteDialogOpen(true)
  }

  async function handleSave() {
    if (!nome.trim()) {
      toast.error('O nome da disciplina é obrigatório.')
      return
    }

    setSaving(true)
    try {
      if (editingDisciplina) {
        const { error } = await supabase
          .from('disciplinas')
          .update({ nome: nome.trim() })
          .eq('id', editingDisciplina.id)

        if (error) throw error
        toast.success('Disciplina atualizada com sucesso.')
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Usuário não autenticado.')

        const { error } = await supabase
          .from('disciplinas')
          .insert({ nome: nome.trim(), user_id: user.id, workspace_id: workspaceId })

        if (error) throw error
        toast.success('Disciplina criada com sucesso.')
      }

      setDialogOpen(false)
      setNome('')
      setEditingDisciplina(null)
      fetchDisciplinas()
    } catch {
      toast.error('Erro ao salvar disciplina.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deletingDisciplina) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('disciplinas')
        .update({ ativo: false })
        .eq('id', deletingDisciplina.id)

      if (error) throw error
      toast.success('Disciplina excluída com sucesso.')
      setDeleteDialogOpen(false)
      setDeletingDisciplina(null)
      fetchDisciplinas()
    } catch {
      toast.error('Erro ao excluir disciplina.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Disciplinas</h1>
            {!loading && (
              <Badge variant="secondary">{disciplinas.length}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie as matérias disponíveis para suas provas
          </p>
        </div>
        {!isCorretor && (
          <Button onClick={openAddDialog}>
            <Plus className="size-4" data-icon="inline-start" />
            Nova Disciplina
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : disciplinas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
          <BookOpen className="size-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhuma disciplina cadastrada.
          </p>
          {!isCorretor && (
            <Button onClick={openAddDialog} variant="outline" className="mt-4">
              <Plus className="size-4" data-icon="inline-start" />
              Adicionar disciplina
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                {!isCorretor && <TableHead className="w-[70px]">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {disciplinas.map((disciplina) => (
                <TableRow key={disciplina.id}>
                  <TableCell className="font-medium">{disciplina.nome}</TableCell>
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
                          <DropdownMenuItem onClick={() => openEditDialog(disciplina)}>
                            <Pencil className="size-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => openDeleteDialog(disciplina)}
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
              {editingDisciplina ? 'Editar Disciplina' : 'Nova Disciplina'}
            </DialogTitle>
            <DialogDescription>
              {editingDisciplina
                ? 'Altere o nome da disciplina.'
                : 'Preencha o nome da nova disciplina.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Matemática"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
              }}
            />
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir a disciplina{' '}
              <strong>{deletingDisciplina?.nome}</strong>? Esta ação pode ser desfeita.
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
