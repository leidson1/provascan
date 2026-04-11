'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ClipboardCheck, Download, FileText, Info, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { gerarCartoesPDF } from '@/lib/pdf/card-generator'
import type { Prova, Aluno } from '@/types/database'
import { useWorkspace } from '@/contexts/workspace-context'

type ProvaWithJoins = Omit<Prova, 'disciplina' | 'turma'> & {
  disciplina?: { nome: string }
  turma?: { serie: string; turma: string }
}

export default function CartoesPage() {
  const params = useParams()
  const provaId = params.id as string
  const supabase = createClient()
  const { workspace, workspaceId } = useWorkspace()

  const [prova, setProva] = useState<ProvaWithJoins | null>(null)
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const { data: provaData, error: provaError } = await supabase
        .from('provas')
        .select('*, disciplina:disciplinas(nome), turma:turmas(serie, turma)')
        .eq('id', provaId)
        .eq('workspace_id', workspaceId)
        .single()

      if (provaError || !provaData) {
        toast.error('Prova não encontrada neste workspace')
        setLoading(false)
        return
      }

      const p = provaData as unknown as ProvaWithJoins
      setProva(p)

      if (p.turma_id) {
        const { data: alunosData } = await supabase
          .from('alunos')
          .select('*')
          .eq('turma_id', p.turma_id)
          .eq('ativo', true)
          .order('numero', { ascending: true })

        let alunosList = alunosData ?? []

        // Se é recuperação, filtrar por alunos selecionados
        if (p.tipo_vinculo === 'recuperacao' && p.alunos_selecionados) {
          const selecionadosIds = new Set(p.alunos_selecionados as number[])
          alunosList = alunosList.filter((a: { id: number }) => selecionadosIds.has(a.id))
        }
        // Se é segunda chamada, filtrar só alunos ausentes na prova original
        else if (p.prova_origem_id) {
          const { data: origemResultados } = await supabase
            .from('resultados')
            .select('aluno_id')
            .eq('prova_id', p.prova_origem_id)
            .eq('presenca', 'F')

          const ausentesIds = new Set((origemResultados ?? []).map((r: { aluno_id: number }) => r.aluno_id))
          alunosList = alunosList.filter((a: { id: number }) => ausentesIds.has(a.id))
        }

        setAlunos(alunosList)
      }

      setLoading(false)
    }

    fetchData()
  }, [provaId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerar() {
    if (!prova) return
    if (alunos.length === 0) {
      toast.error('Nenhum aluno cadastrado nesta turma')
      return
    }

    setGenerating(true)

    try {
      const disciplinaNome = prova.disciplina?.nome || 'Prova'
      const turmaNome = prova.turma
        ? `${prova.turma.serie} ${prova.turma.turma}`
        : ''

      const doc = gerarCartoesPDF({
        prova: {
          id: prova.id,
          numQuestoes: prova.num_questoes,
          numAlternativas: prova.num_alternativas,
          disciplina: disciplinaNome,
          turma: turmaNome,
          serie: prova.turma?.serie || '',
          bloco: prova.bloco,
          data: prova.data,
        },
        alunos: alunos.map((a) => ({
          id: a.id,
          nome: a.nome,
          numero: a.numero,
        })),
        baseUrl: window.location.origin,
        tipoProva: prova.tipo_prova,
        tiposQuestoes: prova.tipos_questoes || undefined,
        criterioDiscursiva: prova.criterio_discursiva,
        pesosQuestoes: prova.pesos_questoes || undefined,
        nomeInstituicao: workspace.nome_instituicao || undefined,
      })

      if (!doc) {
        toast.error('Esta prova não gera cartão-resposta.')
        return
      }

      // Download do PDF
      const blob = doc.output('blob')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Cartoes_${disciplinaNome.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)

      toast.success(
        `${alunos.length} cartões + 3 reservas gerados! Verifique seus downloads.`
      )
    } catch (err) {
      console.error(err)
      toast.error('Erro ao gerar PDF: ' + (err instanceof Error ? err.message : err))
    } finally {
      setGenerating(false)
    }
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

  // Discursiva pura agora gera cartão com bolhas de critério (não bloqueia mais)

  const disciplinaNome = prova.disciplina?.nome || 'Prova'
  const turmaNome = prova.turma ? `${prova.turma.serie} ${prova.turma.turma}` : '\u2014'
  const totalCartoes = alunos.length + 3

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/provas" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2")}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Cartões de Resposta</h1>
          <p className="text-sm text-muted-foreground">
            {disciplinaNome} - {turmaNome}
          </p>
        </div>
      </div>

      {prova.tipo_vinculo === 'recuperacao' && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-800">
          <strong>Recuperação</strong> — gerando cartões para os {alunos.length} aluno(s) selecionado(s).
        </div>
      )}
      {prova.prova_origem_id && prova.tipo_vinculo !== 'recuperacao' && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <strong>2ª Chamada</strong> — gerando cartões apenas para os {alunos.length} aluno(s) ausente(s) na prova original.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Gerar PDF
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Disciplina</span>
              <span className="font-medium">{disciplinaNome}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Turma</span>
              <span className="font-medium">{turmaNome}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Bloco</span>
              <span className="font-medium">{prova.bloco}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Questões</span>
              <span className="font-medium">
                {prova.num_questoes} ({prova.num_alternativas} alternativas)
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Alunos na turma</span>
              <span className="font-medium">{alunos.length}</span>
            </div>
          </div>

          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-center dark:border-indigo-800 dark:bg-indigo-950">
            <p className="text-lg font-semibold text-indigo-700 dark:text-indigo-300">
              {totalCartoes} cartões serão gerados
            </p>
            <p className="text-sm text-indigo-600 dark:text-indigo-400">
              {alunos.length} alunos + 3 reservas
            </p>
          </div>

          {!prova.gabarito && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Esta prova ainda não tem gabarito cadastrado. Os cartões serão gerados,
              mas a correção automática só funcionará após o gabarito ser salvo.
            </div>
          )}

          {prova.tipo_prova === 'mista' && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Esta prova é mista. As questões discursivas terão bolhas de critério (azul) no cartão.
              </span>
            </div>
          )}

          {alunos.length === 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              Nenhum aluno ativo cadastrado nesta turma. Cadastre alunos antes de gerar cartões.
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={handleGenerar}
            disabled={generating || alunos.length === 0}
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Gerando PDF...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Gerar e Baixar PDF
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
