'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Plus, FileText, MoreVertical, ClipboardCheck, BookOpen,
  BarChart3, CreditCard, Trash2, Pencil, Save, Loader2, CheckCircle2,
  ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/contexts/workspace-context'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { AnswerKeyEditor } from '@/components/answer-key-editor'
import { ProvaModal, type ProvaFormData } from '@/components/prova-modal'
import type { Disciplina, Turma } from '@/types/database'

interface ProvaRow {
  id: number
  data: string | null
  num_questoes: number
  num_alternativas: number
  bloco: string
  status: 'aberta' | 'corrigida' | 'excluida'
  modo_avaliacao: 'acertos' | 'nota'
  nota_total: number | null
  gabarito: string | null
  disciplina_id: number | null
  turma_id: number | null
  tipo_prova: 'objetiva' | 'mista' | 'discursiva'
  tipos_questoes: string | null
  criterio_discursiva: number
  modo_anulacao: 'contar_certa' | 'redistribuir'
  pesos_questoes: string | null
  created_at: string
  disciplina: { nome: string } | null
  turma: { serie: string; turma: string } | null
}

function statusBadge(status: string) {
  switch (status) {
    case 'aberta':
      return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Aberta</Badge>
    case 'corrigida':
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Corrigida</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '\u2014'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR')
}

// ── Skeleton ────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-4">
        {[80, 120, 80, 60, 80, 40].map((w, i) => (
          <div key={i} className="h-4 rounded bg-gray-200 animate-pulse" style={{ width: w }} />
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center">
          <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
          <div className="h-4 w-28 rounded bg-gray-100 animate-pulse" />
          <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
          <div className="h-4 w-12 rounded bg-gray-100 animate-pulse" />
          <div className="h-5 w-16 rounded-full bg-gray-100 animate-pulse" />
          <div className="h-6 w-6 rounded bg-gray-100 animate-pulse" />
        </div>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  MAIN PAGE (with Suspense for useSearchParams)
// ══════════════════════════════════════════════════════
export default function ProvasPageWrapper() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" /></div>}>
      <ProvasPage />
    </Suspense>
  )
}

function ProvasPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const searchParams = useSearchParams()
  const { workspaceId, role } = useWorkspace()
  const isCorretor = role === 'corretor'

  const [provas, setProvas] = useState<ProvaRow[]>([])
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([])
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  // Modal states
  const [provaDialogOpen, setProvaDialogOpen] = useState(false)
  const [gabaritoDialogOpen, setGabaritoDialogOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [editingProva, setEditingProva] = useState<ProvaRow | null>(null)
  const [gabaritoProva, setGabaritoProva] = useState<ProvaRow | null>(null)
  const [saving, setSaving] = useState(false)

  // Sort
  const [sortKey, setSortKey] = useState<'data' | 'disciplina' | 'turma' | 'questoes' | 'status'>('data')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'data' ? 'desc' : 'asc')
    }
  }

  function PSortIcon({ col }: { col: typeof sortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 text-gray-300" />
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
  }

  const sortedProvas = useMemo(() => {
    const arr = [...provas]
    arr.sort((a, b) => {
      let va: string | number, vb: string | number
      switch (sortKey) {
        case 'data': va = a.data || ''; vb = b.data || ''; break
        case 'disciplina': va = (a.disciplina?.nome || '').toLowerCase(); vb = (b.disciplina?.nome || '').toLowerCase(); break
        case 'turma': va = (a.turma ? `${a.turma.serie} ${a.turma.turma}` : '').toLowerCase(); vb = (b.turma ? `${b.turma.serie} ${b.turma.turma}` : '').toLowerCase(); break
        case 'questoes': va = a.num_questoes; vb = b.num_questoes; break
        case 'status': va = a.status || ''; vb = b.status || ''; break
        default: va = ''; vb = ''
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [provas, sortKey, sortDir])

  // Gabarito modal form
  const [formGabarito, setFormGabarito] = useState('')

  useEffect(() => {
    fetchAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open create modal if ?nova=1
  useEffect(() => {
    if (searchParams.get('nova') === '1' && !isCorretor && !loading) {
      setEditingProva(null)
      setProvaDialogOpen(true)
      // Clean the URL param
      router.replace('/provas', { scroll: false })
    }
  }, [loading, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [provasRes, discRes, turmaRes] = await Promise.all([
      supabase
        .from('provas')
        .select('*, disciplina:disciplinas(nome), turma:turmas(serie, turma)')
        .eq('workspace_id', workspaceId)
        .neq('status', 'excluida')
        .order('created_at', { ascending: false }),
      supabase
        .from('disciplinas')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('ativo', true)
        .order('nome'),
      supabase
        .from('turmas')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('ativo', true)
        .order('serie'),
    ])

    if (provasRes.data) setProvas(provasRes.data as unknown as ProvaRow[])
    if (discRes.data) setDisciplinas(discRes.data)
    if (turmaRes.data) setTurmas(turmaRes.data)
    setLoading(false)
  }

  // ── Open gabarito modal ──
  function openGabaritoModal(prova: ProvaRow) {
    setGabaritoProva(prova)
    setFormGabarito(prova.gabarito || '')
    setGabaritoDialogOpen(true)
  }

  // ── Save create/edit ──
  async function handleSaveProva(formData: ProvaFormData) {
    if (!userId) return
    setSaving(true)

    // Compute nota_total for discursiva
    let computedNotaTotal = formData.notaTotal
    if (formData.tipoProva === 'discursiva') {
      computedNotaTotal = formData.pesosQuestoes.reduce((s, v) => s + (v || 0), 0)
    }

    const payload = {
      user_id: userId,
      workspace_id: workspaceId,
      data: formData.data || null,
      disciplina_id: formData.disciplinaId ? Number(formData.disciplinaId) : null,
      turma_id: formData.turmaId ? Number(formData.turmaId) : null,
      num_questoes: formData.numQuestoes,
      num_alternativas: formData.numAlternativas,
      bloco: formData.bloco,
      modo_avaliacao: formData.modoAvaliacao,
      nota_total: formData.modoAvaliacao === 'nota' ? computedNotaTotal : null,
      status: 'aberta' as const,
      tipo_prova: formData.tipoProva,
      tipos_questoes: formData.tiposQuestoes.join(','),
      criterio_discursiva: formData.criterioDiscursiva,
      modo_anulacao: formData.modoAnulacao,
      gabarito: formData.gabarito,
      pesos_questoes: formData.pesosQuestoes.join(','),
    }

    let error
    if (editingProva) {
      const res = await supabase.from('provas').update(payload).eq('id', editingProva.id)
      error = res.error
    } else {
      const res = await supabase.from('provas').insert(payload)
      error = res.error
    }

    if (error) {
      toast.error(editingProva ? 'Erro ao atualizar prova' : 'Erro ao criar prova')
    } else {
      toast.success(editingProva ? 'Prova atualizada!' : 'Prova criada com sucesso!')
      setProvaDialogOpen(false)
      fetchAll()
    }
    setSaving(false)
  }

  // ── Save gabarito ──
  async function handleSaveGabarito() {
    if (!gabaritoProva) return
    setSaving(true)

    const { error } = await supabase
      .from('provas')
      .update({ gabarito: formGabarito })
      .eq('id', gabaritoProva.id)

    if (error) {
      toast.error('Erro ao salvar gabarito')
    } else {
      toast.success('Gabarito salvo com sucesso!')
      setGabaritoDialogOpen(false)
      fetchAll()
    }
    setSaving(false)
  }

  // ── Delete ──
  async function handleDelete(provaId: number) {
    const { error } = await supabase
      .from('provas')
      .update({ status: 'excluida' })
      .eq('id', provaId)

    if (error) {
      toast.error('Erro ao excluir prova')
      return
    }
    toast.success('Prova excluída com sucesso')
    setProvas((prev) => prev.filter((p) => p.id !== provaId))
    setDeleteId(null)
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="h-7 w-32 rounded bg-gray-200 animate-pulse" />
            <div className="mt-2 h-4 w-48 rounded bg-gray-100 animate-pulse" />
          </div>
          <div className="h-9 w-28 rounded bg-gray-200 animate-pulse" />
        </div>
        <Card><CardContent className="p-0"><TableSkeleton /></CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Provas <span className="text-lg font-normal text-gray-500">({provas.length})</span>
          </h1>
          <p className="text-sm text-gray-500">Gerencie suas provas e gabaritos</p>
        </div>
        {!isCorretor && (
          <Button onClick={() => { setEditingProva(null); setProvaDialogOpen(true) }} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Prova
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {provas.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-900">Nenhuma prova encontrada</p>
              <p className="mt-1 text-sm text-gray-500">Crie sua primeira prova para começar!</p>
              {!isCorretor && (
                <Button onClick={() => { setEditingProva(null); setProvaDialogOpen(true) }} size="sm" className="mt-4 gap-2">
                  <Plus className="h-4 w-4" /> Nova Prova
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('data')}>
                    <span className="inline-flex items-center gap-1">Data <PSortIcon col="data" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('disciplina')}>
                    <span className="inline-flex items-center gap-1">Disciplina <PSortIcon col="disciplina" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('turma')}>
                    <span className="inline-flex items-center gap-1">Turma <PSortIcon col="turma" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-center" onClick={() => toggleSort('questoes')}>
                    <span className="inline-flex items-center gap-1 justify-center">Questões <PSortIcon col="questoes" /></span>
                  </TableHead>
                  <TableHead>Gabarito</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status')}>
                    <span className="inline-flex items-center gap-1">Status <PSortIcon col="status" /></span>
                  </TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProvas.map((prova) => (
                  <TableRow key={prova.id}>
                    <TableCell className="font-medium">{formatDate(prova.data)}</TableCell>
                    <TableCell>{prova.disciplina?.nome ?? '\u2014'}</TableCell>
                    <TableCell>
                      {prova.turma ? `${prova.turma.serie} ${prova.turma.turma}` : '\u2014'}
                    </TableCell>
                    <TableCell className="text-center">{prova.num_questoes}</TableCell>
                    <TableCell>
                      {prova.gabarito ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Definido
                        </span>
                      ) : !isCorretor ? (
                        <button
                          onClick={() => openGabaritoModal(prova)}
                          className="text-xs text-indigo-600 hover:underline font-medium"
                        >
                          Definir
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Pendente</span>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(prova.status)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-8 w-8 p-0')}>
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!isCorretor && (
                            <>
                              <DropdownMenuItem onClick={() => { setEditingProva(prova); setProvaDialogOpen(true) }}>
                                <Pencil className="mr-2 h-4 w-4" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openGabaritoModal(prova)}>
                                <BookOpen className="mr-2 h-4 w-4" /> Gabarito
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem onClick={() => router.push(`/provas/${prova.id}/correcao`)}>
                            <ClipboardCheck className="mr-2 h-4 w-4" /> Corrigir
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/provas/${prova.id}/estatisticas`)}>
                            <BarChart3 className="mr-2 h-4 w-4" /> Estatísticas
                          </DropdownMenuItem>
                          {!isCorretor && (
                            <DropdownMenuItem onClick={() => router.push(`/provas/${prova.id}/cartoes`)}>
                              <CreditCard className="mr-2 h-4 w-4" /> Gerar Cartões
                            </DropdownMenuItem>
                          )}
                          {!isCorretor && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setDeleteId(prova.id)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Excluir
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
          )}
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════ */}
      {/*  MODAL: Criar / Editar Prova                    */}
      {/* ════════════════════════════════════════════════ */}
      <ProvaModal
        open={provaDialogOpen}
        onOpenChange={setProvaDialogOpen}
        disciplinas={disciplinas}
        turmas={turmas}
        saving={saving}
        onSave={handleSaveProva}
        editMode={!!editingProva}
        initial={editingProva ? {
          data: editingProva.data || '',
          bloco: editingProva.bloco,
          disciplinaId: editingProva.disciplina_id ? String(editingProva.disciplina_id) : '',
          turmaId: editingProva.turma_id ? String(editingProva.turma_id) : '',
          tipoProva: editingProva.tipo_prova || 'objetiva',
          numQuestoes: editingProva.num_questoes,
          numAlternativas: editingProva.num_alternativas,
          criterioDiscursiva: editingProva.criterio_discursiva || 3,
          modoAvaliacao: editingProva.modo_avaliacao,
          notaTotal: editingProva.nota_total || 10,
          modoAnulacao: editingProva.modo_anulacao || 'contar_certa',
          tiposQuestoes: editingProva.tipos_questoes?.split(',') || [],
          gabarito: editingProva.gabarito || '',
          pesosQuestoes: editingProva.pesos_questoes?.split(',').map(Number) || [],
        } : undefined}
      />

      {/* ════════════════════════════════════════════════ */}
      {/*  MODAL: Gabarito                                */}
      {/* ════════════════════════════════════════════════ */}
      <Dialog open={gabaritoDialogOpen} onOpenChange={setGabaritoDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Gabarito
              {gabaritoProva?.disciplina && ` — ${gabaritoProva.disciplina.nome}`}
            </DialogTitle>
            <DialogDescription>
              Selecione a alternativa correta de cada questão. Use &quot;X&quot; para anular uma questão.
            </DialogDescription>
          </DialogHeader>

          {gabaritoProva && (
            <div className="py-2">
              <AnswerKeyEditor
                numQuestoes={gabaritoProva.num_questoes}
                numAlternativas={gabaritoProva.num_alternativas}
                value={formGabarito}
                onChange={setFormGabarito}
                tiposQuestoes={gabaritoProva.tipos_questoes || undefined}
                criterioDiscursiva={gabaritoProva.criterio_discursiva}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setGabaritoDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveGabarito} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Salvando...' : 'Salvar Gabarito'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════ */}
      {/*  MODAL: Confirmar exclusão                      */}
      {/* ════════════════════════════════════════════════ */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir prova</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir esta prova? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
