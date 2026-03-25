'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, FileText, MoreVertical, ClipboardCheck, BookOpen,
  BarChart3, CreditCard, Trash2, Pencil, Save, Loader2, CheckCircle2
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
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
//  MAIN PAGE
// ══════════════════════════════════════════════════════
export default function ProvasPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

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

  // Gabarito form
  const [formGabarito, setFormGabarito] = useState('')

  useEffect(() => {
    fetchAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [provasRes, discRes, turmaRes] = await Promise.all([
      supabase
        .from('provas')
        .select('*, disciplina:disciplinas(nome), turma:turmas(serie, turma)')
        .eq('user_id', user.id)
        .neq('status', 'excluida')
        .order('created_at', { ascending: false }),
      supabase
        .from('disciplinas')
        .select('*')
        .eq('user_id', user.id)
        .eq('ativo', true)
        .order('nome'),
      supabase
        .from('turmas')
        .select('*')
        .eq('user_id', user.id)
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

    const payload = {
      user_id: userId,
      data: formData || null,
      disciplina_id: formDisciplinaId ? Number(formDisciplinaId) : null,
      turma_id: formTurmaId ? Number(formTurmaId) : null,
      num_questoes: formNumQuestoes,
      num_alternativas: formNumAlternativas,
      bloco: formBloco,
      modo_avaliacao: formModoAvaliacao,
      nota_total: formModoAvaliacao === 'nota' ? formNotaTotal : null,
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
        <Button onClick={openCreateModal} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Prova
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {provas.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-900">Nenhuma prova encontrada</p>
              <p className="mt-1 text-sm text-gray-500">Crie sua primeira prova para começar!</p>
              <Button onClick={openCreateModal} size="sm" className="mt-4 gap-2">
                <Plus className="h-4 w-4" /> Nova Prova
              </Button>
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
                      ) : (
                        <button
                          onClick={() => openGabaritoModal(prova)}
                          className="text-xs text-indigo-600 hover:underline font-medium"
                        >
                          Definir
                        </button>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(prova.status)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-8 w-8 p-0')}>
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditModal(prova)}>
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openGabaritoModal(prova)}>
                            <BookOpen className="mr-2 h-4 w-4" /> Gabarito
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => router.push(`/provas/${prova.id}/correcao`)}>
                            <ClipboardCheck className="mr-2 h-4 w-4" /> Corrigir
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/provas/${prova.id}/estatisticas`)}>
                            <BarChart3 className="mr-2 h-4 w-4" /> Estatísticas
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/provas/${prova.id}/cartoes`)}>
                            <CreditCard className="mr-2 h-4 w-4" /> Gerar Cartões
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setDeleteId(prova.id)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Excluir
                          </DropdownMenuItem>
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
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProva ? 'Editar Prova' : 'Nova Prova'}</DialogTitle>
            <DialogDescription>
              {editingProva
                ? 'Altere os dados da prova abaixo.'
                : 'Preencha os dados para criar uma nova prova.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Data */}
            <div className="space-y-1.5">
              <Label htmlFor="m-data">Data da Prova</Label>
              <Input id="m-data" type="date" value={formData} onChange={(e) => setFormData(e.target.value)} />
            </div>

            {/* Disciplina + Turma side by side */}
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

            {/* Questões + Alternativas side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="m-nq">Nº de Questões</Label>
                <Input id="m-nq" type="number" min={1} max={50} value={formNumQuestoes}
                  onChange={(e) => setFormNumQuestoes(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Alternativas</Label>
                <Select value={String(formNumAlternativas)} onValueChange={(v) => v && setFormNumAlternativas(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">4 (A–D)</SelectItem>
                    <SelectItem value="5">5 (A–E)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Bloco + Modo */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="m-bloco">Bloco</Label>
                <Input id="m-bloco" value={formBloco} onChange={(e) => setFormBloco(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Avaliação</Label>
                <Select value={formModoAvaliacao} onValueChange={(v) => v && setFormModoAvaliacao(v as 'acertos' | 'nota')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="acertos">Por Acertos</SelectItem>
                    <SelectItem value="nota">Por Nota</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-xs text-muted-foreground -mt-2">
              {formModoAvaliacao === 'acertos'
                ? 'Contagem simples de respostas corretas'
                : 'Nota calculada com base em pesos por questão'}
            </p>

            {/* Nota Total */}
            {formModoAvaliacao === 'nota' && (
              <div className="space-y-1.5">
                <Label htmlFor="m-nota">Nota Total</Label>
                <Input id="m-nota" type="number" min={1} step="0.1" value={formNotaTotal}
                  onChange={(e) => setFormNotaTotal(Number(e.target.value))} />
              </div>
            )}
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
