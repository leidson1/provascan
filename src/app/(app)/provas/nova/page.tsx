'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Disciplina, Turma } from '@/types/database'

export default function NovaProvaPage() {
  const supabase = createClient()
  const router = useRouter()

  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([])
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form fields
  const [data, setData] = useState('')
  const [disciplinaId, setDisciplinaId] = useState('')
  const [turmaId, setTurmaId] = useState('')
  const [numQuestoes, setNumQuestoes] = useState(10)
  const [numAlternativas, setNumAlternativas] = useState(5)
  const [bloco, setBloco] = useState('B1')
  const [modoAvaliacao, setModoAvaliacao] = useState<'acertos' | 'nota'>('acertos')
  const [notaTotal, setNotaTotal] = useState<number>(10)

  useEffect(() => {
    async function fetchOptions() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const [discRes, turmaRes] = await Promise.all([
        supabase
          .from('disciplinas')
          .select('*')
          .eq('user_id', user.id)
          .eq('ativo', true)
          .order('nome'),
        supabase
          .from('turmas')
          .select('*')
          .eq('user_id', user.id)
          .eq('ativo', true)
          .order('serie'),
      ])

      if (discRes.data) setDisciplinas(discRes.data)
      if (turmaRes.data) setTurmas(turmaRes.data)
      setLoading(false)
    }

    fetchOptions()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      toast.error('Usuário não autenticado')
      setSaving(false)
      return
    }

    const { data: prova, error } = await supabase
      .from('provas')
      .insert({
        user_id: user.id,
        data: data || null,
        disciplina_id: disciplinaId ? Number(disciplinaId) : null,
        turma_id: turmaId ? Number(turmaId) : null,
        num_questoes: numQuestoes,
        num_alternativas: numAlternativas,
        bloco,
        modo_avaliacao: modoAvaliacao,
        nota_total: modoAvaliacao === 'nota' ? notaTotal : null,
        status: 'aberta',
      })
      .select('id')
      .single()

    if (error) {
      toast.error('Erro ao criar prova')
      console.error(error)
      setSaving(false)
      return
    }

    toast.success('Prova criada com sucesso!')
    router.push(`/provas/${prova.id}`)
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <Link href="/provas" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2")}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Nova Prova</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados da Prova</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Data */}
            <div className="space-y-2">
              <Label htmlFor="data">Data</Label>
              <Input
                id="data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>

            {/* Disciplina */}
            <div className="space-y-2">
              <Label htmlFor="disciplina">Disciplina</Label>
              <Select value={disciplinaId} onValueChange={(v) => v && setDisciplinaId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a disciplina" />
                </SelectTrigger>
                <SelectContent>
                  {disciplinas.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Turma */}
            <div className="space-y-2">
              <Label htmlFor="turma">Turma</Label>
              <Select value={turmaId} onValueChange={(v) => v && setTurmaId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a turma" />
                </SelectTrigger>
                <SelectContent>
                  {turmas.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.serie} - {t.turma}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Número de Questões */}
            <div className="space-y-2">
              <Label htmlFor="numQuestoes">Número de Questões</Label>
              <Input
                id="numQuestoes"
                type="number"
                min={1}
                max={50}
                value={numQuestoes}
                onChange={(e) => setNumQuestoes(Number(e.target.value))}
              />
            </div>

            {/* Alternativas por Questão */}
            <div className="space-y-2">
              <Label>Alternativas por Questão</Label>
              <Select
                value={String(numAlternativas)}
                onValueChange={(v) => setNumAlternativas(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">4 (A-D)</SelectItem>
                  <SelectItem value="5">5 (A-E)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Bloco */}
            <div className="space-y-2">
              <Label htmlFor="bloco">Bloco</Label>
              <Input
                id="bloco"
                value={bloco}
                onChange={(e) => setBloco(e.target.value)}
              />
            </div>

            {/* Modo de Avaliação */}
            <div className="space-y-2">
              <Label>Modo de Avaliação</Label>
              <Select
                value={modoAvaliacao}
                onValueChange={(v) => setModoAvaliacao(v as 'acertos' | 'nota')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="acertos">Por Acertos</SelectItem>
                  <SelectItem value="nota">Por Nota</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {modoAvaliacao === 'acertos'
                  ? 'Contagem simples de respostas corretas'
                  : 'Nota calculada com base em pesos por questão'}
              </p>
            </div>

            {/* Nota Total (conditional) */}
            {modoAvaliacao === 'nota' && (
              <div className="space-y-2">
                <Label htmlFor="notaTotal">Nota Total</Label>
                <Input
                  id="notaTotal"
                  type="number"
                  min={1}
                  step="0.1"
                  value={notaTotal}
                  onChange={(e) => setNotaTotal(Number(e.target.value))}
                />
              </div>
            )}

            {/* Submit */}
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Salvando...' : 'Criar Prova'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
