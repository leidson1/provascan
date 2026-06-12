'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/contexts/workspace-context'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { CorrectionGrid } from '@/components/correction-grid'
import type { Prova, Aluno, Resultado } from '@/types/database'
import { CRITERIOS_DISCURSIVA } from '@/types/database'
import { calcularAcertos, calcularNota, calcularPercentual } from '@/lib/scoring'

const LETRAS = ['A', 'B', 'C', 'D', 'E']

function isPresente(p: string) {
  return p === 'P' || p === '*'
}

function formatScore(value: number) {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

type DadosAluno = {
  presenca: string
  questoes: Record<string, number | string>
  acertos: number
  percentual: number
  nota: number | null
}

export default function CorrecaoPage() {
  const params = useParams()
  const provaId = params.id as string
  const supabase = createClient()
  const { workspaceId } = useWorkspace()

  const [prova, setProva] = useState<Prova | null>(null)
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [dados, setDados] = useState<Record<number, DadosAluno>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [existingCount, setExistingCount] = useState(0)
  const [existingAlunoIds, setExistingAlunoIds] = useState<Set<number>>(new Set())
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)

  const gabarito = prova?.gabarito
    ? prova.gabarito.split(',')
    : Array(prova?.num_questoes ?? 0).fill('')

  const tiposQuestoesArr = prova?.tipos_questoes
    ? prova.tipos_questoes.split(',')
    : []

  useEffect(() => {
    async function fetchData() {
      // Fetch prova
      const { data: provaData, error: provaErr } = await supabase
        .from('provas')
        .select(
          '*, disciplina:disciplinas(nome), turma:turmas(serie, turma)'
        )
        .eq('id', provaId)
        .eq('workspace_id', workspaceId)
        .single()

      if (provaErr || !provaData) {
        toast.error('Prova não encontrada neste workspace')
        setLoading(false)
        return
      }

      const p = provaData as unknown as Prova
      setProva(p)

      if (!p.turma_id) {
        toast.error('Esta prova não tem turma associada')
        setLoading(false)
        return
      }

      // Fetch alunos da turma
      const { data: alunosData } = await supabase
        .from('alunos')
        .select('*')
        .eq('turma_id', p.turma_id)
        .eq('ativo', true)
        .order('numero', { ascending: true })

      let alunosList = (alunosData ?? []) as Aluno[]

      // Se é recuperação, filtrar por alunos selecionados
      if (p.tipo_vinculo === 'recuperacao' && p.alunos_selecionados) {
        const selecionadosIds = new Set(p.alunos_selecionados as number[])
        alunosList = alunosList.filter(a => selecionadosIds.has(a.id))
      }
      // Se é segunda chamada, filtrar só alunos ausentes na prova original
      else if (p.prova_origem_id) {
        const { data: origemResultados } = await supabase
          .from('resultados')
          .select('aluno_id')
          .eq('prova_id', p.prova_origem_id)
          .eq('presenca', 'F')

        const ausentesIds = new Set((origemResultados ?? []).map((r: { aluno_id: number }) => r.aluno_id))
        alunosList = alunosList.filter(a => ausentesIds.has(a.id))
      }

      setAlunos(alunosList)

      // Fetch existing resultados
      const { data: resultados } = await supabase
        .from('resultados')
        .select('*')
        .eq('prova_id', provaId)

      const resultadosList = (resultados ?? []) as Resultado[]
      setExistingCount(resultadosList.filter(r => r.presenca === 'P' || r.presenca === '*').length)
      setExistingAlunoIds(new Set(resultadosList.map(r => r.aluno_id)))
      const gabArr = p.gabarito
        ? p.gabarito.split(',')
        : Array(p.num_questoes).fill('')
      const tiposArr = p.tipos_questoes
        ? p.tipos_questoes.split(',')
        : []

      // Initialize dados
      const dadosInit: Record<number, DadosAluno> = {}
      for (const aluno of alunosList) {
        const resultado = resultadosList.find((r) => r.aluno_id === aluno.id)
        if (resultado) {
          // Normalize respostas keys: "1" -> "q1", and numeric indices -> letters
          const raw = resultado.respostas ?? {}
          const questoes: Record<string, number | string> = {}
          for (const [key, val] of Object.entries(raw)) {
            const normalizedKey = key.startsWith('q') ? key : `q${key}`
            questoes[normalizedKey] = val
          }
          const presenca = resultado.presenca ?? ''
          const acertos = isPresente(presenca)
            ? calcularAcertos(questoes, gabArr, p.modo_anulacao, tiposArr)
            : 0
          const percentual = isPresente(presenca)
            ? calcularPercentual(acertos, p.num_questoes)
            : 0
          const nota = presenca === 'F'
            ? 0
            : isPresente(presenca)
              ? calcularNota(acertos, p, questoes)
              : null
          dadosInit[aluno.id] = {
            presenca,
            questoes,
            acertos,
            percentual,
            nota,
          }
        } else {
          dadosInit[aluno.id] = {
            presenca: '',
            questoes: {},
            acertos: 0,
            percentual: 0,
            nota: null,
          }
        }
      }
      setDados(dadosInit)
      setLoading(false)
    }

    fetchData()
  }, [provaId, workspaceId, supabase])

  function recalcularAluno(
    presenca: string,
    questoes: Record<string, number | string>
  ): DadosAluno {
    if (!prova) return { presenca, questoes, acertos: 0, percentual: 0, nota: null }

    const gabArr = prova.gabarito
      ? prova.gabarito.split(',')
      : Array(prova.num_questoes).fill('')

    if (presenca === 'F') {
      return { presenca, questoes, acertos: 0, percentual: 0, nota: 0 }
    }

    if (!isPresente(presenca)) {
      return { presenca, questoes, acertos: 0, percentual: 0, nota: null }
    }

    const acertos = calcularAcertos(questoes, gabArr, prova.modo_anulacao, tiposQuestoesArr)
    const percentual = calcularPercentual(acertos, prova.num_questoes)
    const nota = calcularNota(acertos, prova, questoes)

    return { presenca, questoes, acertos, percentual, nota }
  }

  function handleTogglePresenca(alunoId: number) {
    setDados((prev) => {
      const current = prev[alunoId] || {
        presenca: '',
        questoes: {},
        acertos: 0,
        percentual: 0,
        nota: null,
      }
      // Cycle: '' -> 'P' -> 'F' -> ''
      let next: string
      if (current.presenca === '') next = 'P'
      else if (isPresente(current.presenca)) next = 'F'
      else next = ''

      const updated = recalcularAluno(next, current.questoes)
      return { ...prev, [alunoId]: updated }
    })
  }

  function handleToggleQuestao(alunoId: number, qIndex: number) {
    setDados((prev) => {
      const current = prev[alunoId] || {
        presenca: '',
        questoes: {},
        acertos: 0,
        percentual: 0,
        nota: null,
      }
      if (current.presenca === 'F') return prev

      const tipo = tiposQuestoesArr[qIndex] || 'O'
      const key = `q${qIndex + 1}`
      const val = current.questoes[key]
      let nextVal: number | string | undefined

      if (tipo === 'O') {
        // Cycle: undefined -> A -> B -> C -> D -> E -> undefined
        const alternativas = LETRAS.slice(0, prova?.num_alternativas ?? 5)
        if (val === undefined) {
          nextVal = alternativas[0] // A
        } else if (typeof val === 'string') {
          const idx = alternativas.indexOf(val)
          nextVal = idx < alternativas.length - 1 ? alternativas[idx + 1] : undefined
        } else {
          // Legacy number value (0 or 1) — start fresh cycle
          nextVal = alternativas[0]
        }
      } else {
        // Discursive: cycle through criterion values
        const criterios = CRITERIOS_DISCURSIVA[(prova?.criterio_discursiva ?? 3) as 2 | 3 | 4] || CRITERIOS_DISCURSIVA[3]
        const valores: number[] = criterios.map((c) => c.valor as number)
        if (val === undefined) {
          nextVal = valores[0]
        } else {
          const idx = valores.indexOf(val as number)
          nextVal = idx < valores.length - 1 ? valores[idx + 1] : undefined
        }
      }

      const newQuestoes = { ...current.questoes }
      if (nextVal === undefined) {
        delete newQuestoes[key]
      } else {
        newQuestoes[key] = nextVal
      }

      const updated = recalcularAluno(current.presenca, newQuestoes)
      return { ...prev, [alunoId]: updated }
    })
  }

  function handleSave() {
    if (!prova) return
    if (existingCount > 0) {
      setConfirmSaveOpen(true)
      return
    }
    executeSave()
  }

  async function executeSave() {
    if (!prova) return
    setConfirmSaveOpen(false)
    setSaving(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      toast.error('Usuário não autenticado')
      setSaving(false)
      return
    }

    // Upsert resultados for each student with presenca marked
    const upserts = Object.entries(dados)
      .filter(([, d]) => isPresente(d.presenca) || d.presenca === 'F')
      .map(([alunoIdStr, d]) => ({
        user_id: user.id,
        workspace_id: workspaceId,
        prova_id: Number(provaId),
        aluno_id: Number(alunoIdStr),
        presenca: d.presenca,
        respostas: d.questoes,
        acertos: d.acertos,
        percentual: d.percentual,
        nota: d.nota,
        updated_at: new Date().toISOString(),
      }))

    // Alunos que tinham resultado salvo e tiveram a presença limpa: remover do banco
    const idsToDelete = Object.entries(dados)
      .filter(([alunoIdStr, d]) => d.presenca === '' && existingAlunoIds.has(Number(alunoIdStr)))
      .map(([alunoIdStr]) => Number(alunoIdStr))

    if (upserts.length === 0 && idsToDelete.length === 0) {
      toast.error('Nenhum aluno marcado com presença')
      setSaving(false)
      return
    }

    let error = null
    if (upserts.length > 0) {
      const res = await supabase.from('resultados').upsert(upserts, {
        onConflict: 'prova_id,aluno_id',
      })
      error = res.error
    }
    if (!error && idsToDelete.length > 0) {
      const res = await supabase
        .from('resultados')
        .delete()
        .eq('prova_id', Number(provaId))
        .in('aluno_id', idsToDelete)
      error = res.error
    }

    if (error) {
      toast.error('Erro ao salvar correção')
      console.error(error)
    } else {
      const partes = []
      if (upserts.length > 0) partes.push(`${upserts.length} aluno(s) registrados`)
      if (idsToDelete.length > 0) partes.push(`${idsToDelete.length} removido(s)`)
      toast.success(`Correção salva! ${partes.join(', ')}.`)
      setExistingCount(upserts.length)
      setExistingAlunoIds(new Set(upserts.map(u => u.aluno_id)))
    }

    setSaving(false)
  }

  // Stats
  const presentes = Object.values(dados).filter(
    (d) => isPresente(d.presenca)
  ).length
  const faltas = Object.values(dados).filter((d) => d.presenca === 'F').length
  const corrigidos = presentes + faltas
  const mediaPercent =
    presentes > 0
      ? Math.round(
          Object.values(dados)
            .filter((d) => isPresente(d.presenca))
            .reduce((sum, d) => sum + d.percentual, 0) / presentes
        )
      : 0
  const mediaNota =
    prova?.modo_avaliacao === 'nota' && presentes > 0
      ? Object.values(dados)
          .filter((d) => isPresente(d.presenca))
          .reduce((sum, d) => sum + (d.nota ?? 0), 0) / presentes
      : null

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    )
  }

  if (!prova) {
    return (
      <div className="space-y-4">
        <Link href="/provas" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2")}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <p className="text-gray-500">Prova não encontrada.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Banner segunda chamada / recuperação */}
      {prova.tipo_vinculo === 'recuperacao' && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-800">
          <strong>Recuperação</strong> — mostrando apenas os {alunos.length} aluno(s) selecionado(s) para recuperação.
        </div>
      )}
      {prova.prova_origem_id && prova.tipo_vinculo !== 'recuperacao' && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <strong>2ª Chamada</strong> — mostrando apenas os {alunos.length} aluno(s) ausente(s) na prova original.
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/provas" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2")}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Correção - Prova #{prova.id}
            </h1>
            <p className="text-sm text-gray-500">
              {prova.disciplina?.nome ?? 'Disciplina'} &middot;{' '}
              {prova.turma
                ? `${prova.turma.serie} ${prova.turma.turma}`
                : 'Turma'}{' '}
              &middot; {prova.num_questoes} questões
            </p>
          </div>
        </div>
        <Link href={`/provas/${prova.id}/estatisticas`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}>
          <BarChart3 className="h-4 w-4" />
          Estatísticas
        </Link>
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-4">
              <span className="text-gray-600">
                <span className="font-semibold text-gray-900">
                  {corrigidos}
                </span>{' '}
                de{' '}
                <span className="font-semibold text-gray-900">
                  {alunos.length}
                </span>{' '}
                alunos marcados
              </span>
              <Badge
                variant="outline"
                className="bg-green-50 text-green-700 border-green-200"
              >
                {presentes} presentes
              </Badge>
              <Badge
                variant="outline"
                className="bg-red-50 text-red-700 border-red-200"
              >
                {faltas} faltas
              </Badge>
            </div>
            <span className="font-semibold text-indigo-600">
              Média:{' '}
              {mediaNota !== null && prova.nota_total
                ? `${formatScore(mediaNota)}/${formatScore(prova.nota_total)} (${mediaPercent}%)`
                : `${mediaPercent}%`}
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-300"
              style={{
                width: `${alunos.length > 0 ? (corrigidos / alunos.length) * 100 : 0}%`,
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Legenda */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-gray-600">Objetiva:</span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-4 w-4 rounded border border-green-300 bg-green-100" />
                <span className="text-gray-600">Acertou</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-4 w-4 rounded border border-red-300 bg-red-100" />
                <span className="text-gray-600">Errou</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-4 w-4 rounded border border-amber-300 bg-amber-100" />
                <span className="text-gray-600">Anulada</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-4 w-4 rounded border border-gray-200 bg-gray-50" />
                <span className="text-gray-600">Vazio</span>
              </span>
            </div>
            {prova && (prova.tipo_prova === 'mista' || prova.tipo_prova === 'discursiva') && (
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-600">Discursiva:</span>
                {(CRITERIOS_DISCURSIVA[(prova.criterio_discursiva ?? 3) as 2 | 3 | 4] || CRITERIOS_DISCURSIVA[3]).map((c) => {
                  const cores: Record<string, string> = {
                    green: 'border-green-600 bg-green-500',
                    emerald: 'border-emerald-500 bg-emerald-400',
                    yellow: 'border-yellow-500 bg-yellow-400',
                    red: 'border-red-600 bg-red-500',
                  }
                  return (
                    <span key={c.label} className="flex items-center gap-1.5">
                      <span className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[9px] font-bold text-white ${cores[c.cor] || 'border-gray-400 bg-gray-400'}`}>
                        {c.label}
                      </span>
                      <span className="text-gray-600">{c.nome}</span>
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      <Card>
        <CardContent className="p-2 sm:p-4">
          {alunos.length === 0 ? (
            <p className="py-8 text-center text-gray-500">
              Nenhum aluno ativo nesta turma.
            </p>
          ) : (
            <CorrectionGrid
              gabarito={gabarito}
              numQuestoes={prova.num_questoes}
              numAlternativas={prova.num_alternativas}
              alunos={alunos.map((a) => ({
                id: a.id,
                nome: a.nome,
                numero: a.numero,
              }))}
              dados={dados}
              onTogglePresenca={handleTogglePresenca}
              onToggleQuestao={handleToggleQuestao}
              tiposQuestoes={tiposQuestoesArr}
              criterioDiscursiva={prova.criterio_discursiva}
              modoAvaliacao={prova.modo_avaliacao}
              notaTotal={prova.nota_total}
            />
          )}
        </CardContent>
      </Card>

      {/* Sticky save button */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {corrigidos > 0
              ? `${corrigidos} aluno(s) serão salvos`
              : 'Marque presença para habilitar'}
            {existingCount > 0 && corrigidos > 0 && (
              <span className="ml-1 text-amber-600">(substituirá dados existentes)</span>
            )}
          </p>
          <Button
            onClick={handleSave}
            disabled={saving || corrigidos === 0}
            size="lg"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar Correção'}
          </Button>
        </div>
      </div>

      {/* Dialog de confirmação para substituir correções existentes */}
      <Dialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Substituir correções existentes?</DialogTitle>
            <DialogDescription>
              Esta prova já possui {existingCount} correção(ões) salva(s). Ao continuar, os dados existentes serão substituídos pelos novos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSaveOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={executeSave} className="bg-amber-600 hover:bg-amber-700">
              Substituir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
