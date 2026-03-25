'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FileText,
  Users,
  GraduationCap,
  CheckCircle,
  Plus,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/contexts/workspace-context'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

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
  disciplina: { nome: string } | null
  turma: { serie: string; turma: string } | null
}

const statCards = [
  {
    key: 'provas' as const,
    label: 'Total Provas',
    icon: FileText,
    bg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
  },
  {
    key: 'turmas' as const,
    label: 'Total Turmas',
    icon: Users,
    bg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
  },
  {
    key: 'alunos' as const,
    label: 'Total Alunos',
    icon: GraduationCap,
    bg: 'bg-violet-50',
    iconColor: 'text-violet-600',
  },
  {
    key: 'correcoes' as const,
    label: 'Correções',
    icon: CheckCircle,
    bg: 'bg-amber-50',
    iconColor: 'text-amber-600',
  },
]

function statusBadge(status: string) {
  switch (status) {
    case 'aberta':
      return <Badge variant="secondary">Aberta</Badge>
    case 'corrigida':
      return <Badge variant="default">Corrigida</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('pt-BR')
}

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const { workspaceId, role } = useWorkspace()
  const [stats, setStats] = useState<DashboardStats>({
    provas: 0,
    turmas: 0,
    alunos: 0,
    correcoes: 0,
  })
  const [recentProvas, setRecentProvas] = useState<RecentProva[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDashboard() {
      if (!workspaceId) return

      const [provasRes, turmasRes, alunosRes, correcRes, recentRes] =
        await Promise.all([
          supabase
            .from('provas')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .neq('status', 'excluida'),
          supabase
            .from('turmas')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .eq('ativo', true),
          supabase
            .from('alunos')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .eq('ativo', true),
          supabase
            .from('resultados')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId),
          supabase
            .from('provas')
            .select('id, data, status, disciplina:disciplinas(nome), turma:turmas(serie, turma)')
            .eq('workspace_id', workspaceId)
            .neq('status', 'excluida')
            .order('created_at', { ascending: false })
            .limit(5),
        ])

      setStats({
        provas: provasRes.count ?? 0,
        turmas: turmasRes.count ?? 0,
        alunos: alunosRes.count ?? 0,
        correcoes: correcRes.count ?? 0,
      })

      if (recentRes.data) {
        setRecentProvas(recentRes.data as unknown as RecentProva[])
      }

      setLoading(false)
    }

    fetchDashboard()
  }, [workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Skeleton header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="h-10 w-32 animate-pulse rounded-md bg-muted" />
        </div>

        {/* Skeleton stat cards */}
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

        {/* Skeleton table */}
        <Card>
          <CardHeader>
            <div className="h-5 w-36 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">
            Visão geral do seu ProvaScan
          </p>
        </div>
        {role === 'dono' && (
          <Button onClick={() => router.push('/provas?nova=1')}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Prova
          </Button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.key}>
              <CardContent className="flex items-center gap-4 px-4 pt-4">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${card.bg}`}
                >
                  <Icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats[card.key]}
                  </p>
                  <p className="text-xs text-gray-500">{card.label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Recent exams */}
      <Card>
        <CardHeader>
          <CardTitle>Provas Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentProvas.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-900">
                Nenhuma prova ainda
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Crie sua primeira prova para começar!
              </p>
              {role === 'dono' && (
                <Button onClick={() => router.push('/provas?nova=1')} className="mt-4" size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Prova
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
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentProvas.map((prova) => (
                  <TableRow key={prova.id}>
                    <TableCell>{formatDate(prova.data)}</TableCell>
                    <TableCell>
                      {prova.disciplina?.nome ?? '—'}
                    </TableCell>
                    <TableCell>
                      {prova.turma
                        ? `${prova.turma.serie} ${prova.turma.turma}`
                        : '—'}
                    </TableCell>
                    <TableCell>{statusBadge(prova.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
