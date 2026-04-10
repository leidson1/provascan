'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/contexts/workspace-context'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { CorrectionGrid } from '@/components/correction-grid'
import type { Prova, Aluno, Resultado } from '@/types/database'
import { CRITERIOS_DISCURSIVA } from '@/types/database'

const LETRAS = ['A', 'B', 'C', 'D', 'E']

function isPresente(p: string) {
  return p === 'P' || p === '*'
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
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)

  const gabarito = prova?.gabarito
    ? prova.gabarito.split(',')
    : Array(prova?.num_questoes ?? 0).fill('')

  const tiposQuestoesArr = prova?.tipos_questoes
    ? prova.tipos_questoes.split(',')
    : []

  // Resolve a question value to a score (0 or 1 for objective, 0-1 for discursive)
  const resolveScore = useCallback(
    (val: number | string | undefined, gabLetra: string, tipo: string): number => {
      if (val === undefined) return 0
      // Discursive: always a number (0, 0.5, 0.75, 1.0)
      if (tipo === 'D' && typeof val === 'number') return val
      // Objective: new format — answer letter as string
      if (typeof val === 'string') return val === gabLetra ? 1 : 0
      // Legacy format: 0/1
      return val
    },
    []
  )

  // Calculate acertos for a student
  const calcularAcertos = useCallback(
    (questoes: Record<string, number | string>, gabaritoArr: string[], modoAnulacao?: string, tiposArr?: string[]) => {
      let acertos = 0
      const numAnuladas = gabaritoArr.filter(g => g === 'X').length
      const numValidas = gabaritoArr.length - numAnuladas

      if (modoAnulacao === 'redistribuir') {
        for (let i = 0; i < gabaritoArr.length; i++) {
          const key = `q${i + 1}`
          if (gabaritoArr[i] === 'X') continue
          const tipo = tiposArr?.[i] || 'O'
          acertos += resolveScore(questoes[key], gabaritoArr[i], tipo)
        }
        if (numValidas > 0 && numValidas < gabaritoArr.length) {
          acertos = (acertos / numValidas) * gabaritoArr.length
        }
      } else {
        for (let i = 0; i < gabaritoArr.length; i++) {
          const key = `q${i + 1}`
          if (gabaritoArr[i] === 'X') {
            acertos++
          } else {
            const tipo = tiposArr?.[i] || 'O'
            acertos += resolveScore(questoes[key], gabaritoArr[i], tipo)
          }
        }
      }
      return Math.round(acertos * 100) / 100
    },
    [resolveScore]
  )

  const calcularNota = useCallback(
    (
      acertos: number,
      numQuestoes: number,
      prova: Prova,
      questoes: Record<string, number | string>
    ) => {
      if (prova.modo_avaliacao !== 'nota' || !prova.nota_total) return null

      const gabArr = prova.gabarito ? prova.gabarito.split(',') : []
      const tiposArr = prova.tipos_questoes ? prova.tipos_questoes.split(',') : []
      const modoAnulacao = prova.modo_anulacao || 'contar_certa'

      if (prova.pesos_questoes) {
        const pesos = prova.pesos_questoes.split(',').map(Number)
        let nota = 0
        const pesoTotal = pesos.reduce((s, p) => s + p, 0)

        if (modoAnulacao === 'redistribuir') {
          let notaValidas = 0
          let pesoValidas = 0
          for (let i = 0; i < numQuestoes; i++) {
            const key = `q${i + 1}`
            const peso = pesos[i] ?? 1
            if (gabArr[i] === 'X') continue
            pesoValidas += peso
            const tipo = tiposArr[i] || 'O'
            notaValidas += resolveScore(questoes[key], gabArr[i], tipo) * peso
          }
          nota = pesoValidas > 0 ? (notaValidas / pesoValidas) * pesoTotal : 0
        } else {
          for (let i = 0; i < numQuestoes; i++) {
            const key = `q${i + 1}`
            const peso = pesos[i] ?? 1
            if (gabArr[i] === 'X') {
              nota += peso
            } else {
              const tipo = tiposArr[i] || 'O'
              nota += resolveScore(questoes[key], gabArr[i], tipo) * peso
            }
          }
        }
        return Math.round((nota / pesoTotal) * prova.nota_total * 100) / 100
      }

      // Sem pesos: usa acertos (já escalado se redistribuir)
      return Math.round((acertos / numQuestoes) * prova.nota_total * 100) / 100
    },
    [resolveScore]
  )

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

      // Se é segunda chamada, filtrar só alunos ausentes na prova original
      if (p.prova_origem_id) {
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
      const gabArr = p.gabarito
        ? p.gabarito.split(',')
        : Array(p.num_questoes).fill('')

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
          const acertos = resultado.acertos ?? 0
          const percentual = resultado.percentual ?? 0
          dadosInit[aluno.id] = {
            presenca: resultado.presenca ?? '',
            questoes,
            acertos,
            percentual,
            nota: resultado.nota,
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
  }, [provaId]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const percentual =
      prova.num_questoes > 0
        ? Math.round((acertos / prova.num_questoes) * 10000) / 100
        : 0
    const nota = calcularNota(acertos, prova.num_questoes, prova, questoes)

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

    if (upserts.length === 0) {
      toast.error('Nenhum aluno marcado com presença')
      setSaving(false)
      return
    }

    const { error } = await supabase.from('resultados').upsert(upserts, {
      onConflict: 'prova_id,aluno_id',
    })

    if (error) {
      toast.error('Erro ao salvar correção')
      console.error(error)
    } else {
      toast.success(`Correção salva! ${upserts.length} aluno(s) registrados.`)
      setExistingCount(upserts.length)
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
      {/* Banner segunda chamada */}
      {prova.prova_origem_id && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <strong>Segunda chamada</strong> — mostrando apenas os {alunos.length} aluno(s) ausente(s) na prova original.
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
              Média: {mediaPercent}%
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
