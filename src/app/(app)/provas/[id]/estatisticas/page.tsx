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
  TrendingUp,
  TrendingDown,
  BarChart3,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Prova, Resultado } from '@/types/database'
import { useWorkspace } from '@/contexts/workspace-context'

type ResultadoComAluno = Omit<Resultado, 'aluno'> & {
  aluno?: { nome: string; numero: number | null }
}

export default function EstatisticasPage() {
  const params = useParams()
  const provaId = params.id as string
  const supabase = createClient()
  const { workspaceId } = useWorkspace()

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
        .eq('workspace_id', workspaceId)
        .single()

      if (provaErr || !provaData) {
        toast.error('Prova não encontrada neste workspace')
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
  const presentes = resultados.filter((r) => r.presenca === 'P' || r.presenca === '*')
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

  // Additional nota stats
  const notasPresentes = presentes.map(r => r.nota ?? 0)
  const notaMaxima = notasPresentes.length > 0 ? Math.max(...notasPresentes) : 0
  const notaMinima = notasPresentes.length > 0 ? Math.min(...notasPresentes) : 0
  const medianaNota = (() => {
    if (notasPresentes.length === 0) return 0
    const sorted = [...notasPresentes].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  })()

  // Distribution ranges
  const distribuicao = (() => {
    const faixas = [
      { label: '0-20%', min: 0, max: 20, count: 0, color: 'bg-red-500' },
      { label: '20-40%', min: 20, max: 40, count: 0, color: 'bg-orange-500' },
      { label: '40-60%', min: 40, max: 60, count: 0, color: 'bg-yellow-500' },
      { label: '60-80%', min: 60, max: 80, count: 0, color: 'bg-lime-500' },
      { label: '80-100%', min: 80, max: 101, count: 0, color: 'bg-green-500' },
    ]
    for (const r of presentes) {
      const pct = r.percentual ?? 0
      const f = faixas.find(f => pct >= f.min && pct < f.max)
      if (f) f.count++
    }
    return faixas
  })()

  // Per-question stats
  const questaoStats = Array.from({ length: prova.num_questoes }, (_, i) => {
    const key = `q${i + 1}`
    const isAnulada = gabarito[i] === 'X'
    if (isAnulada) return { index: i, percentAcerto: 100, anulada: true }

    const total = presentes.length
    const acertos = presentes.filter(
      (r) => {
        if (!r.respostas) return false
        // Support both "q1" and "1" key formats
        const val = r.respostas[key] ?? r.respostas[String(i + 1)]
        if (val === undefined) return false
        // New format: letter string — compare with gabarito
        if (typeof val === 'string') return val === gabarito[i]
        // Legacy format: 1 = correct
        return val === 1
      }
    ).length
    return {
      index: i,
      percentAcerto: total > 0 ? Math.round((acertos / total) * 100) : 0,
      anulada: false,
    }
  })

  // Ranking — sort by nota when modo=nota, otherwise by acertos
  const ranking = [...presentes].sort((a, b) =>
    prova.modo_avaliacao === 'nota'
      ? (b.nota ?? 0) - (a.nota ?? 0)
      : (b.acertos ?? 0) - (a.acertos ?? 0)
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
                      {prova.nota_total && (
                        <span className="text-sm font-normal text-gray-500"> de {prova.nota_total}</span>
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Extra nota stats */}
          {prova.modo_avaliacao === 'nota' && presentes.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Nota Máxima</p>
                    <p className="text-xl font-bold text-gray-900">{notaMaxima.toFixed(1)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100">
                    <TrendingDown className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Nota Mínima</p>
                    <p className="text-xl font-bold text-gray-900">{notaMinima.toFixed(1)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                    <BarChart3 className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Mediana</p>
                    <p className="text-xl font-bold text-gray-900">{medianaNota.toFixed(1)}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Distribuição de Desempenho */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribuição de Desempenho</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-32">
                {distribuicao.map((f) => {
                  const maxCount = Math.max(...distribuicao.map(d => d.count), 1)
                  const heightPct = (f.count / maxCount) * 100
                  return (
                    <div key={f.label} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-semibold text-gray-700">{f.count}</span>
                      <div className="w-full relative" style={{ height: '80px' }}>
                        <div
                          className={`absolute bottom-0 w-full rounded-t ${f.color} transition-all duration-500`}
                          style={{ height: `${Math.max(heightPct, 4)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 text-center leading-tight">{f.label}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Acertos por Questão — grid compacto */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acertos por Questão</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                {questaoStats.map((q) => (
                  <div
                    key={q.index}
                    className={cn(
                      'flex flex-col items-center justify-center rounded-lg p-2 text-center transition-all',
                      q.anulada
                        ? 'bg-amber-100 text-amber-800'
                        : q.percentAcerto >= 80
                          ? 'bg-green-100 text-green-800'
                          : q.percentAcerto >= 40
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                    )}
                  >
                    <span className="text-[10px] font-medium opacity-70">Q{q.index + 1}</span>
                    <span className="text-sm font-bold">
                      {q.anulada ? 'X' : `${q.percentAcerto}%`}
                    </span>
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
                      {prova.modo_avaliacao === 'nota' && r.nota != null ? (
                        <span className="text-sm font-semibold text-purple-600">
                          {r.nota.toFixed(1)}{prova.nota_total ? <span className="text-gray-400 font-normal">/{prova.nota_total}</span> : ''}
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-indigo-600">
                          {r.acertos ?? 0}/{prova.num_questoes}
                        </span>
                      )}
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
