'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { LiveScanner } from '@/components/camera/live-scanner'
import type { Prova, Aluno, Resultado } from '@/types/database'
import { CRITERIOS_DISCURSIVA } from '@/types/database'
import type { OMRResult as EngineOMRResult, OMREngine } from '@/lib/omr/engine'
import {
  analyzeCaptureQuality,
  CAPTURE_MAX_LONG_SIDE,
  CAPTURE_MIN_SHORT_SIDE,
  type CaptureQualityReport,
  type ResizeOptions,
} from '@/lib/omr/capture-quality'

// ── Types ──────────────────────────────────────────────────────
interface SessionEntry {
  alunoId: number
  respostas: string[]
  acertos: number
  percentual: number
}

type Screen = 'auth' | 'setup' | 'camera' | 'result' | 'summary'
type ProvaWithRelations = Prova & {
  disciplina?: { nome: string }
  turma?: { serie: string; turma: string }
}
type ExistingResultRef = { id: number }
type CaptureNoticeTone = 'info' | 'warning' | 'error'
type CaptureNotice = {
  tone: CaptureNoticeTone
  title: string
  message: string
}
type DeviceTier = 'low' | 'balanced' | 'high'

// ── Helpers ────────────────────────────────────────────────────
const ALTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
// O scanner ao vivo continua pronto no projeto, mas fica desligado
// até estabilizarmos completamente a captura por foto nativa.
const ENABLE_LIVE_SCANNER = false
// Diagnóstico e telemetria seguem disponíveis para desenvolvimento/admin,
// mas ficam ocultos para os usuários até criarmos uma área própria de testes.
const ENABLE_OMR_DIAGNOSTICS = false

function detectDeviceTier(): DeviceTier {
  if (typeof navigator === 'undefined') return 'balanced'

  const hardwareConcurrency = navigator.hardwareConcurrency || 4
  const navWithMemory = navigator as Navigator & { deviceMemory?: number }
  const deviceMemory = typeof navWithMemory.deviceMemory === 'number'
    ? navWithMemory.deviceMemory
    : undefined

  if (hardwareConcurrency <= 4 || (deviceMemory != null && deviceMemory <= 4)) {
    return 'low'
  }
  if (hardwareConcurrency >= 8 && (deviceMemory == null || deviceMemory >= 6)) {
    return 'high'
  }
  return 'balanced'
}

function getResizeOptionsForDevice(deviceTier: DeviceTier): ResizeOptions {
  if (deviceTier === 'low') {
    return {
      maxLongSide: 2000,
      minShortSide: 1100,
    }
  }

  return {
    maxLongSide: CAPTURE_MAX_LONG_SIDE,
    minShortSide: CAPTURE_MIN_SHORT_SIDE,
  }
}

function formatMs(ms: number | undefined): string {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return '-'
  return `${Math.round(ms)} ms`
}

function formatNumber(value: number | undefined, digits = 0): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  return value.toFixed(digits)
}

function parseGabarito(raw: string | null): string[] {
  if (!raw) return []
  return raw.split(',').map((s) => s.trim().toUpperCase())
}

function computeScore(
  respostas: string[],
  gabarito: string[],
  tiposQuestoes?: string | null,
  criterioDiscursiva?: number
): { acertos: number; percentual: number } {
  const criterioMap: Record<number, Record<string, number>> = {
    2: { C: 1, E: 0 },
    3: { C: 1, P: 0.5, E: 0 },
    4: { E: 1, B: 0.75, P: 0.5, I: 0 },
  }
  const tipos = tiposQuestoes ? tiposQuestoes.split(',') : []
  const criterio = criterioDiscursiva || 3

  let acertos = 0
  let totalPossivel = 0
  for (let i = 0; i < gabarito.length; i++) {
    const gab = gabarito[i]
    if (!gab || gab === 'X' || gab === '*') continue // anulada
    totalPossivel++
    const isDisc = tipos[i]?.trim() === 'D'
    if (isDisc) {
      // Discursiva: pontuar pelo critério marcado
      const valorMap = criterioMap[criterio] || criterioMap[3]
      const valor = valorMap[respostas[i]?.toUpperCase()] ?? 0
      acertos += valor
    } else {
      // Objetiva: comparar com gabarito
      if (respostas[i] && respostas[i].toUpperCase() === gab) acertos++
    }
  }
  return {
    acertos,
    percentual: totalPossivel > 0 ? Math.round((acertos / totalPossivel) * 100) : 0,
  }
}

async function resizeImage(file: File, options: ResizeOptions): Promise<HTMLCanvasElement> {
  // Ler orientação EXIF manualmente para rotacionar se necessário
  const orientation = await getExifOrientation(file)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const { width, height } = img

      // Determinar se precisa trocar largura/altura (rotações 90°/270°)
      const needsSwap = orientation >= 5 && orientation <= 8

      // Redimensionar
      const srcW = needsSwap ? height : width
      const srcH = needsSwap ? width : height
      const longSide = Math.max(srcW, srcH)
      const shortSide = Math.min(srcW, srcH)

      let scale = 1
      if (shortSide > 0 && shortSide < options.minShortSide) {
        scale = options.minShortSide / shortSide
      }
      if (longSide > 0 && longSide * scale > options.maxLongSide) {
        scale = options.maxLongSide / longSide
      }

      const dstW = Math.max(1, Math.round(srcW * scale))
      const dstH = Math.max(1, Math.round(srcH * scale))

      const canvas = document.createElement('canvas')
      canvas.width = dstW
      canvas.height = dstH
      const ctx = canvas.getContext('2d')!

      // Aplicar transformação baseada na orientação EXIF
      // 1=normal, 2=flip-h, 3=180°, 4=flip-v, 5=transpose, 6=90°CW, 7=transverse, 8=90°CCW
      ctx.save()
      switch (orientation) {
        case 2: ctx.translate(dstW, 0); ctx.scale(-1, 1); break
        case 3: ctx.translate(dstW, dstH); ctx.rotate(Math.PI); break
        case 4: ctx.translate(0, dstH); ctx.scale(1, -1); break
        case 5: ctx.translate(dstW, 0); ctx.scale(-1, 1); ctx.translate(dstW, 0); ctx.rotate(Math.PI / 2); break
        case 6: ctx.translate(dstW, 0); ctx.rotate(Math.PI / 2); break
        case 7: ctx.translate(0, dstH); ctx.scale(-1, 1); ctx.translate(0, -dstH); ctx.translate(dstH, 0); ctx.rotate(Math.PI / 2); break
        case 8: ctx.translate(0, dstH); ctx.rotate(-Math.PI / 2); break
        default: break // orientation 1 ou desconhecido = sem rotação
      }

      // Desenhar com dimensões da imagem original (a transformação cuida do resto)
      if (needsSwap) {
        ctx.drawImage(img, 0, 0, dstH, dstW)
      } else {
        ctx.drawImage(img, 0, 0, dstW, dstH)
      }
      ctx.restore()

      URL.revokeObjectURL(img.src)
      resolve(canvas)
    }
    img.onerror = () => reject(new Error('Erro ao carregar imagem'))
    img.src = URL.createObjectURL(file)
  })
}

