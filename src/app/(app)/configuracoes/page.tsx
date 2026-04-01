'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/contexts/workspace-context'
import { toast } from 'sonner'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function ConfiguracoesPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const { workspaceId, role, workspace, refreshWorkspace } = useWorkspace()

  const [nomeInstituicao, setNomeInstituicao] = useState(workspace.nome_instituicao || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (role === 'corretor') {
      router.replace('/dashboard')
    }
  }, [role, router])

  useEffect(() => {
    setNomeInstituicao(workspace.nome_instituicao || '')
  }, [workspace])

  async function handleSave() {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('workspaces')
        .update({
          nome_instituicao: nomeInstituicao.trim() || null,
        })
        .eq('id', workspaceId)

      if (error) throw error

      toast.success('Configurações salvas com sucesso.')
      await refreshWorkspace()
    } catch {
      toast.error('Erro ao salvar configurações.')
    } finally {
      setSaving(false)
    }
  }

  if (role === 'corretor') return null

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <Settings className="size-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie as configurações do seu workspace
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados da Instituição</CardTitle>
          <CardDescription>
            O nome aparecerá nos cartões de resposta e na capa do PDF
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="nome_instituicao">Nome da Instituição</Label>
            <Input
              id="nome_instituicao"
              value={nomeInstituicao}
              onChange={(e) => setNomeInstituicao(e.target.value)}
              placeholder="Ex: Colégio São José"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
