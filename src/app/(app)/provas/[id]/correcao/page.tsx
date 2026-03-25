'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CorrectionGrid } from '@/components/correction-grid'
import type { Prova, Aluno, Resultado } from '@/types/database'

type DadosAluno = {
  presenca: string
  questoes: Record<string, number>
  acertos: number
  percentual: number
  nota: number | null
}

export default function CorrecaoPage() {
  const params = useParams()
  const provaId = params.id as string
  const supabase = createClient()

  const [prova, setProva] = useState<Prova | null>(null)
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [dados, setDados] = useState<Record<number, DadosAluno>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const gabarito = prova?.gabarito
    ? prova.gabarito.split(',')
    : Array(prova?.num_questoes ?? 0).fill('')

  // Calculate acertos for a student
  const calcularAcertos = useCallback(
    (questoes: Record<string, number>, gabaritoArr: string[]) => {
      let acertos = 0
      for (let i = 0; i < gabaritoArr.length; i++) {
        const key = `q${i + 1}`
        if (gabaritoArr[i] === 'X') {
          // Anulled question = automatic correct
          acertos++
        } else if (questoes[key] === 1) {
          acertos++
        }
      }
      return acertos
    },
    []
  )

  const calcularNota = useCallback(
    (
      acertos: number,
      numQuestoes: number,
      prova: Prova,
      questoes: Record<string, number>
    ) => {
      if (prova.modo_avaliacao !== 'nota' || !prova.nota_total) return null

      if (prova.pesos_questoes) {
        const pesos = prova.pesos_questoes.split(',').map(Number)
        let nota = 0
        const gabArr = prova.gabarito
          ? prova.gabarito.split(',')
          : []
        for (let i = 0; i < numQuestoes; i++) {
          const key = `q${i + 1}`
          const peso = pesos[i] ?? 1
          if (gabArr[i] === 'X' || questoes[key] === 1) {
            nota += peso
          }
        }
        return Math.round(nota * 100) / 100
      }

      return Math.round((acertos / numQuestoes) * prova.nota_total * 100) / 100
    },
    []
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
        .single()

      if (provaErr || !provaData) {
        toast.error('Prova não encontrada')
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

      const alunosList = (alunosData ?? []) as Aluno[]
      setAlunos(alunosList)

      // Fetch existing resultados
      const { data: resultados } = await supabase
        .from('resultados')
        .select('*')
        .eq('prova_id', provaId)

      const resultadosList = (resultados ?? []) as Resultado[]
      const gabArr = p.gabarito
        ? p.gabarito.split(',')
        : Array(p.num_questoes).fill('')

      // Initialize dados
      const dadosInit: Record<number, DadosAluno> = {}
      for (const aluno of alunosList) {
        const resultado = resultadosList.find((r) => r.aluno_id === aluno.id)
        if (resultado) {
          const questoes = resultado.respostas ?? {}
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
    questoes: Record<string, number>
  ): DadosAluno {
    if (!prova) return { presenca, questoes, acertos: 0, percentual: 0, nota: null }

    const gabArr = prova.gabarito
      ? prova.gabarito.split(',')
      : Array(prova.num_questoes).fill('')

    if (presenca === 'F') {
      return { presenca, questoes, acertos: 0, percentual: 0, nota: 0 }
    }

    if (presenca !== '*') {
      return { presenca, questoes, acertos: 0, percentual: 0, nota: null }
    }

    const acertos = calcularAcertos(questoes, gabArr)
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
      // Cycle: '' -> '*' -> 'F' -> ''
      let next: string
      if (current.presenca === '') next = '*'
      else if (current.presenca === '*') next = 'F'
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

      const key = `q${qIndex + 1}`
      const val = current.questoes[key]
      let nextVal: number | undefined
      // Cycle: undefined -> 1 -> 0 -> undefined
      if (val === undefined) nextVal = 1
      else if (val === 1) nextVal = 0
      else nextVal = undefined

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

  async function handleSave() {
    if (!prova) return
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
      .filter(([, d]) => d.presenca === '*' || d.presenca === 'F')
      .map(([alunoIdStr, d]) => ({
        user_id: user.id,
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
    }

    setSaving(false)
  }

  // Stats
  const presentes = Object.values(dados).filter(
    (d) => d.presenca === '*'
  ).length
  const faltas = Object.values(dados).filter((d) => d.presenca === 'F').length
  const corrigidos = presentes + faltas
  const mediaPercent =
    presentes > 0
      ? Math.round(
          Object.values(dados)
            .filter((d) => d.presenca === '*')
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
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/provas/${prova.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2")}>
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
    </div>
  )
}
