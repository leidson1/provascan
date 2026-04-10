'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Plus, FileText, MoreVertical, ClipboardCheck, BookOpen,
  BarChart3, CreditCard, Trash2, Pencil, Save, Loader2, CheckCircle2,
  ArrowUpDown, ArrowUp, ArrowDown, Copy, RotateCcw
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace, useIsGestor, useIsDono } from '@/contexts/workspace-context'
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
  prova_origem_id: number | null
  created_at: string
  disciplina: { nome: string } | null
  turma: { serie: string; turma: string } | null
  // Computed fields for progress
  resultados_count?: number
  alunos_count?: number
  faltas_count?: number
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
  const isGestor = useIsGestor()
  const isDono = useIsDono()
  const isCorretor = !isGestor

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

  // Duplicate states
  const [duplicateProva, setDuplicateProva] = useState<ProvaRow | null>(null)
  const [duplicateTurmas, setDuplicateTurmas] = useState<number[]>([])
  const [duplicating, setDuplicating] = useState(false)

  // Segunda chamada states
  type AlunoAusente = { id: number; nome: string; numero: number | null }
  const [segundaChamadaProva, setSegundaChamadaProva] = useState<ProvaRow | null>(null)
  const [alunosAusentes, setAlunosAusentes] = useState<AlunoAusente[]>([])
  const [loadingAusentes, setLoadingAusentes] = useState(false)
  const [segundaChamadaOrigemId, setSegundaChamadaOrigemId] = useState<number | null>(null)

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

    if (discRes.data) setDisciplinas(discRes.data)
    if (turmaRes.data) setTurmas(turmaRes.data)

    if (provasRes.data) {
      const provasList = provasRes.data as unknown as ProvaRow[]

      // Fetch correction progress counts in parallel
      const [resResultados, resAlunos] = await Promise.all([
        supabase
          .from('resultados')
          .select('prova_id, presenca')
          .eq('workspace_id', workspaceId)
          .in('presenca', ['P', '*', 'F']),
        supabase
          .from('alunos')
          .select('turma_id')
          .eq('workspace_id', workspaceId)
          .eq('ativo', true),
      ])

      // Count resultados per prova (presentes e faltas separados)
      const resCounts: Record<number, number> = {}
      const faltaCounts: Record<number, number> = {}
      for (const r of resResultados.data ?? []) {
        if (r.presenca === 'F') {
          faltaCounts[r.prova_id] = (faltaCounts[r.prova_id] || 0) + 1
        } else {
          resCounts[r.prova_id] = (resCounts[r.prova_id] || 0) + 1
        }
      }

      // Count alunos per turma
      const alunoCounts: Record<number, number> = {}
      for (const a of resAlunos.data ?? []) {
        alunoCounts[a.turma_id] = (alunoCounts[a.turma_id] || 0) + 1
      }

      // Attach counts to provas
      for (const p of provasList) {
        p.resultados_count = resCounts[p.id] || 0
        p.faltas_count = faltaCounts[p.id] || 0
        if (p.prova_origem_id) {
          // Segunda chamada: total = faltas da prova original
          p.alunos_count = faltaCounts[p.prova_origem_id] || 0
        } else {
          p.alunos_count = p.turma_id ? (alunoCounts[p.turma_id] || 0) : 0
        }
      }

      setProvas(provasList)
    }
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

    // Se é segunda chamada, vincular à prova original
    const fullPayload = segundaChamadaOrigemId
      ? { ...payload, prova_origem_id: segundaChamadaOrigemId }
      : payload

    let error
    if (editingProva) {
      const res = await supabase.from('provas').update(fullPayload).eq('id', editingProva.id)
      error = res.error
    } else {
      const res = await supabase.from('provas').insert(fullPayload)
      error = res.error
    }

    const isSegunda = !!segundaChamadaOrigemId
    if (error) {
      toast.error(editingProva ? 'Erro ao atualizar prova' : isSegunda ? 'Erro ao criar 2ª chamada' : 'Erro ao criar prova')
    } else {
      toast.success(editingProva ? 'Prova atualizada!' : isSegunda ? '2ª chamada criada!' : 'Prova criada com sucesso!')
      setProvaDialogOpen(false)
      setSegundaChamadaOrigemId(null)
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

  // ── Duplicate prova to multiple turmas ──
  async function handleDuplicate() {
    if (!duplicateProva || !userId || duplicateTurmas.length === 0) return
    setDuplicating(true)

    const inserts = duplicateTurmas.map(turmaId => ({
      user_id: userId,
      workspace_id: workspaceId,
      data: duplicateProva.data || null,
      disciplina_id: duplicateProva.disciplina_id,
      turma_id: turmaId,
      num_questoes: duplicateProva.num_questoes,
      num_alternativas: duplicateProva.num_alternativas,
      bloco: duplicateProva.bloco,
      modo_avaliacao: duplicateProva.modo_avaliacao,
      nota_total: duplicateProva.nota_total,
      status: 'aberta' as const,
      tipo_prova: duplicateProva.tipo_prova,
      tipos_questoes: duplicateProva.tipos_questoes,
      criterio_discursiva: duplicateProva.criterio_discursiva,
      modo_anulacao: duplicateProva.modo_anulacao,
      gabarito: duplicateProva.gabarito,
      pesos_questoes: duplicateProva.pesos_questoes,
    }))

    const { error } = await supabase.from('provas').insert(inserts)
    if (error) {
      toast.error('Erro ao duplicar prova')
    } else {
      toast.success(`Prova duplicada para ${duplicateTurmas.length} turma(s)!`)
      setDuplicateProva(null)
      fetchAll()
    }
    setDuplicating(false)
  }

  // ── Open segunda chamada modal ──
  async function openSegundaChamada(prova: ProvaRow) {
    setSegundaChamadaProva(prova)
    setLoadingAusentes(true)
    setAlunosAusentes([])

    const { data } = await supabase
      .from('resultados')
      .select('aluno_id, presenca, aluno:alunos(id, nome, numero)')
      .eq('prova_id', prova.id)
      .eq('presenca', 'F')

    const ausentes: AlunoAusente[] = (data ?? [])
      .filter((r: { aluno?: { id: number; nome: string; numero: number | null } | null }) => r.aluno)
      .map((r: { aluno?: { id: number; nome: string; numero: number | null } | null }) => ({
        id: r.aluno!.id,
        nome: r.aluno!.nome,
        numero: r.aluno!.numero,
      }))

    setAlunosAusentes(ausentes)
    setLoadingAusentes(false)
  }

  function handleProsseguirSegundaChamada() {
    if (!segundaChamadaProva) return
    const p = segundaChamadaProva
    // Guardar origem e abrir ProvaModal pré-preenchido
    setSegundaChamadaOrigemId(p.id)
    setEditingProva(null)
    setSegundaChamadaProva(null)
    setProvaDialogOpen(true)
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
                  <TableHead className="w-14 text-center">#</TableHead>
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
                  <TableHead className="text-center">Progresso</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProvas.map((prova) => (
                  <TableRow key={prova.id}>
                    <TableCell className="text-center text-xs text-muted-foreground font-mono">{prova.id}</TableCell>
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
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        {statusBadge(prova.status)}
                        {prova.prova_origem_id && (
                          <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-[10px]">2ª Chamada (Prova #{prova.prova_origem_id})</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {prova.alunos_count ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            (prova.resultados_count ?? 0) + (prova.faltas_count ?? 0) === prova.alunos_count
                              ? 'bg-green-100 text-green-700'
                              : prova.resultados_count
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-gray-100 text-gray-500'
                          )}>
                            {prova.resultados_count ?? 0}/{prova.alunos_count}
                          </span>
                          {(prova.faltas_count ?? 0) > 0 && (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                              {prova.faltas_count}F
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">&mdash;</span>
                      )}
                    </TableCell>
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
                            <DropdownMenuItem onClick={() => { setDuplicateProva(prova); setDuplicateTurmas([]) }}>
                              <Copy className="mr-2 h-4 w-4" /> Duplicar para Turmas
                            </DropdownMenuItem>
                          )}
                          {!isCorretor && prova.resultados_count !== undefined && prova.resultados_count > 0 && (
                            <DropdownMenuItem onClick={() => openSegundaChamada(prova)}>
                              <RotateCcw className="mr-2 h-4 w-4" /> 2ª Chamada
                            </DropdownMenuItem>
                          )}
                          {isDono && (
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
        onOpenChange={(open) => {
          setProvaDialogOpen(open)
          if (!open) setSegundaChamadaOrigemId(null)
        }}
        disciplinas={disciplinas}
        turmas={turmas}
        saving={saving}
        onSave={handleSaveProva}
        editMode={!!editingProva}
        initial={(() => {
          // Edição de prova existente
          if (editingProva) return {
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
          }
          // Segunda chamada — pré-preencher com configs da prova original
          if (segundaChamadaOrigemId) {
            const orig = provas.find(p => p.id === segundaChamadaOrigemId)
            if (orig) return {
              data: new Date().toISOString().split('T')[0],
              bloco: orig.bloco,
              disciplinaId: orig.disciplina_id ? String(orig.disciplina_id) : '',
              turmaId: orig.turma_id ? String(orig.turma_id) : '',
              tipoProva: orig.tipo_prova || 'objetiva',
              numQuestoes: orig.num_questoes,
              numAlternativas: orig.num_alternativas,
              criterioDiscursiva: orig.criterio_discursiva || 3,
              modoAvaliacao: orig.modo_avaliacao,
              notaTotal: orig.nota_total || 10,
              modoAnulacao: orig.modo_anulacao || 'contar_certa',
              tiposQuestoes: orig.tipos_questoes?.split(',') || [],
              gabarito: orig.gabarito || '',
              pesosQuestoes: orig.pesos_questoes?.split(',').map(Number) || [],
            }
          }
          return undefined
        })()}
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

      {/* ════════════════════════════════════════════════ */}
      {/*  MODAL: Duplicar para Turmas                    */}
      {/* ════════════════════════════════════════════════ */}
      <Dialog open={duplicateProva !== null} onOpenChange={(open) => !open && setDuplicateProva(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicar Prova para Outras Turmas</DialogTitle>
            <DialogDescription>
              {duplicateProva?.disciplina?.nome ?? 'Prova'} &mdash;{' '}
              {duplicateProva?.turma ? `${duplicateProva.turma.serie} ${duplicateProva.turma.turma}` : ''}
              {' '}&mdash; {duplicateProva?.num_questoes} questões
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm font-medium text-gray-700">Selecione as turmas de destino:</p>
            {turmas
              .filter(t => t.id !== duplicateProva?.turma_id)
              .map(t => (
                <label key={t.id} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    checked={duplicateTurmas.includes(t.id)}
                    onChange={(e) => {
                      setDuplicateTurmas(prev =>
                        e.target.checked
                          ? [...prev, t.id]
                          : prev.filter(id => id !== t.id)
                      )
                    }}
                  />
                  <span className="text-sm font-medium">{t.serie} - {t.turma}</span>
                </label>
              ))}
            {turmas.filter(t => t.id !== duplicateProva?.turma_id).length === 0 && (
              <p className="text-sm text-gray-500 py-2">Nenhuma outra turma disponível.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateProva(null)}>Cancelar</Button>
            <Button
              onClick={handleDuplicate}
              disabled={duplicating || duplicateTurmas.length === 0}
              className="gap-2"
            >
              {duplicating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              {duplicating ? 'Duplicando...' : `Duplicar para ${duplicateTurmas.length} turma(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════ */}
      {/*  MODAL: Segunda Chamada                         */}
      {/* ════════════════════════════════════════════════ */}
      <Dialog open={segundaChamadaProva !== null} onOpenChange={(open) => !open && setSegundaChamadaProva(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar 2ª Chamada</DialogTitle>
            <DialogDescription>
              {segundaChamadaProva?.disciplina?.nome ?? 'Prova'} &mdash;{' '}
              {segundaChamadaProva?.turma ? `${segundaChamadaProva.turma.serie} ${segundaChamadaProva.turma.turma}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {loadingAusentes ? (
              <div className="flex justify-center py-4">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
              </div>
            ) : alunosAusentes.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">Nenhum aluno ausente encontrado nesta prova.</p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700">
                  {alunosAusentes.length} aluno(s) ausente(s):
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {alunosAusentes.map(a => (
                    <div key={a.id} className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
                      <span className="text-gray-400 text-xs w-6">{a.numero ?? '-'}</span>
                      <span className="font-medium text-gray-800">{a.nome}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  Ao prosseguir, o formulário de criação abrirá pré-preenchido com as configurações da prova original. Você poderá ajustar data, tipo, gabarito e demais opções antes de salvar.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSegundaChamadaProva(null)}>Cancelar</Button>
            <Button
              onClick={handleProsseguirSegundaChamada}
              disabled={alunosAusentes.length === 0}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Prosseguir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
