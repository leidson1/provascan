'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import {
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Users,
  ClipboardList,
  User,
  Loader2,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace, useIsGestor } from '@/contexts/workspace-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  gerarRelatorio,
  type ReportData,
  type ReportFilters,
  type ReportType,
  type ReportFormat,
} from '@/lib/reports/generate'
import type { Prova, Turma, Disciplina, Aluno, Resultado } from '@/types/database'

type ResultadoComAluno = Resultado & {
  aluno?: { nome: string; numero: number | null }
}

type ProvaComJoins = Prova & {
  disciplina?: { nome: string }
  turma?: { serie: string; turma: string }
}

const REPORT_TYPES: { value: ReportType; label: string; desc: string; icon: typeof Users }[] = [
  {
    value: 'turma',
    label: 'Relatório por Turma',
    desc: 'Visão geral dos alunos com médias e faltas em todas as provas da turma',
    icon: Users,
  },
  {
    value: 'prova',
    label: 'Relatório por Prova',
    desc: 'Resultado detalhado de uma prova específica com ranking e análise por questão',
    icon: ClipboardList,
  },
  {
    value: 'aluno',
    label: 'Boletim Individual',
    desc: 'Histórico individual de cada aluno com todas as provas realizadas',
    icon: User,
  },
]

export default function RelatoriosPage() {
  const supabase = createClient()
  const { workspaceId, workspace } = useWorkspace()
  const isGestor = useIsGestor()

  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([])
  const [provas, setProvas] = useState<ProvaComJoins[]>([])

  // Filters
  const [tipo, setTipo] = useState<ReportType>('turma')
  const [turmaId, setTurmaId] = useState('')
  const [disciplinaId, setDisciplinaId] = useState('')
  const [provaId, setProvaId] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  // Load base data
  useEffect(() => {
    if (!workspaceId) return

    async function load() {
      setLoading(true)

      const [turmasRes, disciplinasRes, provasRes] = await Promise.all([
        supabase.from('turmas').select('*').eq('workspace_id', workspaceId).eq('ativo', true).order('serie'),
        supabase.from('disciplinas').select('*').eq('workspace_id', workspaceId).eq('ativo', true).order('nome'),
        supabase
          .from('provas')
          .select('*, disciplina:disciplinas(nome), turma:turmas(serie, turma)')
          .eq('workspace_id', workspaceId)
          .neq('status', 'excluida')
          .order('data', { ascending: false }),
      ])

      setTurmas((turmasRes.data ?? []) as Turma[])
      setDisciplinas((disciplinasRes.data ?? []) as Disciplina[])
      setProvas((provasRes.data ?? []) as ProvaComJoins[])
      setLoading(false)
    }

    load()
  }, [workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered provas for the dropdown
  const provasFiltradas = provas.filter(p => {
    if (turmaId && String(p.turma_id) !== turmaId) return false
    if (disciplinaId && String(p.disciplina_id) !== disciplinaId) return false
    return true
  })

  // Reset dependent filters
  useEffect(() => {
    setProvaId('')
  }, [turmaId, disciplinaId])

  const canGenerate = () => {
    if (tipo === 'turma' && !turmaId) return false
    if (tipo === 'prova' && !provaId) return false
    if (tipo === 'aluno' && !turmaId) return false
    return true
  }

  const handleGenerate = useCallback(async (format: ReportFormat) => {
    if (!canGenerate()) {
      toast.error('Preencha os filtros obrigatórios')
      return
    }

    setGenerating(true)

    try {
      // Fetch all needed data
      const [alunosRes, resultadosRes] = await Promise.all([
        supabase.from('alunos').select('*').eq('workspace_id', workspaceId).eq('ativo', true),
        supabase.from('resultados').select('*, aluno:alunos(nome, numero)').eq('workspace_id', workspaceId),
      ])

      const reportData: ReportData = {
        provas,
        resultados: (resultadosRes.data ?? []) as ResultadoComAluno[],
        turmas,
        disciplinas,
        alunos: (alunosRes.data ?? []) as Aluno[],
        nomeInstituicao: workspace.nome_instituicao || workspace.nome || 'ProvaScan',
      }

      const filters: ReportFilters = {
        tipo,
        turmaId,
        disciplinaId,
        provaId,
        dataInicio,
        dataFim,
      }

      gerarRelatorio(reportData, filters, format)
      toast.success(`Relatório ${format.toUpperCase()} gerado com sucesso!`)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao gerar relatório')
    } finally {
      setGenerating(false)
    }
  }, [tipo, turmaId, disciplinaId, provaId, dataInicio, dataFim, provas, turmas, disciplinas, workspaceId, workspace]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    )
  }

  const selectedType = REPORT_TYPES.find(r => r.value === tipo)!

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
            <FileBarChart className="h-5 w-5 text-indigo-600" />
          </div>
          Relatórios
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Gere relatórios em PDF ou Excel com os dados das provas
        </p>
      </div>

      {/* Report type selection */}
      <div className="grid gap-3 sm:grid-cols-3">
        {REPORT_TYPES.map(rt => {
          const Icon = rt.icon
          const active = tipo === rt.value
          return (
            <button
              key={rt.value}
              onClick={() => { setTipo(rt.value); setProvaId('') }}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                active
                  ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  active ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className={`font-semibold text-sm ${active ? 'text-indigo-700' : 'text-gray-700'}`}>
                  {rt.label}
                </span>
              </div>
              <p className={`text-xs leading-relaxed ${active ? 'text-indigo-600' : 'text-gray-500'}`}>
                {rt.desc}
              </p>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4 text-indigo-500" />
            Filtros do Relatório
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Turma - required for turma and aluno reports */}
            {(tipo === 'turma' || tipo === 'aluno' || tipo === 'prova') && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Turma {(tipo === 'turma' || tipo === 'aluno') && <span className="text-red-500">*</span>}
                </Label>
                <select
                  value={turmaId}
                  onChange={(e) => setTurmaId(e.target.value)}
                  className="flex h-9 w-full items-center rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                >
                  <option value="">{tipo === 'prova' ? 'Todas as turmas' : 'Selecione a turma'}</option>
                  {turmas.map(t => (
                    <option key={t.id} value={String(t.id)}>
                      {t.serie} {t.turma} {t.turno ? `(${t.turno})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Disciplina - optional filter */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Disciplina</Label>
              <select
                value={disciplinaId}
                onChange={(e) => setDisciplinaId(e.target.value)}
                className="flex h-9 w-full items-center rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
              >
                <option value="">Todas as disciplinas</option>
                {disciplinas.map(d => (
                  <option key={d.id} value={String(d.id)}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Prova - required for prova report */}
            {tipo === 'prova' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Prova <span className="text-red-500">*</span>
                </Label>
                <select
                  value={provaId}
                  onChange={(e) => setProvaId(e.target.value)}
                  className="flex h-9 w-full items-center rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                >
                  <option value="">Selecione a prova</option>
                  {provasFiltradas.map(p => (
                    <option key={p.id} value={String(p.id)}>
                      #{p.id} — {p.bloco || p.disciplina?.nome || 'Prova'}{' '}
                      {p.turma ? `(${p.turma.serie} ${p.turma.turma})` : ''}{' '}
                      {p.data ? `— ${new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Date range - for turma and aluno reports */}
          {(tipo === 'turma' || tipo === 'aluno') && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Data início</Label>
                <Input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Data fim</Label>
                <Input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Info badge */}
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
            <Info className="h-4 w-4 text-gray-400 shrink-0" />
            <p className="text-xs text-gray-500">
              {tipo === 'turma' && 'O relatório mostrará a média de cada aluno em todas as provas da turma selecionada.'}
              {tipo === 'prova' && 'O relatório mostrará o resultado detalhado da prova com ranking dos alunos e análise por questão.'}
              {tipo === 'aluno' && 'O relatório gerará um boletim individual com o histórico de provas de cada aluno.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Preview info */}
      {canGenerate() && (
        <Card className="border-indigo-200 bg-indigo-50/50">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-indigo-700">Pronto para gerar:</span>
              <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
                {selectedType.label}
              </Badge>
              {turmaId && turmaId !== '__all__' && (
                <Badge variant="outline" className="border-indigo-200 text-indigo-600">
                  {turmas.find(t => String(t.id) === turmaId)?.serie}{' '}
                  {turmas.find(t => String(t.id) === turmaId)?.turma}
                </Badge>
              )}
              {disciplinaId && disciplinaId !== '__all__' && (
                <Badge variant="outline" className="border-indigo-200 text-indigo-600">
                  {disciplinas.find(d => String(d.id) === disciplinaId)?.nome}
                </Badge>
              )}
              {provaId && (
                <Badge variant="outline" className="border-indigo-200 text-indigo-600">
                  Prova #{provaId}
                </Badge>
              )}
              {dataInicio && (
                <Badge variant="outline" className="border-indigo-200 text-indigo-600">
                  De: {new Date(dataInicio + 'T00:00:00').toLocaleDateString('pt-BR')}
                </Badge>
              )}
              {dataFim && (
                <Badge variant="outline" className="border-indigo-200 text-indigo-600">
                  Até: {new Date(dataFim + 'T00:00:00').toLocaleDateString('pt-BR')}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Download buttons */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          onClick={() => handleGenerate('pdf')}
          disabled={!canGenerate() || generating}
          className="flex-1 gap-2 bg-red-600 hover:bg-red-700 text-white h-12 text-base"
        >
          {generating ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <FileText className="h-5 w-5" />
          )}
          Baixar PDF
        </Button>
        <Button
          onClick={() => handleGenerate('excel')}
          disabled={!canGenerate() || generating}
          className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white h-12 text-base"
        >
          {generating ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-5 w-5" />
          )}
          Baixar Excel
        </Button>
      </div>
    </div>
  )
}