// Ler orientação EXIF de um arquivo JPEG (1-8, default 1)
async function getExifOrientation(file: File): Promise<number> {
  try {
    const buffer = await file.slice(0, 65536).arrayBuffer()
    const view = new DataView(buffer)

    // Verificar se é JPEG (SOI marker)
    if (view.getUint16(0) !== 0xFFD8) return 1

    let offset = 2
    while (offset < view.byteLength - 2) {
      const marker = view.getUint16(offset)
      offset += 2

      if (marker === 0xFFE1) {
        // APP1 (EXIF)
        view.getUint16(offset)
        offset += 2

        // Verificar "Exif\0\0"
        if (view.getUint32(offset) !== 0x45786966) return 1
        offset += 6

        const tiffStart = offset
        const bigEndian = view.getUint16(tiffStart) === 0x4D4D

        const ifdOffset = view.getUint32(tiffStart + 4, !bigEndian)
        const numEntries = view.getUint16(tiffStart + ifdOffset, !bigEndian)

        for (let i = 0; i < numEntries; i++) {
          const entryOffset = tiffStart + ifdOffset + 2 + i * 12
          if (entryOffset + 12 > view.byteLength) break
          const tag = view.getUint16(entryOffset, !bigEndian)
          if (tag === 0x0112) {
            // Tag 0x0112 = Orientation
            return view.getUint16(entryOffset + 8, !bigEndian)
          }
        }

        return 1
      } else if ((marker & 0xFF00) === 0xFF00) {
        // Pular segmento
        offset += view.getUint16(offset)
      } else {
        break
      }
    }
  } catch {
    // Falha ao ler EXIF, assumir orientação normal
  }
  return 1
}

function getOMRWarnings(respostas?: EngineOMRResult['respostas']): string[] {
  if (!respostas) return []

  return respostas.flatMap((resposta) => {
    if (resposta.status === 'ambigua') return [`Q${resposta.questao}: dupla marcação`]
    if (resposta.status === 'vazia') return [`Q${resposta.questao}: sem marcação`]
    return []
  })
}

function hasUsableOMRRead(respostas?: EngineOMRResult['respostas']): boolean {
  return !!respostas?.some((resposta) => resposta.status === 'ok' || resposta.status === 'ambigua')
}

function getCaptureNoticeClasses(tone: CaptureNoticeTone): string {
  if (tone === 'error') return 'border border-red-800/60 bg-red-950/40 text-red-100'
  if (tone === 'warning') return 'border border-amber-700/50 bg-amber-950/40 text-amber-100'
  return 'border border-sky-800/50 bg-sky-950/40 text-sky-100'
}

// ── Wrapper with Suspense ────────────────────────────────────────
export default function CameraPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400">Carregando...</p>
        </div>
      </div>
    }>
      <CameraPage />
    </Suspense>
  )
}

