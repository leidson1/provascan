'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FileText,
  Users,
  GraduationCap,
  CheckCircle,
  Plus,
  ClipboardCheck,
  FileBarChart,
  UserPlus,
  HelpCircle,
  ArrowRight,
  Clock,
  Lightbulb,
  Copy,
  RotateCcw,
  Sparkles,
  BookOpen,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace, useIsGestor, useIsDono } from '@/contexts/workspace-context'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Types ──
interface DashboardStats {
  provas: number
  turmas: number
  alunos: number
  correcoes: number
}

interface RecentProva {
  id: number
  data: string | null
  status: 'aberta' | 'corrigida' | 'excluida'
  prova_origem_id: number | null
  turma_id: number | null
  disciplina: { nome: string } | null
  turma: { serie: string; turma: string } | null
  resultados_count: number
  alunos_count: number
  faltas_count: number
}

interface ActivityItem {
  prova_id: number
  disciplina_nome: string
  count: number
  faltas: number
  updated_at: string
}

// ── Helpers ──
function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR')
}

function timeAgo(dateStr: string) {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `há ${diffMin}min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `há ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'ontem'
  return `há ${diffD} dias`
}

// ── Tips ──
const TIPS = [
  {
    icon: Copy,
    text: 'Você pode duplicar uma prova para várias turmas de uma vez!',
    link: '/ajuda',
    color: 'bg-blue-50 text-blue-700',
    iconColor: 'text-blue-500',
  },
  {
    icon: FileBarChart,
    text: 'Gere relatórios em PDF ou Excel na página de Relatórios.',
    link: '/relatorios',
    color: 'bg-emerald-50 text-emerald-700',
    iconColor: 'text-emerald-500',
  },
  {
    icon: UserPlus,
    text: 'Convide corretores na página Equipe para dividir o trabalho!',
    link: '/equipe',
    color: 'bg-violet-50 text-violet-700',
    iconColor: 'text-violet-500',
  },
  {
    icon: RotateCcw,
    text: 'Crie provas de 2ª chamada automaticamente para alunos ausentes.',
    link: '/ajuda',
    color: 'bg-orange-50 text-orange-700',
    iconColor: 'text-orange-500',
  },
  {
    icon: Sparkles,
    text: 'Estatísticas mostram distribuição, notas e ranking de cada prova.',
    link: '/ajuda',
    color: 'bg-pink-50 text-pink-700',
    iconColor: 'text-pink-500',
  },
]

const DISMISSED_TIPS_KEY = 'provascan_dismissed_tips'

