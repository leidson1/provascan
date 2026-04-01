'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/contexts/workspace-context'
import { toast } from 'sonner'
import Link from 'next/link'
import { Plus, Pencil, Trash2, MoreVertical, Users, GraduationCap, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Turma {
  id: string
  serie: string
  turma: string
  turno: string
  ativo: boolean
  user_id: string
  alunos: { count: number }[]
}

const TURNOS = ['Manhã', 'Tarde', 'Integral', 'Noite'] as const

export default function TurmasPage() {
  const supabase = createClient()
  const { workspaceId, role } = useWorkspace()
  const isCorretor = role === 'corretor'
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingTurma, setEditingTurma] = useState<Turma | null>(null)
  const [deletingTurma, setDeletingTurma] = useState<Turma | null>(null)
  const [serie, setSerie] = useState('')
  const [turma, setTurma] = useState('')
  const [turno, setTurno] = useState<string>('Manhã')
  const [saving, setSaving] = useState(false)
  const [sortKey, setSortKey] = useState<'serie' | 'turma' | 'turno' | 'alunos'>('serie')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function SortIcon({ col }: { col: typeof sortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 text-gray-300" />
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
  }

  const fetchTurmas = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('turmas')
        .select('*, alunos(count)')
        .eq('workspace_id', workspaceId)
        .eq('ativo', true)
        .order('serie')
        .order('turma')

      if (error) throw error
      setTurmas((data as Turma[]) || [])
    } catch {
      toast.error('Erro ao carregar turmas.')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    fetchTurmas()
  }, [fetchTurmas])

  const sortedTurmas = useMemo(() => {
    const arr = [...turmas]
    arr.sort((a, b) => {
      let va: string | number, vb: string | number
      if (sortKey === 'alunos') {
        va = getAlunosCount(a)
        vb = getAlunosCount(b)
      } else {
        va = (a[sortKey] || '').toLowerCase()
        vb = (b[sortKey] || '').toLowerCase()
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [turmas, sortKey, sortDir])

  function getAlunosCount(t: Turma): number {
    return t.alunos?.[0]?.count ?? 0
  }

  function openAddDialog() {
    setEditingTurma(null)
    setSerie('')
    setTurma('')
    setTurno('Manhã')
    setDialogOpen(true)
  }

  function openEditDialog(t: Turma) {
    setEditingTurma(t)
    setSerie(t.serie)
    setTurma(t.turma)
    setTurno(t.turno)
    setDialogOpen(true)
  }

  function openDeleteDialog(t: Turma) {
    setDeletingTurma(t)
    setDeleteDialogOpen(true)
  }

  async function handleSave() {
    if (!serie.trim() || !turma.trim()) {
      toast.error('Série e turma são obrigatórios.')
      return
    }

    setSaving(true)
    try {
      if (editingTurma) {
        const { error } = await supabase
          .from('turmas')
          .update({ serie: serie.trim(), turma: turma.trim(), turno })
          .eq('id', editingTurma.id)

        if (error) throw error
        toast.success('Turma atualizada com sucesso.')
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Usuário não autenticado.')

        const { error } = await supabase
          .from('turmas')
          .insert({ serie: serie.trim(), turma: turma.trim(), turno, user_id: user.id, workspace_id: workspaceId })

        if (error) throw error
        toast.success('Turma criada com sucesso.')
      }

      setDialogOpen(false)
      setSerie('')
      setTurma('')
      setTurno('Manhã')
      setEditingTurma(null)
      fetchTurmas()
    } catch {
      toast.error('Erro ao salvar turma.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deletingTurma) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('turmas')
        .update({ ativo: false })
        .eq('id', deletingTurma.id)

      if (error) throw error
      toast.success('Turma excluída com sucesso.')
      setDeleteDialogOpen(false)
      setDeletingTurma(null)
      fetchTurmas()
    } catch {
      toast.error('Erro ao excluir turma.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Turmas</h1>
            {!loading && (
              <Badge variant="secondary">{turmas.length}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize suas turmas por série e turno
          </p>
        </div>
        {!isCorretor && (
          <Button onClick={openAddDialog}>
            <Plus className="size-4" data-icon="inline-start" />
            Nova Turma
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : turmas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
          <GraduationCap className="size-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhuma turma cadastrada.
          </p>
          {!isCorretor && (
            <Button onClick={openAddDialog} variant="outline" className="mt-4">
              <Plus className="size-4" data-icon="inline-start" />
              Adicionar turma
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('serie')}>
                  <span className="inline-flex items-center gap-1">Série <SortIcon col="serie" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('turma')}>
                  <span className="inline-flex items-center gap-1">Turma <SortIcon col="turma" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('turno')}>
                  <span className="inline-flex items-center gap-1">Turno <SortIcon col="turno" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('alunos')}>
                  <span className="inline-flex items-center gap-1">Alunos <SortIcon col="alunos" /></span>
                </TableHead>
                <TableHead className="w-[70px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTurmas.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.serie}</TableCell>
                  <TableCell>{t.turma}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{t.turno}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{getAlunosCount(t)}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" />}
                      >
                        <MoreVertical className="size-4" />
                        <span className="sr-only">Ações</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          render={<Link href={`/turmas/${t.id}/alunos`} />}
                        >
                          <Users className="size-4" />
                          Ver Alunos
                        </DropdownMenuItem>
                        {!isCorretor && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openEditDialog(t)}>
                              <Pencil className="size-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => openDeleteDialog(t)}
                            >
                              <Trash2 className="size-4" />
                              Excluir
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
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
              {editingTurma ? 'Editar Turma' : 'Nova Turma'}
            </DialogTitle>
            <DialogDescription>
              {editingTurma
                ? 'Altere os dados da turma.'
                : 'Preencha os dados da nova turma.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="serie">Série</Label>
              <Input
                id="serie"
                value={serie}
                onChange={(e) => setSerie(e.target.value)}
                placeholder="Ex: 1º Ano"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="turma">Turma</Label>
              <Input
                id="turma"
                value={turma}
                onChange={(e) => setTurma(e.target.value)}
                placeholder="Ex: A"
              />
            </div>
            <div className="space-y-2">
              <Label>Turno</Label>
              <Select value={turno} onValueChange={(val) => { if (val) setTurno(val) }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o turno" />
                </SelectTrigger>
                <SelectContent>
                  {TURNOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir a turma{' '}
              <strong>
                {deletingTurma?.serie} {deletingTurma?.turma}
              </strong>
              ? Esta ação pode ser desfeita.
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
