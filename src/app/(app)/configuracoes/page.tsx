'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/contexts/workspace-context'
import { toast } from 'sonner'
import { Settings, Upload, X, ImageIcon } from 'lucide-react'
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

const ACCEPTED_FORMATS = ['image/png', 'image/jpeg', 'image/svg+xml']
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB

export default function ConfiguracoesPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const { workspaceId, role, workspace, refreshWorkspace } = useWorkspace()

  const [nomeInstituicao, setNomeInstituicao] = useState(workspace.nome_instituicao || '')
  const [logoUrl, setLogoUrl] = useState(workspace.logo_url || '')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (role === 'corretor') {
      router.replace('/dashboard')
    }
  }, [role, router])

  useEffect(() => {
    setNomeInstituicao(workspace.nome_instituicao || '')
    setLogoUrl(workspace.logo_url || '')
  }, [workspace])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ACCEPTED_FORMATS.includes(file.type)) {
      toast.error('Formato não suportado. Use PNG, JPG ou SVG.')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error('Arquivo muito grande. O tamanho máximo é 2MB.')
      return
    }

    setLogoFile(file)
    const preview = URL.createObjectURL(file)
    setLogoPreview(preview)
  }

  function removeLogo() {
    setLogoFile(null)
    if (logoPreview) {
      URL.revokeObjectURL(logoPreview)
      setLogoPreview(null)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function uploadLogo(): Promise<string | null> {
    if (!logoFile) return logoUrl || null

    setUploading(true)
    try {
      const ext = logoFile.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `${workspaceId}/logo.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(path, logoFile, { upsert: true })

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      return data.publicUrl
    } catch {
      toast.error('Erro ao fazer upload do logo.')
      return null
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      let newLogoUrl = logoUrl

      if (logoFile) {
        const uploaded = await uploadLogo()
        if (uploaded === null && logoFile) {
          setSaving(false)
          return
        }
        newLogoUrl = uploaded || ''
      }

      const { error } = await supabase
        .from('workspaces')
        .update({
          nome_instituicao: nomeInstituicao.trim() || null,
          logo_url: newLogoUrl || null,
        })
        .eq('id', workspaceId)

      if (error) throw error

      toast.success('Configurações salvas com sucesso.')
      setLogoUrl(newLogoUrl)
      setLogoFile(null)
      if (logoPreview) {
        URL.revokeObjectURL(logoPreview)
        setLogoPreview(null)
      }
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
            Informações que aparecerão nos cartões de prova e relatórios
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Nome da Instituição */}
          <div className="space-y-2">
            <Label htmlFor="nome_instituicao">Nome da Instituição</Label>
            <Input
              id="nome_instituicao"
              value={nomeInstituicao}
              onChange={(e) => setNomeInstituicao(e.target.value)}
              placeholder="Ex: Colégio São José"
            />
          </div>

          {/* Logo */}
          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="space-y-4">
              {/* Current logo preview */}
              {(logoPreview || logoUrl) && (
                <div className="relative inline-block">
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                    <img
                      src={logoPreview || logoUrl}
                      alt="Logo da instituição"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  {logoPreview && (
                    <button
                      type="button"
                      onClick={removeLogo}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Upload area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors hover:border-primary/50 hover:bg-muted/50"
              >
                {logoPreview || logoUrl ? (
                  <ImageIcon className="size-8 text-muted-foreground" />
                ) : (
                  <Upload className="size-8 text-muted-foreground" />
                )}
                <p className="mt-2 text-sm font-medium text-muted-foreground">
                  {logoPreview || logoUrl ? 'Trocar logo' : 'Enviar logo'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PNG, JPG ou SVG. Máximo 2MB.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.svg"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || uploading}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