// ── Main Component ─────────────────────────────────────────────
function CameraPage() {
  const searchParams = useSearchParams()
  const paramProvaId = searchParams.get('p')
  const supabase = useMemo(() => createClient(), [])
  const deviceTier = useMemo(() => detectDeviceTier(), [])
  const captureResizeOptions = useMemo(
    () => getResizeOptionsForDevice(deviceTier),
    [deviceTier]
  )

  // Auth state
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [authChecked, setAuthChecked] = useState(false)

  // Screen state
  const [screen, setScreen] = useState<Screen>('auth')

  // Auth form
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  // Setup state
  const [provas, setProvas] = useState<ProvaWithRelations[]>([])
  const [selectedProvaId, setSelectedProvaId] = useState<number | null>(null)
  const [provasLoading, setProvasLoading] = useState(false)

  // Session state
  const [prova, setProva] = useState<ProvaWithRelations | null>(null)
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [gabarito, setGabarito] = useState<string[]>([])
  const [existingResults, setExistingResults] = useState<Map<number, ExistingResultRef>>(new Map())
  const [sessao, setSessao] = useState<SessionEntry[]>([])

  // Camera state
  const [processing, setProcessing] = useState(false)
  const [processingMsg, setProcessingMsg] = useState('')
  const [captureError, setCaptureError] = useState('')
  const [captureNotice, setCaptureNotice] = useState<CaptureNotice | null>(null)
  const [captureWarnings, setCaptureWarnings] = useState<string[]>([])
  const [captureDebug, setCaptureDebug] = useState<EngineOMRResult['debug'] | null>(null)
  const [captureTelemetry, setCaptureTelemetry] = useState<EngineOMRResult['telemetry'] | null>(null)
  const [captureQuality, setCaptureQuality] = useState<CaptureQualityReport | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Result state
  const [currentRespostas, setCurrentRespostas] = useState<string[]>([])
  const [currentAlunoId, setCurrentAlunoId] = useState<number | null>(null)
  const [editingQuestion, setEditingQuestion] = useState<number | null>(null)
  // OMR engine
  const [omrReady, setOmrReady] = useState(false)
  const [omrLoading, setOmrLoading] = useState(true)
  const omrEngineRef = useRef<OMREngine | null>(null)

  // ── Check auth on mount ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: { user: { id: string; email?: string } } | null } }) => {
      if (session?.user) {
        setUserId(session.user.id)
        setUserEmail(session.user.email || '')
        setScreen('setup')
      }
      setAuthChecked(true)
    })
  }, [supabase])

  // ── Load OMR engine ──
  useEffect(() => {
    let cancelled = false
    async function loadOMR() {
      try {
        setOmrLoading(true)
        const mod = await import('@/lib/omr/engine')
        if (cancelled) return
        const EngineClass = mod.OMREngine
        if (EngineClass) {
          const instance = new EngineClass()
          await instance.load()
          omrEngineRef.current = instance
        }
        setOmrReady(true)
      } catch (err) {
        console.warn('OMR engine not available, manual mode only:', err)
        setOmrReady(false)
      } finally {
        if (!cancelled) setOmrLoading(false)
      }
    }
    loadOMR()
    return () => { cancelled = true }
  }, [])

  // ── Auto-load exam if ?p=ID ──
  useEffect(() => {
    if (screen === 'setup' && paramProvaId && userId) {
      loadExamById(parseInt(paramProvaId, 10))
    }
  }, [screen, paramProvaId, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load provas list when on setup ──
  useEffect(() => {
    if (screen === 'setup' && userId && !paramProvaId) {
      loadProvas()
    }
  }, [screen, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auth ──
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setAuthError('Digite e-mail e senha')
      return
    }
    setAuthLoading(true)
    setAuthError('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword.trim(),
    })

    setAuthLoading(false)
    if (error) {
      setAuthError(error.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos'
        : error.message)
      return
    }
    if (data.user) {
      setUserId(data.user.id)
      setUserEmail(data.user.email || '')
      setScreen('setup')
      toast.success('Login realizado com sucesso')
    }
  }

  // ── Load provas ──
  async function loadProvas() {
    setProvasLoading(true)
    const { data, error } = await supabase
      .from('provas')
      .select('*, disciplina:disciplinas(*), turma:turmas(*)')
      .eq('user_id', userId!)
      .not('gabarito', 'is', null)
      .in('status', ['aberta', 'corrigida'])
      .order('created_at', { ascending: false })

    setProvasLoading(false)
    if (error) {
      toast.error('Erro ao carregar provas')
      return
    }
    setProvas(data || [])
  }

  // ── Load single exam by ID ──
  async function loadExamById(provaId: number) {
    setProcessingMsg('Carregando prova...')
    setProvasLoading(true)

    const { data: provaData, error: provaError } = await supabase
      .from('provas')
      .select('*, disciplina:disciplinas(*), turma:turmas(*)')
      .eq('id', provaId)
      .single()

    if (provaError || !provaData) {
      toast.error('Prova não encontrada')
      setProvasLoading(false)
      return
    }

    await startSession(provaData)
    setProvasLoading(false)
  }

  // ── Start correction session ──
  async function startSession(provaData: ProvaWithRelations) {
    setProva(provaData)
    setGabarito(parseGabarito(provaData.gabarito))

    // Load students for this turma
    if (provaData.turma_id) {
      const { data: alunosData } = await supabase
        .from('alunos')
        .select('*')
        .eq('turma_id', provaData.turma_id)
        .eq('ativo', true)
        .order('nome')

      setAlunos(alunosData || [])
    }

    // Load existing results
    const { data: resultados } = await supabase
      .from('resultados')
      .select('id, aluno_id')
      .eq('prova_id', provaData.id)

    const resultsMap = new Map<number, ExistingResultRef>()
    if (resultados) {
      for (const r of resultados as Pick<Resultado, 'id' | 'aluno_id'>[]) {
        resultsMap.set(r.aluno_id, { id: r.id })
      }
    }
    setExistingResults(resultsMap)
    setSessao([])
    resetCaptureFeedback()
    setCurrentRespostas([])
    setCurrentAlunoId(null)
    setEditingQuestion(null)
    setScreen('camera')
    toast.success('Sessão de correção iniciada')
  }

  // ── Handle exam selection ──
  function handleStartSession() {
    if (!selectedProvaId) {
      toast.error('Selecione uma prova')
      return
    }
    const selected = provas.find((p) => p.id === selectedProvaId)
    if (selected) startSession(selected)
  }

  // ── File capture ──
  function resetCaptureFeedback() {
    setCaptureError('')
    setCaptureNotice(null)
    setCaptureWarnings([])
    setCaptureDebug(null)
    setCaptureTelemetry(null)
    setCaptureQuality(null)
  }

  function showCaptureFailure(
    message: string,
    debug?: EngineOMRResult['debug'] | null,
    warnings: string[] = [],
    telemetry?: EngineOMRResult['telemetry'] | null,
    quality?: CaptureQualityReport | null
  ) {
    setCaptureError(message)
    setCaptureNotice(null)
    setCaptureWarnings(warnings)
    setCaptureDebug(debug ?? null)
    setCaptureTelemetry(telemetry ?? null)
    setCaptureQuality(quality ?? null)
  }

  function openResultReview(
    respostas: string[],
    alunoId: number | null,
    options?: {
      notice?: CaptureNotice | null
      warnings?: string[]
      debug?: EngineOMRResult['debug'] | null
      telemetry?: EngineOMRResult['telemetry'] | null
      quality?: CaptureQualityReport | null
    }
  ) {
    resetCaptureFeedback()
    setCaptureNotice(options?.notice ?? null)
    setCaptureWarnings(options?.warnings ?? [])
    setCaptureDebug(options?.debug ?? null)
    setCaptureTelemetry(options?.telemetry ?? null)
    setCaptureQuality(options?.quality ?? null)
    setCurrentRespostas(respostas)
    setCurrentAlunoId(alunoId)
    setEditingQuestion(null)
    setScreen('result')
  }

  function renderDiagnosticDetails(options?: { title?: string; showImage?: boolean }) {
    if (!captureDebug && !captureTelemetry && !captureQuality) return null
    const title = options?.title ?? 'Diagnóstico OMR'
    const showImage = options?.showImage ?? true

    const telemetryRows = captureTelemetry ? [
      ['Perfil do aparelho', captureTelemetry.deviceTier === 'low' ? 'leve' : captureTelemetry.deviceTier === 'high' ? 'forte' : 'equilibrado'],
      ['Tempo total', formatMs(captureTelemetry.totalMs)],
      ['Pre-processamento', formatMs(captureTelemetry.preprocessMs)],
      ['Detectar folha', formatMs(captureTelemetry.pageDetectMs)],
      ['Detectar marcadores', formatMs(captureTelemetry.markerDetectMs)],
      ['Analisar candidatos', formatMs(captureTelemetry.analysisMs)],
      ['Leitura de QR', formatMs(captureTelemetry.qrMs)],
      ['Leitura de bolhas', formatMs(captureTelemetry.bubbleMs)],
      ['Gerar diagnóstico', formatMs(captureTelemetry.debugMs)],
      ['Candidatos', String(captureTelemetry.candidateCount)],
      ['Rotações testadas', String(captureTelemetry.orientationChecks)],
      ['Origem escolhida', captureTelemetry.selectedSource === 'page' ? 'folha' : captureTelemetry.selectedSource === 'markers' ? 'marcadores' : '-'],
      ['Parada antecipada', captureTelemetry.fastPathUsed ? 'sim' : 'não'],
    ] : []

    const qualityRows = captureQuality ? [
      ['Resolução', `${captureQuality.longestSide}x${captureQuality.shortestSide}`],
      ['Brilho', formatNumber(captureQuality.brightness)],
      ['Contraste', formatNumber(captureQuality.contrast)],
      ['Nitidez', formatNumber(captureQuality.sharpness, 1)],
    ] : []

    const rows = [...telemetryRows, ...qualityRows]

    return (
      <details className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-left">
        <summary className="cursor-pointer text-sm font-medium text-slate-200">
          {title}
        </summary>
        {showImage && captureDebug && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={captureDebug.imageUrl}
            alt="Diagnóstico OMR"
            className="mt-3 w-full rounded-lg border border-slate-700"
          />
        )}
        {rows.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-300 sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label} className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-2">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 font-medium text-slate-100">{value}</div>
              </div>
            ))}
          </div>
        )}
      </details>
    )
  }

  async function handleLiveCapture(canvas: HTMLCanvasElement) {
    resetCaptureFeedback()
    setProcessing(true)
    setProcessingMsg('Processando câmera ao vivo...')

    try {
      const qualityReport = analyzeCaptureQuality(canvas)
      const qualityWarnings = qualityReport.warnings

      if (omrReady && omrEngineRef.current) {
        setProcessingMsg('Processando OMR...')
        const engine = omrEngineRef.current
        const nq = prova?.num_questoes || gabarito.length
        const nalts = prova?.num_alternativas || 5
        const result = engine.process(
          canvas,
          nq,
          nalts,
          prova?.tipos_questoes || undefined,
          prova?.criterio_discursiva || undefined,
          prova?.id || undefined,
          { deviceTier }
        ) as EngineOMRResult

        if (result && result.sucesso && result.respostas && result.respostas.length > 0) {
          const omrWarnings = getOMRWarnings(result.respostas)
          const warnings = [...qualityWarnings, ...omrWarnings]
          const respostasLetras = result.respostas.map((r: { marcada: string | null }) =>
            r.marcada ? r.marcada.toUpperCase() : ''
          )

          if (!hasUsableOMRRead(result.respostas)) {
            showCaptureFailure(
              'O cartão foi detectado, mas as marcações não ficaram legíveis o bastante para corrigir com segurança.',
              result.debug ?? null,
              qualityWarnings,
              result.telemetry ?? null,
              qualityReport
            )
            return
          }

          if (prova && result.qr?.provaId && result.qr.provaId !== prova.id) {
            showCaptureFailure(
              `Este cartão pertence à prova ${result.qr.provaId}. Confira se a prova selecionada está correta.`,
              result.debug ?? null,
              qualityWarnings,
              result.telemetry ?? null,
              qualityReport
            )
            return
          }

          if (!result.qr) {
            openResultReview(respostasLetras, null, {
              notice: {
                tone: 'warning',
                title: 'QR não lido',
                message: 'As respostas foram lidas, mas o QR do aluno não foi identificado. Selecione o aluno abaixo e confira as questões destacadas.',
              },
              warnings,
              debug: result.debug ?? null,
              telemetry: result.telemetry ?? null,
              quality: qualityReport,
            })
            return
          }

          if (result.qr.reserva) {
            openResultReview(respostasLetras, null, {
              notice: {
                tone: 'info',
                title: 'Cartão reserva',
                message: 'O cartão lido é de reserva. Selecione o aluno que usou este cartão e confirme a correção.',
              },
              warnings,
              debug: result.debug ?? null,
              telemetry: result.telemetry ?? null,
              quality: qualityReport,
            })
            return
          }

          const alunoId = result.qr.alunoId ?? null
          const alunoDaTurma = alunoId ? alunos.find((aluno) => aluno.id === alunoId) : null
          if (alunoId && !alunoDaTurma) {
            openResultReview(respostasLetras, null, {
              notice: {
                tone: 'warning',
                title: 'Aluno não localizado',
                message: 'O QR foi lido, mas o aluno não pertence à turma carregada. Confira se o cartão é da turma correta.',
              },
              warnings,
              debug: result.debug ?? null,
              telemetry: result.telemetry ?? null,
              quality: qualityReport,
            })
            return
          }

          openResultReview(respostasLetras, alunoDaTurma?.id ?? alunoId, {
            notice: warnings.length > 0 ? {
              tone: 'warning',
              title: 'Leitura com alerta',
              message: omrWarnings.length > 0
                ? 'Algumas questões ficaram vazias ou com dupla marcação. Confira antes de confirmar.'
                : 'A leitura funcionou, mas a captura apresentou sinais de baixa qualidade.',
            } : null,
            warnings,
            debug: result.debug ?? null,
            telemetry: result.telemetry ?? null,
            quality: qualityReport,
          })
        } else {
          showCaptureFailure(
            result?.mensagem || 'Não foi possível ler o cartão. Tente novamente com a foto mais nítida.',
            result?.debug ?? null,
            qualityWarnings,
            result?.telemetry ?? null,
            qualityReport
          )
        }
      } else {
        offerManualEntry({
          tone: 'warning',
          title: 'Leitura automática indisponível',
          message: 'O motor de leitura não carregou neste aparelho. Você ainda pode lançar a correção manualmente.',
        })
      }
    } catch (err: unknown) {
      showCaptureFailure(err instanceof Error ? err.message : 'Erro ao processar imagem')
    } finally {
      setProcessing(false)
      setProcessingMsg('')
    }
  }

  async function handleFileCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    resetCaptureFeedback()
    setProcessing(true)
    setProcessingMsg('Redimensionando imagem...')

    try {
      const canvas = await resizeImage(file, captureResizeOptions)
      const qualityReport = analyzeCaptureQuality(canvas)
      const qualityWarnings = qualityReport.warnings

      if (omrReady && omrEngineRef.current) {
        setProcessingMsg('Processando OMR...')
        const engine = omrEngineRef.current
        const nq = prova?.num_questoes || gabarito.length
        const nalts = prova?.num_alternativas || 5
        const result = engine.process(
          canvas,
          nq,
          nalts,
          prova?.tipos_questoes || undefined,
          prova?.criterio_discursiva || undefined,
          prova?.id || undefined,
          { deviceTier }
        ) as EngineOMRResult

        if (result && result.sucesso && result.respostas && result.respostas.length > 0) {
          const omrWarnings = getOMRWarnings(result.respostas)
          const warnings = [...qualityWarnings, ...omrWarnings]
          const respostasLetras = result.respostas.map((r: { marcada: string | null }) =>
            r.marcada ? r.marcada.toUpperCase() : ''
          )

          if (!hasUsableOMRRead(result.respostas)) {
            showCaptureFailure(
              'O cartão foi detectado, mas as marcações não ficaram legíveis o bastante para corrigir com segurança.',
              result.debug ?? null,
              qualityWarnings,
              result.telemetry ?? null,
              qualityReport
            )
            return
          }

          if (prova && result.qr?.provaId && result.qr.provaId !== prova.id) {
            showCaptureFailure(
              `Este cartão pertence à prova ${result.qr.provaId}. Confira se a prova selecionada está correta.`,
              result.debug ?? null,
              qualityWarnings,
              result.telemetry ?? null,
              qualityReport
            )
            return
          }

          if (!result.qr) {
            openResultReview(respostasLetras, null, {
              notice: {
                tone: 'warning',
                title: 'QR não lido',
                message: 'As respostas foram lidas, mas o QR do aluno não foi identificado. Selecione o aluno abaixo e confira as questões destacadas.',
              },
              warnings,
              debug: result.debug ?? null,
              telemetry: result.telemetry ?? null,
              quality: qualityReport,
            })
            return
          }

          if (result.qr.reserva) {
            openResultReview(respostasLetras, null, {
              notice: {
                tone: 'info',
                title: 'Cartão reserva',
                message: 'O cartão lido é de reserva. Selecione o aluno que usou este cartão e confirme a correção.',
              },
              warnings,
              debug: result.debug ?? null,
              telemetry: result.telemetry ?? null,
              quality: qualityReport,
            })
            return
          }

          const alunoId = result.qr.alunoId ?? null
          const alunoDaTurma = alunoId ? alunos.find((aluno) => aluno.id === alunoId) : null
          if (alunoId && !alunoDaTurma) {
            openResultReview(respostasLetras, null, {
              notice: {
                tone: 'warning',
                title: 'Aluno não localizado',
                message: 'O QR foi lido, mas o aluno não pertence à turma carregada. Confira se o cartão é da turma correta.',
              },
              warnings,
              debug: result.debug ?? null,
              telemetry: result.telemetry ?? null,
              quality: qualityReport,
            })
            return
          }

          openResultReview(respostasLetras, alunoDaTurma?.id ?? alunoId, {
            notice: warnings.length > 0 ? {
              tone: 'warning',
              title: 'Leitura com alerta',
              message: 'Algumas questões ficaram vazias ou com dupla marcação. Confira antes de confirmar.',
            } : null,
            warnings,
            debug: result.debug ?? null,
            telemetry: result.telemetry ?? null,
            quality: qualityReport,
          })
        } else {
          showCaptureFailure(
            result?.mensagem || 'Não foi possível ler o cartão. Tente novamente com a foto mais nítida.',
            result?.debug ?? null,
            qualityWarnings,
            result?.telemetry ?? null,
            qualityReport
          )
        }
      } else {
        offerManualEntry({
          tone: 'warning',
          title: 'Leitura automática indisponível',
          message: 'O motor de leitura não carregou neste aparelho. Você ainda pode lançar a correção manualmente.',
        })
      }
    } catch (err: unknown) {
      showCaptureFailure(err instanceof Error ? err.message : 'Erro ao processar imagem')
    } finally {
      setProcessing(false)
      setProcessingMsg('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function offerManualEntry(notice?: CaptureNotice | null) {
    const nq = prova?.num_questoes || gabarito.length
    openResultReview(new Array(nq).fill(''), null, {
      notice: notice || {
        tone: 'info',
        title: 'Correção manual',
        message: 'Selecione o aluno e preencha as respostas abaixo para continuar.',
      },
    })
  }

  // ── Answer editing ──
  function handleAnswerTap(questionIndex: number) {
    setEditingQuestion(questionIndex)
  }

  function handleAnswerSelect(questionIndex: number, alt: string) {
    setCurrentRespostas((prev) => {
      const next = [...prev]
      next[questionIndex] = next[questionIndex] === alt ? '' : alt
      return next
    })
    setEditingQuestion(null)
  }

  // ── Student selection (for manual mode or QR miss) ──
  function findAlunoById(id: number): Aluno | undefined {
    return alunos.find((a) => a.id === id)
  }

  const currentAluno = currentAlunoId ? findAlunoById(currentAlunoId) : null
  const currentScore = useMemo(
    () => computeScore(currentRespostas, gabarito, prova?.tipos_questoes, prova?.criterio_discursiva),
    [currentRespostas, gabarito, prova?.tipos_questoes, prova?.criterio_discursiva]
  )
  const correctedStudentsCount = useMemo(() => {
    if (alunos.length === 0) return existingResults.size
    return alunos.reduce((total, aluno) => total + (existingResults.has(aluno.id) ? 1 : 0), 0)
  }, [alunos, existingResults])

  // ── Confirm result ──
  async function handleConfirm() {
    if (!currentAlunoId) {
      toast.error('Selecione o aluno antes de confirmar')
      return
    }
    if (!prova || !userId) return

    const { acertos, percentual } = currentScore
    const totalQuestoesValidas = gabarito.filter((item) => item && item !== 'X' && item !== '*').length
    const respostasObj: Record<string, number | string> = {}
    const tipos = prova.tipos_questoes ? prova.tipos_questoes.split(',') : []
    const criterioMap: Record<number, Record<string, number>> = {
      2: { C: 1, E: 0 },
      3: { C: 1, P: 0.5, E: 0 },
      4: { E: 1, B: 0.75, P: 0.5, I: 0 },
    }
    const criterio = prova.criterio_discursiva || 3
    currentRespostas.forEach((r, i) => {
      if (r) {
        const isDisc = tipos[i]?.trim() === 'D'
        if (isDisc) {
          // Discursiva: store numeric score value
          const valorMap = criterioMap[criterio] || criterioMap[3]
          respostasObj[`q${i + 1}`] = valorMap[r.toUpperCase()] ?? 0
        } else {
          // Objetiva: store the answer letter
          respostasObj[`q${i + 1}`] = r.toUpperCase()
        }
      }
    })

    // Calculate nota if modo_avaliacao === 'nota'
    let nota: number | null = null
    if (prova.modo_avaliacao === 'nota' && prova.nota_total && totalQuestoesValidas > 0) {
      nota = Math.round((acertos / totalQuestoesValidas) * prova.nota_total * 100) / 100
    }

    const existing = existingResults.get(currentAlunoId)
    const payload = {
      user_id: userId,
      workspace_id: prova.workspace_id,
      prova_id: prova.id,
      aluno_id: currentAlunoId,
      presenca: 'P',
      respostas: respostasObj,
      acertos,
      percentual,
      nota,
      updated_at: new Date().toISOString(),
    }

    let error
    let savedResultId = existing?.id ?? null
    if (existing) {
      const res = await supabase
        .from('resultados')
        .update(payload)
        .eq('id', existing.id)
      error = res.error
    } else {
      const res = await supabase
        .from('resultados')
        .insert(payload)
        .select('id')
        .single()
      error = res.error
      savedResultId = res.data?.id ?? null
    }

    if (error) {
      toast.error('Erro ao salvar: ' + error.message)
      return
    }

    // Update session tracking
    setSessao((prev) => [
      ...prev.filter((entry) => entry.alunoId !== currentAlunoId),
      { alunoId: currentAlunoId, respostas: currentRespostas, acertos, percentual },
    ])
    setExistingResults((prev) => {
      const next = new Map(prev)
      next.set(currentAlunoId, { id: savedResultId || existing?.id || 0 })
      return next
    })

    toast.success(
      `${currentAluno?.nome || 'Aluno'}: ${acertos}/${totalQuestoesValidas || gabarito.length} (${percentual}%)`
    )

    // Reset for next capture
    setCurrentRespostas([])
    setCurrentAlunoId(null)
    setEditingQuestion(null)
    resetCaptureFeedback()
    setScreen('camera')
  }

  // ── Session summary ──
  function handleEndSession() {
    setScreen('summary')
  }

  function handleNewSession() {
    setProva(null)
    setAlunos([])
    setGabarito([])
    setExistingResults(new Map())
    setSessao([])
    resetCaptureFeedback()
    setCurrentRespostas([])
    setCurrentAlunoId(null)
    setSelectedProvaId(null)
    setScreen('setup')
  }

  // ── Summary calculations ──
  const summaryStats = useMemo(() => {
    if (sessao.length === 0) return { total: 0, media: 0, max: 0 }
    const total = sessao.length
    const media = Math.round(sessao.reduce((s, e) => s + e.percentual, 0) / total)
    const max = Math.max(...sessao.map((e) => e.percentual))
    return { total, media, max }
  }, [sessao])

  // ── Score color ──
  function scoreColor(pct: number): string {
    if (pct >= 70) return 'text-emerald-400'
    if (pct >= 50) return 'text-yellow-400'
    return 'text-red-400'
  }


  // ── Loading screen ──
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-indigo-400 border-t-transparent rounded-full" />
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-[600px] mx-auto px-3 pb-10">
        {/* Header */}
        <div className="text-center py-3">
          <h1 className="text-lg font-bold text-indigo-400">ProvaScan Câmera</h1>
          <p className="text-xs text-slate-400">Sistema de Correção de Provas</p>
        </div>

        {/* OMR loading indicator */}
        {omrLoading && screen !== 'auth' && (
          <div className="flex items-center justify-center gap-2 text-xs text-indigo-300 mb-2">
            <div className="animate-spin h-3 w-3 border border-indigo-400 border-t-transparent rounded-full" />
            Carregando motor OMR...
          </div>
        )}

        {/* ════════════════════════════════════════ */}
        {/*  SCREEN 1: AUTH                          */}
        {/* ════════════════════════════════════════ */}
        {screen === 'auth' && (
          <div className="bg-slate-800 rounded-xl p-6 mt-2">
            <h2 className="text-base font-semibold text-slate-100 text-center mb-1">
              Acesso do Professor
            </h2>
            <p className="text-sm text-slate-400 text-center mb-4">
              Digite seu e-mail e senha para iniciar
            </p>
            <form onSubmit={handleLogin} className="space-y-2">
              <input
                type="email"
                placeholder="E-mail"
                autoComplete="email"
                autoFocus
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-4 py-3.5 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-base outline-none focus:border-indigo-400 transition-colors placeholder:text-slate-500"
              />
              <input
                type="password"
                placeholder="Senha"
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-4 py-3.5 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-base outline-none focus:border-indigo-400 transition-colors placeholder:text-slate-500"
              />
              {authError && (
                <p className="text-red-400 text-sm text-center">{authError}</p>
              )}
              <button
                type="submit"
                disabled={authLoading}
                className="w-full h-14 rounded-lg bg-indigo-600 text-white font-semibold text-base hover:bg-indigo-700 active:scale-[0.97] transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {authLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                    Entrando...
                  </span>
                ) : (
                  'Entrar'
                )}
              </button>
            </form>
          </div>
        )}

        {/* ════════════════════════════════════════ */}
        {/*  SCREEN 2: EXAM SELECTION                */}
        {/* ════════════════════════════════════════ */}
        {screen === 'setup' && (
          <div className="bg-slate-800 rounded-xl p-5 mt-2">
            {userEmail && (
              <span className="inline-block bg-indigo-900 text-indigo-300 px-3 py-1 rounded-full text-xs mb-2">
                {userEmail}
              </span>
            )}
            <h2 className="text-base font-semibold text-slate-100 mb-3">
              Selecione a Prova
            </h2>

            {provasLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
                <div className="animate-spin h-5 w-5 border-2 border-indigo-400 border-t-transparent rounded-full" />
                Carregando provas...
              </div>
            ) : paramProvaId ? (
              <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
                <div className="animate-spin h-5 w-5 border-2 border-indigo-400 border-t-transparent rounded-full" />
                Carregando prova #{paramProvaId}...
              </div>
            ) : (
              <>
                <select
                  value={selectedProvaId ?? ''}
                  onChange={(e) => setSelectedProvaId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-4 py-3.5 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-base outline-none focus:border-indigo-400"
                >
                  <option value="">
                    {provas.length === 0 ? 'Nenhuma prova disponivel' : 'Selecione...'}
                  </option>
                  {provas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.disciplina?.nome || 'Sem disciplina'} -{' '}
                      {p.turma ? `${p.turma.serie} ${p.turma.turma}` : 'Sem turma'} ({p.num_questoes}q)
                    </option>
                  ))}
                </select>

                {selectedProvaId && (() => {
                  const sel = provas.find((p) => p.id === selectedProvaId)
                  if (!sel) return null
                  return (
                    <div className="mt-3 p-3 bg-slate-900 rounded-lg text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Disciplina</span>
                        <span className="text-slate-100 font-medium">{sel.disciplina?.nome || '-'}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-slate-400">Turma</span>
                        <span className="text-slate-100 font-medium">
                          {sel.turma ? `${sel.turma.serie} ${sel.turma.turma}` : '-'}
                        </span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-slate-400">Questões</span>
                        <span className="text-slate-100 font-medium">
                          {sel.num_questoes} ({sel.num_alternativas} alternativas)
                        </span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-slate-400">Status</span>
                        <span className="text-slate-100 font-medium">{sel.status}</span>
                      </div>
                    </div>
                  )
                })()}

                <button
                  onClick={handleStartSession}
                  disabled={!selectedProvaId}
                  className="w-full h-14 mt-3 rounded-lg bg-indigo-600 text-white font-semibold text-base hover:bg-indigo-700 active:scale-[0.97] transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  Iniciar Correção
                </button>
              </>
            )}

            <button
              onClick={async () => {
                await supabase.auth.signOut()
                setUserId(null)
                setScreen('auth')
              }}
              className="w-full h-10 mt-2 rounded-lg text-slate-400 text-sm hover:bg-slate-700/50 transition-colors"
            >
              Sair
            </button>
          </div>
        )}

        {/* ════════════════════════════════════════ */}
        {/*  SCREEN 3: CAMERA CAPTURE                */}
        {/* ════════════════════════════════════════ */}
        {screen === 'camera' && prova && (
          <>
            {/* Info bar */}
            <div className="bg-slate-800 rounded-lg px-3.5 py-2.5 mt-2 text-sm flex items-center justify-between">
              <div>
                <span className="text-slate-400">Prova: </span>
                <span className="text-slate-100 font-semibold">
                  {prova.disciplina?.nome || 'Prova'} -{' '}
                  {prova.turma ? `${prova.turma.serie} ${prova.turma.turma}` : ''}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Corrigidos: </span>
                <span className="text-slate-100 font-semibold">
                  {correctedStudentsCount}
                  {alunos.length > 0 ? ` de ${alunos.length}` : ''}
                </span>
              </div>
            </div>

            {/* Capture area */}
            <div className="bg-slate-800 rounded-xl p-4 mt-2 text-center">
              <div className="text-4xl mb-2">&#128247;</div>
              <p className="text-xs text-slate-400 mb-4">
                Fotografe o cartão de resposta do aluno.
                <br />
                Enquadre todo o cartão com boa iluminação.
              </p>

              {ENABLE_LIVE_SCANNER ? (
                <>
                  <LiveScanner
                    disabled={processing || omrLoading}
                    onCapture={handleLiveCapture}
                  />

                  <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-left">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Plano B
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Abra a câmera ou galeria do aparelho se o scanner ao vivo não estiver bom neste celular.
                    </p>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-left">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Captura recomendada
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Use a câmera do próprio celular, ative o flash se precisar e enquadre a folha inteira antes de confirmar a foto.
                  </p>
                </div>
              )}

              {/* File input trigger */}
              <label className="mt-3 block w-full cursor-pointer">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileCapture}
                  className="absolute w-px h-px opacity-0 overflow-hidden pointer-events-none"
                />
                <div className={`flex items-center justify-center gap-2.5 w-full h-14 rounded-xl font-semibold text-lg transition-all ${
                  processing
                    ? 'bg-indigo-600/70 pointer-events-none'
                    : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.97]'
                }`}>
                  {processing ? (
                    <>
                      <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
                      {processingMsg || 'Processando...'}
                    </>
                  ) : (
                    <>
                      <span>&#128248;</span> Abrir Câmera do Aparelho
                    </>
                  )}
                </div>
              </label>

              {/* Manual entry button */}
              <button
                onClick={() => offerManualEntry()}
                className="w-full h-12 mt-2 rounded-lg text-indigo-300 text-sm hover:bg-slate-700/50 transition-colors"
              >
                Correção Manual
              </button>

              {/* Error message */}
              {captureError && (
                <div className="mt-3 p-3 bg-red-900/50 text-red-300 rounded-lg text-sm text-left">
                  {captureError}
                </div>
              )}

              {captureWarnings.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-3 text-left text-xs text-amber-100">
                  <div className="font-semibold text-sm">Dicas para a próxima foto</div>
                  <div className="mt-1">
                    {captureWarnings.slice(0, 4).join(' • ')}
                    {captureWarnings.length > 4 ? ` • +${captureWarnings.length - 4} outras` : ''}
                  </div>
                </div>
              )}

              {ENABLE_OMR_DIAGNOSTICS && captureDebug && (
                <details className="mt-3 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-left">
                  <summary className="cursor-pointer text-sm font-medium text-slate-200">
                    Diagnóstico OMR
                  </summary>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={captureDebug.imageUrl}
                    alt="Diagnóstico OMR"
                    className="mt-3 w-full rounded-lg border border-slate-700"
                  />
                </details>
              )}
              {ENABLE_OMR_DIAGNOSTICS && (captureTelemetry || captureQuality) && (
                <div className="mt-3">
                  {renderDiagnosticDetails({ title: 'Telemetria OMR', showImage: false })}
                </div>
              )}
            </div>

            {/* Bottom bar */}
            <div className="mt-3">
              <button
                onClick={handleEndSession}
                className="w-full h-14 rounded-lg bg-red-600 text-white font-semibold text-base hover:bg-red-700 active:scale-[0.97] transition-all"
              >
                Encerrar Sessão
              </button>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════ */}
        {/*  SCREEN 4: RESULT REVIEW                 */}
        {/* ════════════════════════════════════════ */}
        {screen === 'result' && (
          <div className="bg-slate-800 rounded-xl p-4 mt-2">
            {captureNotice && (
              <div className={`mb-3 rounded-lg px-3 py-3 text-sm ${getCaptureNoticeClasses(captureNotice.tone)}`}>
                <div className="font-semibold">{captureNotice.title}</div>
                <div className="mt-1 text-xs sm:text-sm">{captureNotice.message}</div>
              </div>
            )}

            {captureWarnings.length > 0 && (
              <div className="mb-3 rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-3 text-xs text-amber-100">
                <div className="font-semibold text-sm">Questões para conferir</div>
                <div className="mt-1">
                  {captureWarnings.slice(0, 6).join(' • ')}
                  {captureWarnings.length > 6 ? ` • +${captureWarnings.length - 6} outras` : ''}
                </div>
              </div>
            )}

            {ENABLE_OMR_DIAGNOSTICS && captureDebug && (
              <details className="mb-3 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-left">
                <summary className="cursor-pointer text-sm font-medium text-slate-200">
                  Diagnóstico OMR
                </summary>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={captureDebug.imageUrl}
                  alt="Diagnóstico OMR"
                  className="mt-3 w-full rounded-lg border border-slate-700"
                />
              </details>
            )}

            {ENABLE_OMR_DIAGNOSTICS && (captureTelemetry || captureQuality) && (
              <div className="mb-3">
                {renderDiagnosticDetails({ title: 'Telemetria OMR', showImage: false })}
              </div>
            )}

            {/* Student selection */}
            <div className="mb-3">
              <label className="text-xs text-slate-400 block mb-1">Aluno</label>
              <select
                value={currentAlunoId ?? ''}
                onChange={(e) => setCurrentAlunoId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-3 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-base outline-none focus:border-indigo-400"
              >
                <option value="">Selecione o aluno...</option>
                {alunos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.numero ? `${a.numero}. ` : ''}{a.nome}
                    {existingResults.has(a.id) ? ' (ja corrigido)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Score display */}
            <div className="text-center mb-3">
              {currentAluno && (
                <div className="text-base font-bold text-slate-100">{currentAluno.nome}</div>
              )}
              <div className={`text-3xl font-bold mt-1 ${scoreColor(currentScore.percentual)}`}>
                {currentScore.acertos}/{gabarito.length}
              </div>
              <div className="text-sm text-slate-400">
                {currentScore.percentual}% de acerto
              </div>
            </div>

            {/* Answer grid */}
            <div className="grid gap-1" style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(44px, 1fr))`
            }}>
              {currentRespostas.map((resp, i) => {
                const gab = gabarito[i] || ''
                const tipos = prova?.tipos_questoes?.split(',') || []
                const isDisc = tipos[i]?.trim() === 'D'
                const isAnulada = gab === 'X' || gab === '*'
                // Para discursivas, qualquer resposta marcada é válida (não compara com gabarito)
                const isCorrect = isDisc
                  ? false // discursivas não têm certo/errado na câmera
                  : (!isAnulada && !!resp && resp.toUpperCase() === gab)
                const isEmpty = !resp
                const isEditing = editingQuestion === i

                let cellClass = 'bg-slate-700 text-slate-400' // empty
                if (isAnulada) cellClass = 'bg-yellow-900/50 text-yellow-400'
                else if (isDisc && !isEmpty) cellClass = 'bg-blue-900/50 text-blue-300'
                else if (!isEmpty && isCorrect) cellClass = 'bg-emerald-900/50 text-emerald-400'
                else if (!isEmpty && !isCorrect) cellClass = 'bg-red-900/50 text-red-300'

                return (
                  <div key={i} className="relative">
                    <button
                      onClick={() => handleAnswerTap(i)}
                      className={`w-full text-center py-1.5 px-0.5 rounded-md text-xs font-semibold transition-transform active:scale-[0.85] ${cellClass}`}
                    >
                      <span className="block text-[10px] text-slate-500">{i + 1}</span>
                      {resp || '-'}
                    </button>

                    {/* Edit popover */}
                    {isEditing && (() => {
                      const tipos = prova?.tipos_questoes?.split(',') || []
                      const isDisc = tipos[i]?.trim() === 'D'
                      const criterio = (prova?.criterio_discursiva || 3) as 2 | 3 | 4
                      const opcoes = isDisc
                        ? CRITERIOS_DISCURSIVA[criterio].map((c) => c.label)
                        : ALTS.slice(0, prova?.num_alternativas || 5)

                      return (
                        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-700 rounded-lg p-1.5 shadow-xl flex gap-1 min-w-max">
                          {opcoes.map((alt) => (
                            <button
                              key={alt}
                              onClick={() => handleAnswerSelect(i, alt)}
                              className={`w-8 h-8 rounded text-xs font-bold transition-colors ${
                                resp === alt
                                  ? isDisc ? 'bg-blue-600 text-white' : 'bg-indigo-600 text-white'
                                  : 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                              }`}
                            >
                              {alt}
                            </button>
                          ))}
                          <button
                            onClick={() => handleAnswerSelect(i, '')}
                            className="w-8 h-8 rounded text-xs font-bold bg-slate-600 text-slate-400 hover:bg-slate-500"
                          >
                            -
                          </button>
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>

            <p className="text-center text-[11px] text-slate-500 mt-2 mb-2">
              Toque em uma questão para corrigir
            </p>

            {/* Legend */}
            <div className="flex flex-col items-center gap-1.5 text-[10px] text-slate-400 mb-3">
              {/* Legenda objetiva */}
              <div className="flex items-center gap-3">
                <span className="text-slate-500 font-medium">Objetiva:</span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-900/50" /> Certo
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-900/50" /> Errado
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-yellow-900/50" /> Anulada
                </span>
              </div>
              {/* Legenda discursiva */}
              {prova && (prova.tipo_prova === 'mista' || prova.tipo_prova === 'discursiva') && (() => {
                const crit = prova.criterio_discursiva as 2 | 3 | 4
                const cores: Record<string, string> = {
                  green: 'bg-green-500',
                  emerald: 'bg-emerald-400',
                  yellow: 'bg-yellow-400',
                  red: 'bg-red-500',
                }
                const criterios = CRITERIOS_DISCURSIVA[crit] || CRITERIOS_DISCURSIVA[3]
                return (
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500 font-medium">Discursiva:</span>
                    {criterios.map((c) => (
                      <span key={c.label} className="flex items-center gap-1">
                        <span className={`inline-block w-2.5 h-2.5 rounded-sm ${cores[c.cor] || 'bg-gray-500'}`} />
                        {c.label} = {c.nome}
                      </span>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* Actions */}
            <div className="flex gap-2.5 mt-2">
              <button
                onClick={() => {
                  resetCaptureFeedback()
                  setCurrentRespostas([])
                  setCurrentAlunoId(null)
                  setEditingQuestion(null)
                  setScreen('camera')
                }}
                className="flex-1 h-14 rounded-lg bg-red-600 text-white font-semibold text-sm hover:bg-red-700 active:scale-[0.97] transition-all"
              >
                Refazer Foto
              </button>
              <button
                onClick={handleConfirm}
                disabled={!currentAlunoId}
                className="flex-1 h-14 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 active:scale-[0.97] transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                Confirmar e Próximo
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════ */}
        {/*  SCREEN 5: SESSION SUMMARY               */}
        {/* ════════════════════════════════════════ */}
        {screen === 'summary' && (
          <div className="bg-slate-800 rounded-xl p-4 mt-2">
            <h2 className="text-base font-semibold text-slate-100 text-center mb-3">
              Sessão Encerrada
            </h2>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-slate-900 rounded-lg p-2.5 text-center">
                <div className="text-xl font-bold text-indigo-400">{summaryStats.total}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Corrigidos</div>
              </div>
              <div className="bg-slate-900 rounded-lg p-2.5 text-center">
                <div className={`text-xl font-bold ${scoreColor(summaryStats.media)}`}>
                  {summaryStats.total > 0 ? `${summaryStats.media}%` : '-'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Média</div>
              </div>
              <div className="bg-slate-900 rounded-lg p-2.5 text-center">
                <div className={`text-xl font-bold ${scoreColor(summaryStats.max)}`}>
                  {summaryStats.total > 0 ? `${summaryStats.max}%` : '-'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Maior nota</div>
              </div>
            </div>

            {/* Students list */}
            {sessao.length > 0 && (
              <ul className="space-y-0.5">
                {sessao.map((entry, i) => {
                  const aluno = findAlunoById(entry.alunoId)
                  return (
                    <li
                      key={i}
                      className={`flex justify-between items-center px-2.5 py-1.5 rounded-md text-sm ${
                        i % 2 === 0 ? 'bg-slate-900/50' : ''
                      }`}
                    >
                      <span className="text-slate-200">{aluno?.nome || `Aluno #${entry.alunoId}`}</span>
                      <span className={`font-semibold ${scoreColor(entry.percentual)}`}>
                        {entry.acertos}/{gabarito.length} ({entry.percentual}%)
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}

            {sessao.length === 0 && (
              <p className="text-center text-sm text-slate-400 py-4">
                Nenhuma correção nesta sessão.
              </p>
            )}

            {/* Actions */}
            <button
              onClick={handleNewSession}
              className="w-full h-14 mt-5 rounded-lg bg-indigo-600 text-white font-semibold text-base hover:bg-indigo-700 active:scale-[0.97] transition-all"
            >
              Nova Sessão
            </button>
            <a
              href="/dashboard"
              className="block w-full h-10 mt-2 rounded-lg text-slate-400 text-sm text-center leading-10 hover:bg-slate-700/50 transition-colors"
            >
              Voltar ao Sistema
            </a>
          </div>
        )}
      </div>

      {/* Click-away handler for answer editing popover */}
      {editingQuestion !== null && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setEditingQuestion(null)}
        />
      )}
    </div>
  )
}