// ══════════════════════════════════════
//  DASHBOARD PAGE
// ══════════════════════════════════════
export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const { workspaceId } = useWorkspace()
  const isGestor = useIsGestor()
  const isDono = useIsDono()

  const [stats, setStats] = useState<DashboardStats>({ provas: 0, turmas: 0, alunos: 0, correcoes: 0 })
  const [recentProvas, setRecentProvas] = useState<RecentProva[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissedTips, setDismissedTips] = useState<number[]>([])

  // Load dismissed tips from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_TIPS_KEY)
      if (stored) setDismissedTips(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  function dismissTip(idx: number) {
    const next = [...dismissedTips, idx]
    setDismissedTips(next)
    localStorage.setItem(DISMISSED_TIPS_KEY, JSON.stringify(next))
  }

  const visibleTips = TIPS.filter((_, i) => !dismissedTips.includes(i))

  useEffect(() => {
    async function fetchDashboard() {
      if (!workspaceId) return

      const [provasRes, turmasRes, alunosRes, correcRes, recentRes, resultadosRes, faltasRes] =
        await Promise.all([
          // Counts
          supabase.from('provas').select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId).neq('status', 'excluida'),
          supabase.from('turmas').select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId).eq('ativo', true),
          supabase.from('alunos').select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId).eq('ativo', true),
          supabase.from('resultados').select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId),
          // Recent provas
          supabase.from('provas')
            .select('id, data, status, prova_origem_id, turma_id, disciplina:disciplinas(nome), turma:turmas(serie, turma)')
            .eq('workspace_id', workspaceId).neq('status', 'excluida')
            .order('created_at', { ascending: false }).limit(5),
          // Resultados for progress + activity
          supabase.from('resultados')
            .select('prova_id, presenca, updated_at')
            .eq('workspace_id', workspaceId)
            .in('presenca', ['P', '*', 'F']),
          // Alunos per turma
          supabase.from('alunos').select('turma_id')
            .eq('workspace_id', workspaceId).eq('ativo', true),
        ])

      setStats({
        provas: provasRes.count ?? 0,
        turmas: turmasRes.count ?? 0,
        alunos: alunosRes.count ?? 0,
        correcoes: correcRes.count ?? 0,
      })

      // Process resultados for progress
      const resCounts: Record<number, number> = {}
      const faltaCounts: Record<number, number> = {}
      const activityMap: Record<number, { count: number; faltas: number; updated_at: string }> = {}

      for (const r of resultadosRes.data ?? []) {
        if (r.presenca === 'F') {
          faltaCounts[r.prova_id] = (faltaCounts[r.prova_id] || 0) + 1
        } else {
          resCounts[r.prova_id] = (resCounts[r.prova_id] || 0) + 1
        }
        // Track latest activity per prova
        if (!activityMap[r.prova_id] || r.updated_at > activityMap[r.prova_id].updated_at) {
          activityMap[r.prova_id] = {
            count: (resCounts[r.prova_id] || 0),
            faltas: (faltaCounts[r.prova_id] || 0),
            updated_at: r.updated_at,
          }
        }
      }

      // Alunos per turma
      const alunoCounts: Record<number, number> = {}
      for (const a of faltasRes.data ?? []) {
        alunoCounts[a.turma_id] = (alunoCounts[a.turma_id] || 0) + 1
      }

      // Attach to recent provas
      if (recentRes.data) {
        const provasList = (recentRes.data as unknown as RecentProva[]).map(p => ({
          ...p,
          resultados_count: resCounts[p.id] || 0,
          faltas_count: faltaCounts[p.id] || 0,
          alunos_count: p.prova_origem_id
            ? (faltaCounts[p.prova_origem_id] || 0)
            : (p.turma_id ? (alunoCounts[p.turma_id] || 0) : 0),
        }))
        setRecentProvas(provasList)
      }

      // Build activity feed from activityMap + prova names
      const allProvas = (recentRes.data ?? []) as unknown as RecentProva[]
      const provaNames: Record<number, string> = {}
      for (const p of allProvas) {
        provaNames[p.id] = p.disciplina?.nome ?? `Prova #${p.id}`
      }

      // Get activity for ALL provas (not just recent 5) — use resultados data
      const activityList: ActivityItem[] = Object.entries(activityMap)
        .map(([provaId, data]) => ({
          prova_id: Number(provaId),
          disciplina_nome: provaNames[Number(provaId)] || `Prova #${provaId}`,
          count: resCounts[Number(provaId)] || 0,
          faltas: faltaCounts[Number(provaId)] || 0,
          updated_at: data.updated_at,
        }))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 8)

      setActivity(activityList)
      setLoading(false)
    }

    fetchDashboard()
  }, [workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Quick Actions ──
  const quickActions = [
    ...(isGestor ? [
      { icon: Plus, label: 'Criar Prova', desc: 'Nova prova com gabarito', href: '/provas?nova=1', color: 'bg-indigo-500' },
      { icon: Users, label: 'Gerenciar Turmas', desc: 'Turmas e alunos', href: '/turmas', color: 'bg-emerald-500' },
    ] : []),
    { icon: ClipboardCheck, label: 'Corrigir Provas', desc: 'Acessar correções', href: '/provas', color: 'bg-blue-500' },
    ...(isGestor ? [
      { icon: FileBarChart, label: 'Gerar Relatórios', desc: 'PDF ou Excel', href: '/relatorios', color: 'bg-purple-500' },
    ] : []),
    ...(isDono ? [
      { icon: UserPlus, label: 'Convidar Equipe', desc: 'Adicione corretores', href: '/equipe', color: 'bg-orange-500' },
    ] : []),
    { icon: HelpCircle, label: 'Ajuda', desc: 'Tutorial e FAQ', href: '/ajuda', color: 'bg-gray-500' },
  ]

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-4 px-4 pt-4">
                <div className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-muted" />
                <div className="space-y-2 flex-1">
                  <div className="h-6 w-12 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Stat card links ──
  const statCards = [
    { key: 'provas' as const, label: 'Total Provas', icon: FileText, bg: 'bg-indigo-50', iconColor: 'text-indigo-600', href: '/provas' },
    { key: 'turmas' as const, label: 'Total Turmas', icon: Users, bg: 'bg-emerald-50', iconColor: 'text-emerald-600', href: '/turmas' },
    { key: 'alunos' as const, label: 'Total Alunos', icon: GraduationCap, bg: 'bg-violet-50', iconColor: 'text-violet-600', href: '/turmas' },
    { key: 'correcoes' as const, label: 'Correções', icon: CheckCircle, bg: 'bg-amber-50', iconColor: 'text-amber-600', href: '/provas' },
  ]

  return (
    <div className="space-y-6">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Visão geral do seu ProvaScan</p>
        </div>
        <Button variant="outline" onClick={() => {
          localStorage.removeItem('provascan_tutorial_seen')
          router.push('/ajuda')
        }} className="gap-2">
          <BookOpen className="h-4 w-4" />
          Tutorial
        </Button>
      </div>

      {/* ═══ BANNER DE NOVIDADES ═══ */}
      <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white mt-0.5">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-emerald-900 text-sm">Novidades do ProvaScan</h3>
              <ul className="mt-1 text-xs text-emerald-800 space-y-0.5 list-disc list-inside">
                <li>Selecione várias turmas ao criar uma prova — o sistema cria uma para cada</li>
                <li>2ª chamada automática para alunos ausentes</li>
                <li>Progresso de correção visível na tabela de provas</li>
                <li>Estatísticas completas com distribuição, ranking e notas</li>
                <li>Duplique provas para outras turmas em um clique</li>
              </ul>
              <Link href="/ajuda" className="text-xs font-semibold text-emerald-700 underline mt-2 inline-block hover:text-emerald-900">
                Ver tutorial completo
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ STAT CARDS (clicáveis) ═══ */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <Link key={card.key} href={card.href}>
              <Card className="transition-shadow hover:shadow-md cursor-pointer">
                <CardContent className="flex items-center gap-4 px-4 pt-4">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${card.bg}`}>
                    <Icon className={`h-5 w-5 ${card.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stats[card.key]}</p>
                    <p className="text-xs text-gray-500">{card.label}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* ═══ AÇÕES RÁPIDAS ═══ */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Ações Rápidas</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Link key={action.label} href={action.href}>
                <Card className="transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer h-full">
                  <CardContent className="flex flex-col items-center text-center gap-2 py-4 px-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${action.color} text-white`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{action.label}</p>
                      <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{action.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>

      {/* ═══ GRID: PROVAS RECENTES + ATIVIDADE ═══ */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Provas Recentes (3 cols) */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Provas Recentes</CardTitle>
            <Link href="/provas" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1 text-xs')}>
              Ver todas <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentProvas.length === 0 ? (
              <div className="py-8 text-center">
                <FileText className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="text-sm font-medium text-gray-900">Nenhuma prova ainda</p>
                <p className="mt-1 text-sm text-gray-500">Crie sua primeira prova para começar!</p>
                {isGestor && (
                  <Button onClick={() => router.push('/provas?nova=1')} className="mt-4" size="sm">
                    <Plus className="mr-2 h-4 w-4" /> Nova Prova
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {recentProvas.map((prova) => (
                  <Link
                    key={prova.id}
                    href={`/provas/${prova.id}/correcao`}
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-gray-50"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                      <span className="text-xs font-bold text-indigo-600">#{prova.id}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {prova.disciplina?.nome ?? 'Prova'}
                        </p>
                        {prova.prova_origem_id && (
                          <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-[9px] px-1 py-0 shrink-0">2ª Ch.</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {prova.turma ? `${prova.turma.serie} ${prova.turma.turma}` : '—'} · {formatDate(prova.data)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {prova.alunos_count > 0 && (
                        <span className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                          (prova.resultados_count + prova.faltas_count) === prova.alunos_count
                            ? 'bg-green-100 text-green-700'
                            : prova.resultados_count
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-500'
                        )}>
                          {prova.resultados_count}/{prova.alunos_count}
                        </span>
                      )}
                      <Badge variant={prova.status === 'corrigida' ? 'default' : 'secondary'} className="text-[10px]">
                        {prova.status === 'aberta' ? 'Aberta' : 'Corrigida'}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Atividade Recente (2 cols) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-gray-400" />
              Atividade Recente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <div className="py-8 text-center">
                <Clock className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">Nenhuma correção realizada ainda.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activity.map((item) => (
                  <Link
                    key={item.prova_id}
                    href={`/provas/${item.prova_id}/correcao`}
                    className="flex items-start gap-3 group"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 mt-0.5">
                      <ClipboardCheck className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 group-hover:text-indigo-600 transition-colors truncate">
                        {item.disciplina_nome}
                      </p>
                      <p className="text-xs text-gray-500">
                        {item.count} corrigido(s)
                        {item.faltas > 0 && <span className="text-red-500"> · {item.faltas} falta(s)</span>}
                      </p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0 mt-1">{timeAgo(item.updated_at)}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ DICAS E ORIENTAÇÕES ═══ */}
      {visibleTips.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            Dicas
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleTips.slice(0, 3).map((tip, _idx) => {
              const realIdx = TIPS.indexOf(tip)
              const Icon = tip.icon
              return (
                <div key={realIdx} className={`relative rounded-xl p-4 ${tip.color} transition-all`}>
                  <button
                    onClick={() => dismissTip(realIdx)}
                    className="absolute top-2 right-2 rounded-full p-0.5 opacity-40 hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex items-start gap-3">
                    <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${tip.iconColor}`} />
                    <div>
                      <p className="text-sm font-medium leading-snug">{tip.text}</p>
                      <Link href={tip.link} className="text-xs font-semibold underline mt-1 inline-block opacity-70 hover:opacity-100">
                        Saiba mais
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
