'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  ClipboardCheck,
  CreditCard,
  BarChart3,
  CalendarDays,
  BookOpen,
  Users,
  Hash,
  LayoutGrid,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AnswerKeyEditor } from '@/components/answer-key-editor'
import type { Prova } from '@/types/database'

function formatDate(dateStr: string | null) {
  if (!dateStr) return '\u2014'
  return new Date(dateStr).toLocaleDateString('pt-BR')
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
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default function ProvaDetailPage() {
  const params = useParams()
  const provaId = params.id as string
  const supabase = createClient()

  const [prova, setProva] = useState<Prova | null>(null)
  const [gabarito, setGabarito] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchProva() {
      const { data, error } = await supabase
        .from('provas')
        .select(
          '*, disciplina:disciplinas(nome), turma:turmas(serie, turma)'
        )
        .eq('id', provaId)
        .single()

      if (error || !data) {
        toast.error('Prova não encontrada')
        setLoading(false)
        return
      }

      const provaData = data as unknown as Prova
      setProva(provaData)
      setGabarito(
        provaData.gabarito ||
          Array(provaData.num_questoes).fill('').join(',')
      )
      setLoading(false)
    }

    fetchProva()
  }, [provaId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveGabarito() {
    setSaving(true)

    const { error } = await supabase
      .from('provas')
      .update({ gabarito })
      .eq('id', provaId)

    if (error) {
      toast.error('Erro ao salvar gabarito')
      console.error(error)
    } else {
      toast.success('Gabarito salvo com sucesso!')
    }

    setSaving(false)
  }

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
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <Link href="/provas" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2")}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Prova #{prova.id}
          </h1>
          <p className="text-sm text-gray-500">
            Detalhes e gabarito da prova
          </p>
        </div>
      </div>

      {/* Exam info card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Informações da Prova</CardTitle>
            {statusBadge(prova.status)}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Data</p>
                <p className="text-sm font-medium">{formatDate(prova.data)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Disciplina</p>
                <p className="text-sm font-medium">
                  {prova.disciplina?.nome ?? '\u2014'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Turma</p>
                <p className="text-sm font-medium">
                  {prova.turma
                    ? `${prova.turma.serie} ${prova.turma.turma}`
                    : '\u2014'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Questões</p>
                <p className="text-sm font-medium">{prova.num_questoes}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Alternativas</p>
                <p className="text-sm font-medium">{prova.num_alternativas}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gabarito editor */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Gabarito</CardTitle>
            <Button onClick={handleSaveGabarito} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar Gabarito'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <AnswerKeyEditor
            numQuestoes={prova.num_questoes}
            numAlternativas={prova.num_alternativas}
            value={gabarito}
            onChange={setGabarito}
          />
        </CardContent>
      </Card>

      {/* Action buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <Link href={`/provas/${prova.id}/correcao`} className={cn(buttonVariants(), "gap-2")}>
              <ClipboardCheck className="h-4 w-4" />
              Corrigir Prova
            </Link>
            <Link href={`/provas/${prova.id}/cartoes`} className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
              <CreditCard className="h-4 w-4" />
              Gerar Cartões
            </Link>
            <Link href={`/provas/${prova.id}/estatisticas`} className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
              <BarChart3 className="h-4 w-4" />
              Estatísticas
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
