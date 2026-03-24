'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus,
  FileText,
  MoreVertical,
  ClipboardCheck,
  BookOpen,
  BarChart3,
  CreditCard,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ProvaRow {
  id: number
  data: string | null
  num_questoes: number
  status: 'aberta' | 'corrigida' | 'excluida'
  created_at: string
  disciplina: { nome: string } | null
  turma: { serie: string; turma: string } | null
}

function statusBadge(status: string) {
  switch (status) {
    case 'aberta':
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
          Aberta
        </Badge>
      )
    case 'corrigida':
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
          Corrigida
        </Badge>
      )
    case 'excluida':
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
          Excluida
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '\u2014'
  return new Date(dateStr).toLocaleDateString('pt-BR')
}

export default function ProvasPage() {
  const supabase = createClient()
  const router = useRouter()
  const [provas, setProvas] = useState<ProvaRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProvas()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchProvas() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('provas')
      .select(
        '*, disciplina:disciplinas(nome), turma:turmas(serie, turma)'
      )
      .eq('user_id', user.id)
      .neq('status', 'excluida')
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Erro ao carregar provas')
      console.error(error)
    }

    if (data) {
      setProvas(data as unknown as ProvaRow[])
    }

    setLoading(false)
  }

  async function handleDelete(provaId: number) {
    const { error } = await supabase
      .from('provas')
      .update({ status: 'excluida' })
      .eq('id', provaId)

    if (error) {
      toast.error('Erro ao excluir prova')
      return
    }

    toast.success('Prova excluida com sucesso')
    setProvas((prev) => prev.filter((p) => p.id !== provaId))
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Provas{' '}
            <span className="text-lg font-normal text-gray-500">
              ({provas.length})
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Gerencie suas provas e gabaritos
          </p>
        </div>
        <Link href="/provas/nova" className={cn(buttonVariants(), "gap-2")}>
          <Plus className="h-4 w-4" />
          Nova Prova
        </Link>
      </div>

      {/* Provas table */}
      <Card>
        <CardContent className="p-0">
          {provas.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-900">
                Nenhuma prova encontrada
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Crie sua primeira prova para comecar!
              </p>
              <Link href="/provas/nova" className={cn(buttonVariants({ size: "sm" }), "mt-4 gap-2")}>
                <Plus className="h-4 w-4" />
                Nova Prova
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Disciplina</TableHead>
                  <TableHead>Turma</TableHead>
                  <TableHead className="text-center">Questoes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {provas.map((prova) => (
                  <TableRow key={prova.id}>
                    <TableCell>{formatDate(prova.data)}</TableCell>
                    <TableCell>
                      {prova.disciplina?.nome ?? '\u2014'}
                    </TableCell>
                    <TableCell>
                      {prova.turma
                        ? `${prova.turma.serie} ${prova.turma.turma}`
                        : '\u2014'}
                    </TableCell>
                    <TableCell className="text-center">
                      {prova.num_questoes}
                    </TableCell>
                    <TableCell>{statusBadge(prova.status)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 w-8 p-0")}>
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(`/provas/${prova.id}/correcao`)
                            }
                          >
                            <ClipboardCheck className="mr-2 h-4 w-4" />
                            Corrigir
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(`/provas/${prova.id}`)
                            }
                          >
                            <BookOpen className="mr-2 h-4 w-4" />
                            Gabarito
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(`/provas/${prova.id}/estatisticas`)
                            }
                          >
                            <BarChart3 className="mr-2 h-4 w-4" />
                            Estatisticas
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(`/provas/${prova.id}/cartoes`)
                            }
                          >
                            <CreditCard className="mr-2 h-4 w-4" />
                            Gerar Cartoes
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => handleDelete(prova.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
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
    </div>
  )
}
