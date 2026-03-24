'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Prova, Aluno, Resultado } from '@/types/database'

// ── Types ──────────────────────────────────────────────────────
interface OMRResult {
  alunoId: number | null
  respostas: string[]
  confianca: number
  debug?: {
    imageDataUrl?: string
    levels?: string
  }
}

interface SessionEntry {
  alunoId: number
  respostas: string[]
  acertos: number
  percentual: number
}

type Screen = 'auth' | 'setup' | 'camera' | 'result' | 'summary'

// ── Helpers ────────────────────────────────────────────────────
const ALTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

function parseGabarito(raw: string | null): string[] {
  if (!raw) return []
  return raw.split(',').map((s) => s.trim().toUpperCase())
}

function computeScore(
  respostas: string[],
  gabarito: string[]
): { acertos: number; percentual: number } {
  let acertos = 0
  const total = gabarito.length
  for (let i = 0; i < total; i++) {
    const gab = gabarito[i]
    if (!gab || gab === 'X' || gab === '*') continue // anulada
    if (respostas[i] && respostas[i].toUpperCase() === gab) acertos++
  }
  return { acertos, percentual: total > 0 ? Math.round((acertos / total) * 100) : 0 }
}

function resizeImage(file: File, maxSize: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(img.src)
      resolve(canvas)
    }
    img.onerror = () => reject(new Error('Erro ao carregar imagem'))
    img.src = URL.createObjectURL(file)
  })
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
  const [provas, setProvas] = useState<(Prova & { disciplina?: { nome: string }; turma?: { serie: string; turma: string } })[]>([])
  const [selectedProvaId, setSelectedProvaId] = useState<number | null>(null)
  const [provasLoading, setProvasLoading] = useState(false)

  // Session state
  const [prova, setProva] = useState<Prova | null>(null)
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [gabarito, setGabarito] = useState<string[]>([])
  const [existingResults, setExistingResults] = useState<Map<number, Resultado>>(new Map())
  const [sessao, setSessao] = useState<SessionEntry[]>([])

  // Camera state
  const [processing, setProcessing] = useState(false)
  const [processingMsg, setProcessingMsg] = useState('')
  const [captureError, setCaptureError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Result state
  const [currentRespostas, setCurrentRespostas] = useState<string[]>([])
  const [currentAlunoId, setCurrentAlunoId] = useState<number | null>(null)
  const [editingQuestion, setEditingQuestion] = useState<number | null>(null)
  const [manualMode, setManualMode] = useState(false)

  // OMR engine
  const [omrReady, setOmrReady] = useState(false)
  const [omrLoading, setOmrLoading] = useState(true)
  const omrEngineRef = useRef<any>(null)

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
      toast.error('Prova nao encontrada')
      setProvasLoading(false)
      return
    }

    await startSession(provaData)
    setProvasLoading(false)
  }

  // ── Start correction session ──
  async function startSession(provaData: any) {
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
      .select('*, aluno:alunos(*)')
      .eq('prova_id', provaData.id)

    const resultsMap = new Map<number, Resultado>()
    if (resultados) {
      for (const r of resultados) {
        resultsMap.set(r.aluno_id, r)
      }
    }
    setExistingResults(resultsMap)
    setSessao([])
    setScreen('camera')
    toast.success('Sessao de correcao iniciada')
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
  async function handleFileCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setCaptureError('')
    setProcessing(true)
    setProcessingMsg('Redimensionando imagem...')

    try {
      const canvas = await resizeImage(file, 2400)

      if (omrReady && omrEngineRef.current) {
        setProcessingMsg('Processando OMR...')
        const engine = omrEngineRef.current
        const nq = prova?.num_questoes || gabarito.length
        const nalts = prova?.num_alternativas || 5
        const result: OMRResult = await engine.process(canvas, nq, nalts)

        if (result && result.respostas && result.respostas.length > 0) {
          setCurrentRespostas(result.respostas.map((r: string) => r.toUpperCase()))
          setCurrentAlunoId(result.alunoId)
          setManualMode(false)
          setScreen('result')
        } else {
          setCaptureError('Nao foi possivel ler o cartao. Tente novamente ou corrija manualmente.')
          offerManualEntry()
        }
      } else {
        // No OMR engine, go straight to manual
        offerManualEntry()
      }
    } catch (err: any) {
      setCaptureError(err.message || 'Erro ao processar imagem')
      offerManualEntry()
    } finally {
      setProcessing(false)
      setProcessingMsg('')
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function offerManualEntry() {
    const nq = prova?.num_questoes || gabarito.length
    setCurrentRespostas(new Array(nq).fill(''))
    setCurrentAlunoId(null)
    setManualMode(true)
    setScreen('result')
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
    () => computeScore(currentRespostas, gabarito),
    [currentRespostas, gabarito]
  )

  // ── Confirm result ──
  async function handleConfirm() {
    if (!currentAlunoId) {
      toast.error('Selecione o aluno antes de confirmar')
      return
    }
    if (!prova || !userId) return

    const { acertos, percentual } = currentScore
    const respostasObj: Record<string, number> = {}
    currentRespostas.forEach((r, i) => {
      if (r) {
        respostasObj[String(i + 1)] = ALTS.indexOf(r.toUpperCase())
      }
    })

    // Calculate nota if modo_avaliacao === 'nota'
    let nota: number | null = null
    if (prova.modo_avaliacao === 'nota' && prova.nota_total) {
      nota = Math.round((acertos / gabarito.length) * prova.nota_total * 100) / 100
    }

    const existing = existingResults.get(currentAlunoId)
    const payload = {
      user_id: userId,
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
    if (existing) {
      const res = await supabase
        .from('resultados')
        .update(payload)
        .eq('id', existing.id)
      error = res.error
    } else {
      const res = await supabase.from('resultados').insert(payload)
      error = res.error
    }

    if (error) {
      toast.error('Erro ao salvar: ' + error.message)
      return
    }

    // Update session tracking
    setSessao((prev) => [
      ...prev,
      { alunoId: currentAlunoId, respostas: currentRespostas, acertos, percentual },
    ])
    setExistingResults((prev) => {
      const next = new Map(prev)
      next.set(currentAlunoId, { ...payload, id: existing?.id || 0 } as any)
      return next
    })

    toast.success(
      `${currentAluno?.nome || 'Aluno'}: ${acertos}/${gabarito.length} (${percentual}%)`
    )

    // Reset for next capture
    setCurrentRespostas([])
    setCurrentAlunoId(null)
    setEditingQuestion(null)
    setManualMode(false)
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

  function scoreBg(pct: number): string {
    if (pct >= 70) return 'bg-emerald-900/50'
    if (pct >= 50) return 'bg-yellow-900/50'
    return 'bg-red-900/50'
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
          <h1 className="text-lg font-bold text-indigo-400">ProvaScan Camera</h1>
          <p className="text-xs text-slate-400">Sistema de Correcao de Provas</p>
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
                        <span className="text-slate-400">Questoes</span>
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
                  Iniciar Correcao
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
                  {(prova as any).disciplina?.nome || 'Prova'} -{' '}
                  {(prova as any).turma ? `${(prova as any).turma.serie} ${(prova as any).turma.turma}` : ''}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Corrigidos: </span>
                <span className="text-slate-100 font-semibold">
                  {sessao.length + existingResults.size}
                  {alunos.length > 0 ? ` de ${alunos.length}` : ''}
                </span>
              </div>
            </div>

            {/* Capture area */}
            <div className="bg-slate-800 rounded-xl p-4 mt-2 text-center">
              <div className="text-4xl mb-2">&#128247;</div>
              <p className="text-xs text-slate-400 mb-4">
                Fotografe o cartao de resposta do aluno.
                <br />
                Enquadre todo o cartao com boa iluminacao.
              </p>

              {/* File input trigger */}
              <label className="block w-full cursor-pointer">
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
                      <span>&#128248;</span> Fotografar Cartao
                    </>
                  )}
                </div>
              </label>

              {/* Manual entry button */}
              <button
                onClick={offerManualEntry}
                className="w-full h-12 mt-2 rounded-lg text-indigo-300 text-sm hover:bg-slate-700/50 transition-colors"
              >
                Correcao Manual
              </button>

              {/* Error message */}
              {captureError && (
                <div className="mt-3 p-3 bg-red-900/50 text-red-300 rounded-lg text-sm text-left">
                  {captureError}
                </div>
              )}
            </div>

            {/* Bottom bar */}
            <div className="mt-3">
              <button
                onClick={handleEndSession}
                className="w-full h-14 rounded-lg bg-red-600 text-white font-semibold text-base hover:bg-red-700 active:scale-[0.97] transition-all"
              >
                Encerrar Sessao
              </button>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════ */}
        {/*  SCREEN 4: RESULT REVIEW                 */}
        {/* ════════════════════════════════════════ */}
        {screen === 'result' && (
          <div className="bg-slate-800 rounded-xl p-4 mt-2">
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
                const isAnulada = gab === 'X' || gab === '*'
                const isCorrect = !isAnulada && resp && resp.toUpperCase() === gab
                const isEmpty = !resp
                const isEditing = editingQuestion === i

                let cellClass = 'bg-slate-700 text-slate-400' // empty
                if (isAnulada) cellClass = 'bg-yellow-900/50 text-yellow-400'
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
                    {isEditing && (
                      <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-700 rounded-lg p-1.5 shadow-xl flex gap-1 min-w-max">
                        {ALTS.slice(0, prova?.num_alternativas || 5).map((alt) => (
                          <button
                            key={alt}
                            onClick={() => handleAnswerSelect(i, alt)}
                            className={`w-8 h-8 rounded text-xs font-bold transition-colors ${
                              resp === alt
                                ? 'bg-indigo-600 text-white'
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
                    )}
                  </div>
                )
              })}
            </div>

            <p className="text-center text-[11px] text-slate-500 mt-2 mb-2">
              Toque em uma questao para corrigir
            </p>

            {/* Legend */}
            <div className="flex items-center justify-center gap-3 text-[10px] text-slate-400 mb-3">
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

            {/* Actions */}
            <div className="flex gap-2.5 mt-2">
              <button
                onClick={() => {
                  setCurrentRespostas([])
                  setCurrentAlunoId(null)
                  setEditingQuestion(null)
                  setManualMode(false)
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
                Confirmar e Proximo
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
              Sessao Encerrada
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
                <div className="text-[10px] text-slate-400 mt-0.5">Media</div>
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
                Nenhuma correcao nesta sessao.
              </p>
            )}

            {/* Actions */}
            <button
              onClick={handleNewSession}
              className="w-full h-14 mt-5 rounded-lg bg-indigo-600 text-white font-semibold text-base hover:bg-indigo-700 active:scale-[0.97] transition-all"
            >
              Nova Sessao
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
