'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ClipboardCheck,
  Users,
  UserX,
  Target,
  Percent,
  Award,
  Trophy,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Prova, Resultado } from '@/types/database'

type ResultadoComAluno = Omit<Resultado, 'aluno'> & {
  aluno?: { nome: string; numero: number | null }
}

export default function EstatisticasPage() {
  const params = useParams()
  const provaId = params.id as string
  const supabase = createClient()

  const [prova, setProva] = useState<Prova | null>(null)
  const [resultados, setResultados] = useState<ResultadoComAluno[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
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

      const { data: resData } = await supabase
        .from('resultados')
        .select('*, aluno:alunos(nome, numero)')
        .eq('prova_id', provaId)

      setResultados((resData ?? []) as ResultadoComAluno[])
      setLoading(false)
    }

    fetchData()
  }, [provaId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const gabarito = prova.gabarito
    ? prova.gabarito.split(',')
    : Array(prova.num_questoes).fill('')

  // Filter presentes
  const presentes = resultados.filter((r) => r.presenca === '*')
  const faltas = resultados.filter((r) => r.presenca === 'F')

  // Averages
  const mediaAcertos =
    presentes.length > 0
      ? presentes.reduce((sum, r) => sum + (r.acertos ?? 0), 0) /
        presentes.length
      : 0
  const mediaPercent =
    presentes.length > 0
      ? presentes.reduce((sum, r) => sum + (r.percentual ?? 0), 0) /
        presentes.length
      : 0
  const mediaNota =
    prova.modo_avaliacao === 'nota' && presentes.length > 0
      ? presentes.reduce((sum, r) => sum + (r.nota ?? 0), 0) /
        presentes.length
      : null

  // Per-question stats
  const questaoStats = Array.from({ length: prova.num_questoes }, (_, i) => {
    const key = `q${i + 1}`
    const isAnulada = gabarito[i] === 'X'
    if (isAnulada) return { index: i, percentAcerto: 100, anulada: true }

    const total = presentes.length
    const acertos = presentes.filter(
      (r) => r.respostas && r.respostas[key] === 1
    ).length
    return {
      index: i,
      percentAcerto: total > 0 ? Math.round((acertos / total) * 100) : 0,
      anulada: false,
    }
  })

  // Ranking
  const ranking = [...presentes].sort(
    (a, b) => (b.acertos ?? 0) - (a.acertos ?? 0)
  )

  // Insights
  const questoesDificeis = questaoStats.filter(
    (q) => !q.anulada && q.percentAcerto < 40
  )
  const questoesFaceis = questaoStats.filter(
    (q) => !q.anulada && q.percentAcerto >= 80
  )

  function barColor(percent: number, anulada: boolean) {
    if (anulada) return 'bg-amber-400'
    if (percent >= 80) return 'bg-green-500'
    if (percent >= 40) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  function medalIcon(position: number) {
    if (position === 0)
      return <Trophy className="h-4 w-4 text-yellow-500" />
    if (position === 1)
      return <Award className="h-4 w-4 text-gray-400" />
    if (position === 2)
      return <Award className="h-4 w-4 text-amber-700" />
    return null
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/provas" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2")}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Estatísticas - Prova #{prova.id}
            </h1>
            <p className="text-sm text-gray-500">
              {prova.disciplina?.nome ?? 'Disciplina'} &middot;{' '}
              {prova.turma
                ? `${prova.turma.serie} ${prova.turma.turma}`
                : 'Turma'}
            </p>
          </div>
        </div>
        <Link href={`/provas/${prova.id}/correcao`} className={cn(buttonVariants(), "gap-2")}>
          <ClipboardCheck className="h-4 w-4" />
          Abrir Correção
        </Link>
      </div>

      {/* No results guard */}
      {resultados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">
              Nenhum resultado registrado para esta prova.
            </p>
            <Link href={`/provas/${prova.id}/correcao`} className={cn(buttonVariants(), "mt-4 gap-2")}>
              <ClipboardCheck className="h-4 w-4" />
              Iniciar Correção
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100">
                  <Users className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Presentes</p>
                  <p className="text-xl font-bold text-gray-900">
                    {presentes.length}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100">
                  <UserX className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Faltas</p>
                  <p className="text-xl font-bold text-gray-900">
                    {faltas.length}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                  <Target className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Média Acertos</p>
                  <p className="text-xl font-bold text-gray-900">
                    {mediaAcertos.toFixed(1)}{' '}
                    <span className="text-sm font-normal text-gray-500">
                      de {prova.num_questoes}
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                  <Percent className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Média %</p>
                  <p className="text-xl font-bold text-gray-900">
                    {mediaPercent.toFixed(1)}%
                  </p>
                </div>
              </CardContent>
            </Card>
            {mediaNota !== null && (
              <Card>
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100">
                    <Award className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Média Nota</p>
                    <p className="text-xl font-bold text-gray-900">
                      {mediaNota.toFixed(1)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Bar chart: Acertos por Questão */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Acertos por Questão
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {questaoStats.map((q) => (
                  <div key={q.index} className="flex items-center gap-3">
                    <span className="w-8 shrink-0 text-right text-xs font-semibold text-gray-600">
                      Q{q.index + 1}
                    </span>
                    <div className="relative h-6 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor(q.percentAcerto, q.anulada)}`}
                        style={{
                          width: `${Math.max(q.percentAcerto, 2)}%`,
                        }}
                      />
                      <span className="absolute inset-y-0 right-2 flex items-center text-xs font-semibold text-gray-700">
                        {q.anulada ? 'Anulada' : `${q.percentAcerto}%`}
                      </span>
                    </div>
                    {q.anulada && (
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] px-1.5">
                        X
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Insights */}
          {(questoesDificeis.length > 0 || questoesFaceis.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {questoesDificeis.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base text-red-600">
                      <AlertTriangle className="h-4 w-4" />
                      Questões Difíceis ({'<'} 40%)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {questoesDificeis.map((q) => (
                        <Badge
                          key={q.index}
                          className="bg-red-100 text-red-700 hover:bg-red-100"
                        >
                          Q{q.index + 1} - {q.percentAcerto}%
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {questoesFaceis.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      Questões Fáceis ({'>='} 80%)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {questoesFaceis.map((q) => (
                        <Badge
                          key={q.index}
                          className="bg-green-100 text-green-700 hover:bg-green-100"
                        >
                          Q{q.index + 1} - {q.percentAcerto}%
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Ranking */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Ranking de Alunos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ranking.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Nenhum aluno presente registrado.
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {ranking.map((r, idx) => (
                    <div
                      key={r.id}
                      className={`flex items-center gap-3 py-2 ${idx < 3 ? 'bg-amber-50/50 -mx-2 px-2 rounded' : ''}`}
                    >
                      <span className="w-6 shrink-0 text-center text-sm font-bold text-gray-400">
                        {idx + 1}
                      </span>
                      <span className="w-5 shrink-0">
                        {medalIcon(idx)}
                      </span>
                      <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                        {r.aluno?.nome ?? `Aluno #${r.aluno_id}`}
                      </span>
                      <span className="text-sm font-semibold text-indigo-600">
                        {r.acertos ?? 0}/{prova.num_questoes}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          (r.percentual ?? 0) >= 70
                            ? 'border-green-200 text-green-700'
                            : (r.percentual ?? 0) >= 40
                              ? 'border-yellow-200 text-yellow-700'
                              : 'border-red-200 text-red-700'
                        }`}
                      >
                        {(r.percentual ?? 0).toFixed(0)}%
                      </Badge>
                      {prova.modo_avaliacao === 'nota' && r.nota != null && (
                        <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 text-xs">
                          {r.nota.toFixed(1)}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
