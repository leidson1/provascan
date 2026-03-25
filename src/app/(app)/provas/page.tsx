'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Plus, FileText, MoreVertical, ClipboardCheck, BookOpen,
  BarChart3, CreditCard, Trash2, Pencil, Save, Loader2, CheckCircle2
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/contexts/workspace-context'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { AnswerKeyEditor } from '@/components/answer-key-editor'
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

  // Form fields
  const [formData, setFormData] = useState('')
  const [formDisciplinaId, setFormDisciplinaId] = useState('')
  const [formTurmaId, setFormTurmaId] = useState('')
  const [formNumQuestoes, setFormNumQuestoes] = useState(10)
  const [formNumAlternativas, setFormNumAlternativas] = useState(5)
  const [formBloco, setFormBloco] = useState('B1')
  const [formModoAvaliacao, setFormModoAvaliacao] = useState<'acertos' | 'nota'>('acertos')
  const [formNotaTotal, setFormNotaTotal] = useState(10)
  const [formTipoProva, setFormTipoProva] = useState<'objetiva' | 'mista' | 'discursiva'>('objetiva')
  const [formCriterioDiscursiva, setFormCriterioDiscursiva] = useState(3)
  const [formTiposQuestoes, setFormTiposQuestoes] = useState<string[]>([])
  const [formModoAnulacao, setFormModoAnulacao] = useState<'contar_certa' | 'redistribuir'>('contar_certa')

  // Gabarito form
  const [formGabarito, setFormGabarito] = useState('')
  const [formPesosQuestoes, setFormPesosQuestoes] = useState<number[]>([])

  useEffect(() => {
    fetchAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open create modal if ?nova=1
  useEffect(() => {
    if (searchParams.get('nova') === '1' && !isCorretor && !loading) {
      openCreateModal()
      // Clean the URL param
      router.replace('/provas', { scroll: false })
    }
  }, [loading, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep formTiposQuestoes in sync with formNumQuestoes
  useEffect(() => {
    setFormTiposQuestoes((prev) => {
      if (prev.length < formNumQuestoes) {
        return [...prev, ...Array(formNumQuestoes - prev.length).fill('O')]
      }
      if (prev.length > formNumQuestoes) {
        return prev.slice(0, formNumQuestoes)
      }
      return prev
    })
  }, [formNumQuestoes])

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

  // ── Open create modal ──
  function openCreateModal() {
    setEditingProva(null)
    setFormData(new Date().toISOString().split('T')[0])
    setFormDisciplinaId('')
    setFormTurmaId('')
    setFormNumQuestoes(10)
    setFormNumAlternativas(5)
    setFormBloco('B1')
    setFormModoAvaliacao('acertos')
    setFormNotaTotal(10)
    setFormTipoProva('objetiva')
    setFormCriterioDiscursiva(3)
    setFormTiposQuestoes([])
    setFormModoAnulacao('contar_certa')
    setFormGabarito('')
    setFormPesosQuestoes([])
    setProvaDialogOpen(true)
  }

  // ── Open edit modal ──
  function openEditModal(prova: ProvaRow) {
    setEditingProva(prova)
    setFormData(prova.data || '')
    setFormDisciplinaId(prova.disciplina_id ? String(prova.disciplina_id) : '')
    setFormTurmaId(prova.turma_id ? String(prova.turma_id) : '')
    setFormNumQuestoes(prova.num_questoes)
    setFormNumAlternativas(prova.num_alternativas)
    setFormBloco(prova.bloco)
    setFormModoAvaliacao(prova.modo_avaliacao)
    setFormNotaTotal(prova.nota_total || 10)
    setFormTipoProva(prova.tipo_prova || 'objetiva')
    setFormCriterioDiscursiva(prova.criterio_discursiva || 3)
    setFormTiposQuestoes(prova.tipos_questoes ? prova.tipos_questoes.split(',') : [])
    setFormModoAnulacao(prova.modo_anulacao || 'contar_certa')
    setFormGabarito(prova.gabarito || '')
    setFormPesosQuestoes(
      prova.pesos_questoes
        ? prova.pesos_questoes.split(',').map(Number)
        : []
    )
    setProvaDialogOpen(true)
  }

  // ── Open gabarito modal ──
  function openGabaritoModal(prova: ProvaRow) {
    setGabaritoProva(prova)
    setFormGabarito(prova.gabarito || '')
    setGabaritoDialogOpen(true)
  }

  // ── Save create/edit ──
  async function handleSaveProva() {
    if (!userId) return
    setSaving(true)

    const tiposQuestoes = formTipoProva === 'objetiva'
      ? Array(formNumQuestoes).fill('O').join(',')
      : formTipoProva === 'discursiva'
        ? Array(formNumQuestoes).fill('D').join(',')
        : formTiposQuestoes.join(',')

    // Build gabarito string from inline editor
    const gabaritoArr = formGabarito ? formGabarito.split(',') : []
    while (gabaritoArr.length < formNumQuestoes) gabaritoArr.push('')
    if (gabaritoArr.length > formNumQuestoes) gabaritoArr.length = formNumQuestoes
    // Force discursive questions to 'D'
    const tiposArr = tiposQuestoes.split(',')
    for (let i = 0; i < formNumQuestoes; i++) {
      if (tiposArr[i] === 'D') gabaritoArr[i] = 'D'
    }
    const finalGabarito = gabaritoArr.join(',')

    // Build pesos_questoes for discursive questions
    const pesosArr = [...formPesosQuestoes]
    while (pesosArr.length < formNumQuestoes) pesosArr.push(0)
    if (pesosArr.length > formNumQuestoes) pesosArr.length = formNumQuestoes
    const hasDiscursive = tiposArr.some((t) => t === 'D')

    // For discursiva tipo, nota_total = sum of pesos
    const computedNotaTotal = formTipoProva === 'discursiva'
      ? pesosArr.reduce((s, v) => s + v, 0)
      : formModoAvaliacao === 'nota'
        ? formNotaTotal
        : null

    const payload = {
      user_id: userId,
      workspace_id: workspaceId,
      data: formData || null,
      disciplina_id: formDisciplinaId ? Number(formDisciplinaId) : null,
      turma_id: formTurmaId ? Number(formTurmaId) : null,
      num_questoes: formNumQuestoes,
      num_alternativas: formNumAlternativas,
      bloco: formBloco,
      modo_avaliacao: formModoAvaliacao,
      nota_total: computedNotaTotal,
      tipo_prova: formTipoProva,
      tipos_questoes: tiposQuestoes,
      criterio_discursiva: formTipoProva !== 'objetiva' ? formCriterioDiscursiva : 3,
      modo_anulacao: formModoAnulacao,
      gabarito: finalGabarito || null,
      pesos_questoes: hasDiscursive ? pesosArr.join(',') : null,
      status: 'aberta' as const,
    }

    let error
    if (editingProva) {
      const res = await supabase
        .from('provas')
        .update(payload)
        .eq('id', editingProva.id)
      error = res.error
    } else {
      const res = await supabase
        .from('provas')
        .insert(payload)
      error = res.error
    }

    if (error) {
      toast.error(editingProva ? 'Erro ao atualizar prova' : 'Erro ao criar prova')
      console.error(error)
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
          <Button onClick={openCreateModal} className="gap-2">
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
                <Button onClick={openCreateModal} size="sm" className="mt-4 gap-2">
                  <Plus className="h-4 w-4" /> Nova Prova
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Disciplina</TableHead>
                  <TableHead>Turma</TableHead>
                  <TableHead className="text-center">Questões</TableHead>
                  <TableHead>Gabarito</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {provas.map((prova) => (
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
                              <DropdownMenuItem onClick={() => openEditModal(prova)}>
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
      <Dialog open={provaDialogOpen} onOpenChange={setProvaDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProva ? 'Editar Prova' : 'Nova Prova'}</DialogTitle>
            <DialogDescription>
              {editingProva
                ? 'Altere os dados da prova abaixo.'
                : 'Preencha os dados para criar uma nova prova.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Row 1: Data + Bloco */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="m-data">Data da Prova</Label>
                <Input id="m-data" type="date" value={formData} onChange={(e) => setFormData(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-bloco">Bloco</Label>
                <Input id="m-bloco" value={formBloco} onChange={(e) => setFormBloco(e.target.value)} />
              </div>
            </div>

            {/* Row 2: Disciplina + Turma */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Disciplina</Label>
                <Select value={formDisciplinaId} onValueChange={(v) => v && setFormDisciplinaId(v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {disciplinas.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Turma</Label>
                <Select value={formTurmaId} onValueChange={(v) => v && setFormTurmaId(v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {turmas.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.serie} - {t.turma}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: Tipo de Prova + Nº Questões + Alternativas/Critério */}
            <div className={`grid gap-3 ${formTipoProva === 'mista' ? 'grid-cols-3' : formTipoProva === 'discursiva' ? 'grid-cols-3' : 'grid-cols-3'}`}>
              <div className="space-y-1.5">
                <Label>Tipo de Prova</Label>
                <Select value={formTipoProva} onValueChange={(v) => {
                  const tipo = v as 'objetiva' | 'mista' | 'discursiva'
                  setFormTipoProva(tipo)
                  if (tipo === 'discursiva') {
                    setFormModoAvaliacao('nota')
                    setFormTiposQuestoes(Array(formNumQuestoes).fill('D'))
                  } else if (tipo === 'objetiva') {
                    setFormTiposQuestoes(Array(formNumQuestoes).fill('O'))
                  }
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="objetiva">Objetiva</SelectItem>
                    <SelectItem value="mista">Mista</SelectItem>
                    <SelectItem value="discursiva">Discursiva</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-nq">Nº Questões</Label>
                <Input id="m-nq" type="number" min={1} max={50} value={formNumQuestoes}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    setFormNumQuestoes(n)
                    if (formTipoProva === 'discursiva') {
                      setFormTiposQuestoes(Array(n).fill('D'))
                    }
                  }} />
              </div>
              {formTipoProva === 'discursiva' ? (
                <div className="space-y-1.5">
                  <Label>Critério</Label>
                  <Select value={String(formCriterioDiscursiva)} onValueChange={(v) => v && setFormCriterioDiscursiva(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 níveis (C/E)</SelectItem>
                      <SelectItem value="3">3 níveis (C/P/E)</SelectItem>
                      <SelectItem value="4">4 níveis (E/B/P/I)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Alternativas</Label>
                  <Select value={String(formNumAlternativas)} onValueChange={(v) => v && setFormNumAlternativas(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 (A-D)</SelectItem>
                      <SelectItem value="5">5 (A-E)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Row 4: Question type toggle grid (mista only) */}
            {formTipoProva === 'mista' && formNumQuestoes > 0 && (
              <div className="space-y-2">
                <Label>Tipo por questão <span className="font-normal text-xs text-muted-foreground ml-1">Clique para alternar O/D</span></Label>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: formNumQuestoes }).map((_, i) => {
                    const tipo = formTiposQuestoes[i] || 'O'
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          const newTipos = [...formTiposQuestoes]
                          while (newTipos.length <= i) newTipos.push('O')
                          newTipos[i] = newTipos[i] === 'D' ? 'O' : 'D'
                          setFormTiposQuestoes(newTipos)
                        }}
                        className={`w-9 h-9 rounded text-xs font-bold border transition-colors ${
                          tipo === 'D'
                            ? 'bg-blue-500 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-[9px] leading-none opacity-70">{i + 1}</div>
                        <div className="leading-none">{tipo}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Row 5: Critério for mista (if has discursive questions) */}
            {formTipoProva === 'mista' && formTiposQuestoes.some(t => t === 'D') && (
              <div className="space-y-1.5">
                <Label>Critério das Discursivas</Label>
                <Select value={String(formCriterioDiscursiva)} onValueChange={(v) => v && setFormCriterioDiscursiva(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 níveis (Certo / Errado)</SelectItem>
                    <SelectItem value="3">3 níveis (Certo / Parcial / Errado)</SelectItem>
                    <SelectItem value="4">4 níveis (Excelente / Bom / Parcial / Insuficiente)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Row 6: Avaliação + Anulação (same row) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Avaliação</Label>
                <Select
                  value={formModoAvaliacao}
                  onValueChange={(v) => v && setFormModoAvaliacao(v as 'acertos' | 'nota')}
                  disabled={formTipoProva === 'discursiva'}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="acertos">Por Acertos</SelectItem>
                    <SelectItem value="nota">Por Nota</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Anulação</Label>
                <Select value={formModoAnulacao} onValueChange={(v) => v && setFormModoAnulacao(v as 'contar_certa' | 'redistribuir')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contar_certa">Contar como certa</SelectItem>
                    <SelectItem value="redistribuir">Redistribuir peso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 7: Nota Total (only for nota mode, not discursiva which auto-calculates) */}
            {formModoAvaliacao === 'nota' && formTipoProva !== 'discursiva' && (
              <div className="space-y-1.5">
                <Label htmlFor="m-nota">Nota Total</Label>
                <Input id="m-nota" type="number" min={1} step="0.1" value={formNotaTotal}
                  onChange={(e) => setFormNotaTotal(Number(e.target.value))} />
              </div>
            )}

            {/* ── SEPARATOR ── */}
            <div className="border-t border-gray-200 pt-3">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-semibold">Gabarito</Label>
                <div className="flex items-center gap-3 text-[11px] text-gray-500">
                  {formTipoProva !== 'discursiva' && (
                    <>
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-2.5 w-2.5 rounded bg-indigo-500" />
                        Resposta
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-2.5 w-2.5 rounded bg-amber-500" />
                        Anulada
                      </span>
                    </>
                  )}
                  {formTipoProva !== 'objetiva' && (
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2.5 w-2.5 rounded bg-blue-500" />
                      Discursiva
                    </span>
                  )}
                </div>
              </div>

              {/* Gabarito Grid */}
              {(() => {
                const ALTS = ['A', 'B', 'C', 'D', 'E'].slice(0, formNumAlternativas)
                const DISC_LABELS: Record<number, string[]> = {
                  2: ['C', 'E'],
                  3: ['C', 'P', 'E'],
                  4: ['E', 'B', 'P', 'I'],
                }
                const discLabels = DISC_LABELS[formCriterioDiscursiva] || DISC_LABELS[3]

                // Parse current gabarito
                const gabArr = formGabarito ? formGabarito.split(',') : []
                while (gabArr.length < formNumQuestoes) gabArr.push('')
                if (gabArr.length > formNumQuestoes) gabArr.length = formNumQuestoes

                // Parse pesos
                const pesosArr = [...formPesosQuestoes]
                while (pesosArr.length < formNumQuestoes) pesosArr.push(0)

                // Compute tipos for each question
                const tiposArr = formTipoProva === 'objetiva'
                  ? Array(formNumQuestoes).fill('O')
                  : formTipoProva === 'discursiva'
                    ? Array(formNumQuestoes).fill('D')
                    : formTiposQuestoes.length >= formNumQuestoes
                      ? formTiposQuestoes
                      : [...formTiposQuestoes, ...Array(formNumQuestoes - formTiposQuestoes.length).fill('O')]

                const filledCount = gabArr.filter((a) => a !== '').length

                function handleGabSelect(idx: number, letter: string) {
                  const updated = [...gabArr]
                  updated[idx] = updated[idx] === letter ? '' : letter
                  setFormGabarito(updated.join(','))
                }

                function handleGabAnular(idx: number) {
                  const updated = [...gabArr]
                  updated[idx] = updated[idx] === 'X' ? '' : 'X'
                  setFormGabarito(updated.join(','))
                }

                function handlePesoChange(idx: number, val: number) {
                  const updated = [...pesosArr]
                  updated[idx] = val
                  setFormPesosQuestoes(updated)
                }

                return (
                  <div className="space-y-2">
                    {/* Scrollable grid area */}
                    <div className="max-h-[280px] overflow-y-auto border border-gray-200 rounded-lg">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50 z-10">
                          <tr className="border-b border-gray-200">
                            <th className="w-10 py-1.5 px-2 text-left font-semibold text-gray-600">Q</th>
                            {/* Show objective or discursive headers based on if there are any of each type */}
                            {formTipoProva === 'objetiva' ? (
                              <>
                                {ALTS.map(l => (
                                  <th key={l} className="w-9 py-1.5 text-center font-semibold text-gray-600">{l}</th>
                                ))}
                                <th className="w-9 py-1.5 text-center font-semibold text-amber-600">X</th>
                              </>
                            ) : formTipoProva === 'discursiva' ? (
                              <>
                                <th className="py-1.5 text-center font-semibold text-gray-600" colSpan={discLabels.length}>Critério</th>
                                <th className="w-16 py-1.5 text-center font-semibold text-gray-600">Valor</th>
                              </>
                            ) : (
                              <>
                                {ALTS.map(l => (
                                  <th key={l} className="w-9 py-1.5 text-center font-semibold text-gray-600">{l}</th>
                                ))}
                                <th className="w-9 py-1.5 text-center font-semibold text-amber-600">X</th>
                                <th className="w-16 py-1.5 text-center font-semibold text-gray-600">Valor</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: formNumQuestoes }).map((_, idx) => {
                            const tipo = tiposArr[idx] || 'O'
                            const answer = gabArr[idx] || ''
                            const isDisc = tipo === 'D'

                            return (
                              <tr key={idx} className={`border-b border-gray-100 ${isDisc ? 'bg-blue-50/40' : ''}`}>
                                <td className="py-1 px-2 font-semibold text-gray-500 tabular-nums">{idx + 1}</td>
                                {isDisc ? (
                                  <>
                                    {/* Discursive: show criterion buttons + valor */}
                                    {formTipoProva === 'objetiva' ? null : formTipoProva === 'discursiva' ? (
                                      <>
                                        {discLabels.map(label => (
                                          <td key={label} className="py-1 text-center">
                                            <span className="inline-flex items-center justify-center w-7 h-6 rounded bg-blue-500 text-white text-[10px] font-bold">
                                              {label}
                                            </span>
                                          </td>
                                        ))}
                                        <td className="py-1 px-1 text-center">
                                          <input
                                            type="number"
                                            min={0}
                                            step={0.1}
                                            value={pesosArr[idx] || ''}
                                            onChange={(e) => handlePesoChange(idx, Number(e.target.value))}
                                            className="w-14 h-6 text-xs text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                            placeholder="0.0"
                                          />
                                        </td>
                                      </>
                                    ) : (
                                      /* Mista: discursive row inside mixed grid */
                                      <>
                                        {ALTS.map((_, altIdx) => (
                                          <td key={altIdx} className="py-1 text-center">
                                            {altIdx < discLabels.length ? (
                                              <span className="inline-flex items-center justify-center w-7 h-6 rounded bg-blue-500 text-white text-[10px] font-bold">
                                                {discLabels[altIdx]}
                                              </span>
                                            ) : null}
                                          </td>
                                        ))}
                                        <td className="py-1 text-center">
                                          {/* X column empty for discursive */}
                                        </td>
                                        <td className="py-1 px-1 text-center">
                                          <input
                                            type="number"
                                            min={0}
                                            step={0.1}
                                            value={pesosArr[idx] || ''}
                                            onChange={(e) => handlePesoChange(idx, Number(e.target.value))}
                                            className="w-14 h-6 text-xs text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                            placeholder="0.0"
                                          />
                                        </td>
                                      </>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {/* Objective: letter buttons + X */}
                                    {ALTS.map(letter => (
                                      <td key={letter} className="py-1 text-center">
                                        <button
                                          type="button"
                                          onClick={() => handleGabSelect(idx, letter)}
                                          className={`w-7 h-6 rounded text-[10px] font-bold transition-colors ${
                                            answer === letter
                                              ? 'bg-indigo-500 text-white'
                                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                          }`}
                                        >
                                          {letter}
                                        </button>
                                      </td>
                                    ))}
                                    <td className="py-1 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleGabAnular(idx)}
                                        className={`w-7 h-6 rounded text-[10px] font-bold transition-colors ${
                                          answer === 'X'
                                            ? 'bg-amber-500 text-white'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                      >
                                        X
                                      </button>
                                    </td>
                                    {/* Valor column placeholder for mista alignment */}
                                    {formTipoProva === 'mista' && (
                                      <td className="py-1 text-center">
                                        <span className="text-[10px] text-gray-300">-</span>
                                      </td>
                                    )}
                                  </>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Summary bar */}
                    <div className={`flex items-center justify-between rounded-md px-3 py-1.5 text-xs font-medium ${
                      filledCount === formNumQuestoes
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}>
                      <span>{filledCount}/{formNumQuestoes} questões preenchidas</span>
                      {formTipoProva === 'discursiva' && (
                        <span>Nota total: {pesosArr.slice(0, formNumQuestoes).reduce((s, v) => s + (v || 0), 0).toFixed(1)}</span>
                      )}
                      {formTipoProva === 'mista' && formTiposQuestoes.some(t => t === 'D') && (
                        <span>Soma disc.: {pesosArr.slice(0, formNumQuestoes).filter((_, i) => tiposArr[i] === 'D').reduce((s, v) => s + (v || 0), 0).toFixed(1)}</span>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setProvaDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveProva} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Salvando...' : editingProva ? 'Salvar Alterações' : 'Criar Prova'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
