'use client'

import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import type { OMRResult, OMREngine } from '@/lib/omr/engine'
import { analyzeCaptureQuality } from '@/lib/omr/capture-quality'
import {
  answersToCompactString,
  compareAnswers,
  DEFAULT_OMR_LAB_SCENARIOS,
  parseCompactAnswers,
  type OMRLabScenario,
  type ScenarioPerspective,
} from '@/lib/omr/lab-scenarios'

type LabResultStatus = 'ok' | 'warning' | 'fail'

type LabResult = {
  scenarioId: string
  scenarioName: string
  note: string
  status: LabResultStatus
  answers: string[]
  qrText: string
  okCount: number
  emptyCount: number
  ambiguousCount: number
  matchCount: number | null
  mismatchQuestions: number[]
  totalMs: number | null
  candidateCount: number | null
  orientationChecks: number | null
  sourcePreviewUrl: string
  debugImageUrl: string | null
  warnings: string[]
}

type BatchSummary = {
  total: number
  ok: number
  warning: number
  fail: number
}

function buildBlankCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }
  return canvas
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = buildBlankCanvas(source.width, source.height)
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.drawImage(source, 0, 0)
  }
  return canvas
}

async function loadFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Nao foi possivel ler a imagem.'))
    reader.readAsDataURL(file)
  })

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('Nao foi possivel carregar a imagem.'))
    element.src = dataUrl
  })

  const canvas = buildBlankCanvas(image.naturalWidth || image.width, image.naturalHeight || image.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Nao foi possivel criar o canvas da imagem.')
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

function applyRotation(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  const width = source.width
  const height = source.height
  const rotatedWidth = Math.max(1, Math.round(width * cos + height * sin))
  const rotatedHeight = Math.max(1, Math.round(width * sin + height * cos))
  const canvas = buildBlankCanvas(rotatedWidth, rotatedHeight)
  const ctx = canvas.getContext('2d')
  if (!ctx) return cloneCanvas(source)

  ctx.translate(rotatedWidth / 2, rotatedHeight / 2)
  ctx.rotate(radians)
  ctx.drawImage(source, -width / 2, -height / 2)
  return canvas
}

function buildPerspectivePoints(
  width: number,
  height: number,
  perspective: ScenarioPerspective
): number[] {
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max)

  return [
    clamp(perspective.tl.x * width, width - 1),
    clamp(perspective.tl.y * height, height - 1),
    clamp(width - 1 + perspective.tr.x * width, width - 1),
    clamp(perspective.tr.y * height, height - 1),
    clamp(perspective.bl.x * width, width - 1),
    clamp(height - 1 + perspective.bl.y * height, height - 1),
    clamp(width - 1 + perspective.br.x * width, width - 1),
    clamp(height - 1 + perspective.br.y * height, height - 1),
  ]
}

function applyPerspective(source: HTMLCanvasElement, perspective: ScenarioPerspective): HTMLCanvasElement {
  const cvLib = (window as Window & { cv?: typeof globalThis.cv }).cv
  if (!cvLib?.Mat || typeof cvLib.getPerspectiveTransform !== 'function') {
    return cloneCanvas(source)
  }

  const src = cvLib.imread(source)
  const dst = new cvLib.Mat()
  const srcPts = cvLib.matFromArray(4, 1, cvLib.CV_32FC2, [
    0,
    0,
    source.width - 1,
    0,
    0,
    source.height - 1,
    source.width - 1,
    source.height - 1,
  ])
  const dstPts = cvLib.matFromArray(4, 1, cvLib.CV_32FC2, buildPerspectivePoints(source.width, source.height, perspective))
  const matrix = cvLib.getPerspectiveTransform(srcPts, dstPts)
  cvLib.warpPerspective(
    src,
    dst,
    matrix,
    new cvLib.Size(source.width, source.height),
    cvLib.INTER_LINEAR,
    cvLib.BORDER_CONSTANT,
    new cvLib.Scalar(255, 255, 255, 255)
  )

  const canvas = buildBlankCanvas(source.width, source.height)
  cvLib.imshow(canvas, dst)

  src.delete()
  dst.delete()
  srcPts.delete()
  dstPts.delete()
  matrix.delete()

  return canvas
}

function applyFilter(source: HTMLCanvasElement, scenario: OMRLabScenario): HTMLCanvasElement {
  const canvas = buildBlankCanvas(source.width, source.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return cloneCanvas(source)

  const filters: string[] = []
  if (typeof scenario.brightness === 'number') {
    filters.push(`brightness(${Math.round(scenario.brightness * 100)}%)`)
  }
  if (typeof scenario.contrast === 'number') {
    filters.push(`contrast(${Math.round(scenario.contrast * 100)}%)`)
  }
  if (typeof scenario.blurPx === 'number' && scenario.blurPx > 0) {
    filters.push(`blur(${scenario.blurPx}px)`)
  }

  ctx.filter = filters.length > 0 ? filters.join(' ') : 'none'
  ctx.drawImage(source, 0, 0)
  ctx.filter = 'none'

  if (scenario.shadow) {
    const shadow = scenario.shadow
    ctx.save()
    ctx.fillStyle = `rgba(0, 0, 0, ${shadow.opacity})`
    ctx.filter = `blur(${shadow.blurPx}px)`
    ctx.beginPath()
    ctx.ellipse(
      shadow.x * canvas.width,
      shadow.y * canvas.height,
      shadow.radius * canvas.width,
      shadow.radius * canvas.height,
      0,
      0,
      Math.PI * 2
    )
    ctx.fill()
    ctx.restore()
  }

  return canvas
}

function createScenarioCanvas(source: HTMLCanvasElement, scenario: OMRLabScenario): HTMLCanvasElement {
  let current = cloneCanvas(source)

  if (typeof scenario.rotationDeg === 'number' && scenario.rotationDeg !== 0) {
    const rotated = applyRotation(current, scenario.rotationDeg)
    current = rotated
  }

  if (scenario.perspective) {
    const distorted = applyPerspective(current, scenario.perspective)
    current = distorted
  }

  if (
    typeof scenario.brightness === 'number' ||
    typeof scenario.contrast === 'number' ||
    typeof scenario.blurPx === 'number' ||
    scenario.shadow
  ) {
    const filtered = applyFilter(current, scenario)
    current = filtered
  }

  return current
}

function getReadableWarnings(result: OMRResult, answerCount: number): string[] {
  const warnings: string[] = []
  const respostas = result.respostas || []

  if (!result.qr) {
    warnings.push('QR nao identificado.')
  }

  respostas.forEach((resposta) => {
    if (resposta.status === 'vazia') {
      warnings.push(`Q${String(resposta.questao).padStart(2, '0')}: sem marcacao.`)
    } else if (resposta.status === 'ambigua') {
      warnings.push(`Q${String(resposta.questao).padStart(2, '0')}: dupla marcacao.`)
    }
  })

  if (respostas.length !== answerCount) {
    warnings.push('Quantidade de respostas lidas diferente do esperado.')
  }

  return warnings
}

function buildSummary(results: LabResult[]): BatchSummary {
  return results.reduce<BatchSummary>(
    (acc, result) => {
      acc.total += 1
      acc[result.status] += 1
      return acc
    },
    { total: 0, ok: 0, warning: 0, fail: 0 }
  )
}

export function OmrLab() {
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<OMREngine | null>(null)
  const [engineReady, setEngineReady] = useState(false)
  const [engineError, setEngineError] = useState('')
  const [loadingEngine, setLoadingEngine] = useState(true)
  const [imageName, setImageName] = useState('')
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState('')
  const [numQuestions, setNumQuestions] = useState(10)
  const [numAlternatives, setNumAlternatives] = useState(5)
  const [expectedProvaId, setExpectedProvaId] = useState('')
  const [manualBaseline, setManualBaseline] = useState('')
  const [useManualBaseline, setUseManualBaseline] = useState(false)
  const [results, setResults] = useState<LabResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [runError, setRunError] = useState('')
  const summary = useMemo(() => buildSummary(results), [results])

  useEffect(() => {
    let cancelled = false

    async function loadEngine() {
      setLoadingEngine(true)
      try {
        const engineModule = await import('@/lib/omr/engine')
        const engine = new engineModule.OMREngine()
        await engine.load()
        if (cancelled) return
        engineRef.current = engine
        setEngineReady(true)
        setEngineError('')
      } catch (error) {
        if (cancelled) return
        setEngineError(error instanceof Error ? error.message : 'Falha ao carregar o motor OMR.')
      } finally {
        if (!cancelled) {
          setLoadingEngine(false)
        }
      }
    }

    loadEngine()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setRunError('')
    setResults([])
    setImageName(file.name)

    try {
      const canvas = await loadFileToCanvas(file)
      sourceCanvasRef.current = canvas
      setSourcePreviewUrl(canvas.toDataURL('image/jpeg', 0.92))
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Nao foi possivel abrir a imagem.')
      sourceCanvasRef.current = null
      setSourcePreviewUrl('')
    } finally {
      event.target.value = ''
    }
  }

  function buildBaseline(sourceAnswers: string[]): string[] {
    if (!useManualBaseline) {
      return sourceAnswers
    }
    return parseCompactAnswers(manualBaseline)
  }

  async function runBatch() {
    if (!engineRef.current || !sourceCanvasRef.current) return

    setIsRunning(true)
    setRunError('')

    try {
      const engine = engineRef.current
      const sourceCanvas = sourceCanvasRef.current
      const nextResults: LabResult[] = []
      let baselineAnswers: string[] | null = null

      for (const scenario of DEFAULT_OMR_LAB_SCENARIOS) {
        const scenarioCanvas = createScenarioCanvas(sourceCanvas, scenario)
        const result = engine.process(
          scenarioCanvas,
          numQuestions,
          numAlternatives,
          undefined,
          undefined,
          expectedProvaId ? Number(expectedProvaId) : undefined,
        )

        const answers = (result.respostas || []).map((resposta) => resposta.marcada || '')
        if (scenario.id === 'base') {
          baselineAnswers = buildBaseline(answers)
        }

        const quality = analyzeCaptureQuality(scenarioCanvas, { ignoreResolution: true })
        const readableWarnings = [
          ...quality.warnings,
          ...getReadableWarnings(result, numQuestions),
        ]

        const okCount = (result.respostas || []).filter((resposta) => resposta.status === 'ok').length
        const emptyCount = (result.respostas || []).filter((resposta) => resposta.status === 'vazia').length
        const ambiguousCount = (result.respostas || []).filter((resposta) => resposta.status === 'ambigua').length

        let matchCount: number | null = null
        let mismatchQuestions: number[] = []
        if (baselineAnswers && baselineAnswers.length > 0) {
          const comparison = compareAnswers(baselineAnswers, answers)
          matchCount = comparison.matches
          mismatchQuestions = comparison.mismatches.map((index) => index + 1)
        }

        let status: LabResultStatus = 'fail'
        if (result.sucesso && result.qr && ambiguousCount === 0 && emptyCount <= 1) {
          status = 'ok'
        } else if (result.sucesso) {
          status = 'warning'
        }

        if (matchCount != null && baselineAnswers && baselineAnswers.length > 0) {
          const ratio = matchCount / baselineAnswers.length
          if (ratio >= 0.9 && status !== 'fail') {
            status = 'ok'
          } else if (ratio >= 0.7 && status !== 'fail') {
            status = 'warning'
          } else {
            status = 'fail'
          }
        }

        nextResults.push({
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          note: scenario.note,
          status,
          answers,
          qrText: result.qr?.raw || '',
          okCount,
          emptyCount,
          ambiguousCount,
          matchCount,
          mismatchQuestions,
          totalMs: result.telemetry?.totalMs ?? null,
          candidateCount: result.telemetry?.candidateCount ?? null,
          orientationChecks: result.telemetry?.orientationChecks ?? null,
          sourcePreviewUrl: scenarioCanvas.toDataURL('image/jpeg', 0.84),
          debugImageUrl: result.debug?.imageUrl || null,
          warnings: readableWarnings,
        })
      }

      startTransition(() => {
        setResults(nextResults)
      })
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Falha ao rodar a bateria local.')
    } finally {
      setIsRunning(false)
    }
  }

  function exportJson() {
    const payload = {
      imageName,
      createdAt: new Date().toISOString(),
      numQuestions,
      numAlternatives,
      expectedProvaId: expectedProvaId || null,
      useManualBaseline,
      manualBaseline: useManualBaseline ? manualBaseline : null,
      results,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'omr-lab-report.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Laboratorio OMR</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">
                Carregue uma foto real do cartao, gere cenarios artificiais e rode o mesmo motor
                de leitura do sistema em lote. A comparacao usa a imagem base como referencia
                ou um gabarito manual, para descobrirmos o que quebra sem depender do celular.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm">
              <div className="text-slate-500">Motor</div>
              <div className="mt-1 font-medium text-slate-100">
                {loadingEngine ? 'Carregando...' : engineReady ? 'Pronto' : 'Falhou'}
              </div>
              {engineError && <div className="mt-2 max-w-xs text-xs text-rose-300">{engineError}</div>}
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <label className="block text-sm font-medium text-slate-200">Foto base</label>
                <input
                  data-testid="lab-file-input"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="mt-3 block w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-slate-200"
                />
                {imageName && (
                  <div className="mt-3 text-xs text-slate-400">
                    Arquivo: <span className="font-medium text-slate-200">{imageName}</span>
                  </div>
                )}
                {sourcePreviewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sourcePreviewUrl}
                    alt="Imagem base do laboratorio OMR"
                    className="mt-4 w-full rounded-xl border border-slate-800"
                  />
                )}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <div className="mb-1 text-slate-300">Questoes</div>
                    <input
                      type="number"
                      min={1}
                      max={80}
                      value={numQuestions}
                      onChange={(event) => setNumQuestions(Number(event.target.value || 10))}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="mb-1 text-slate-300">Alternativas</div>
                    <input
                      type="number"
                      min={2}
                      max={8}
                      value={numAlternatives}
                      onChange={(event) => setNumAlternatives(Number(event.target.value || 5))}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                    />
                  </label>
                </div>

                <label className="mt-3 block text-sm">
                  <div className="mb-1 text-slate-300">Prova esperada (opcional)</div>
                  <input
                    type="number"
                    value={expectedProvaId}
                    onChange={(event) => setExpectedProvaId(event.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                    placeholder="Ex.: 10"
                  />
                </label>

                <label className="mt-4 flex items-center gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={useManualBaseline}
                    onChange={(event) => setUseManualBaseline(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                  />
                  Usar baseline manual em vez da leitura da imagem base
                </label>

                <label className="mt-3 block text-sm">
                  <div className="mb-1 text-slate-300">Baseline manual</div>
                  <input
                    value={manualBaseline}
                    onChange={(event) => setManualBaseline(event.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                    placeholder="Ex.: CDBCBCCBCC"
                  />
                  <div className="mt-1 text-xs text-slate-500">
                    Use letras sem separador. Hifen representa questao vazia.
                  </div>
                </label>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    data-testid="lab-run-button"
                    type="button"
                    onClick={runBatch}
                    disabled={!engineReady || !sourcePreviewUrl || isRunning}
                    className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isRunning ? 'Rodando bateria...' : 'Rodar bateria'}
                  </button>
                  <button
                    type="button"
                    onClick={exportJson}
                    disabled={results.length === 0}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Exportar JSON
                  </button>
                </div>
                {runError && <div className="mt-3 text-sm text-rose-300">{runError}</div>}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="text-sm font-medium text-slate-200">Cenarios incluidos</div>
                <div className="mt-3 grid gap-2 text-xs text-slate-400">
                  {DEFAULT_OMR_LAB_SCENARIOS.map((scenario) => (
                    <div key={scenario.id} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                      <div className="font-medium text-slate-200">{scenario.name}</div>
                      <div className="mt-1">{scenario.note}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div
                data-testid="lab-summary"
                className="grid gap-3 sm:grid-cols-4"
              >
                {[
                  { label: 'Total', value: summary.total, tone: 'text-slate-100' },
                  { label: 'OK', value: summary.ok, tone: 'text-emerald-300' },
                  { label: 'Alerta', value: summary.warning, tone: 'text-amber-300' },
                  { label: 'Falhou', value: summary.fail, tone: 'text-rose-300' },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500">{item.label}</div>
                    <div className={`mt-2 text-3xl font-bold ${item.tone}`}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-800 text-sm">
                    <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Cenario</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">QR</th>
                        <th className="px-4 py-3">Acertos base</th>
                        <th className="px-4 py-3">Vazias</th>
                        <th className="px-4 py-3">Duplas</th>
                        <th className="px-4 py-3">Tempo</th>
                        <th className="px-4 py-3">Rotacoes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {results.map((result) => {
                        const tone =
                          result.status === 'ok'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : result.status === 'warning'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'

                        return (
                          <tr
                            key={result.scenarioId}
                            data-testid={`lab-result-row-${result.scenarioId}`}
                            className="align-top"
                          >
                            <td className="px-4 py-4">
                              <div className="font-medium text-slate-100">{result.scenarioName}</div>
                              <div className="mt-1 max-w-xs text-xs text-slate-500">{result.note}</div>
                              <details className="mt-3">
                                <summary className="cursor-pointer text-xs text-indigo-300">Ver detalhes</summary>
                                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                                  <div>
                                    <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Cenario</div>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={result.sourcePreviewUrl}
                                      alt={`Previa ${result.scenarioName}`}
                                      className="w-full rounded-xl border border-slate-800"
                                    />
                                  </div>
                                  <div>
                                    <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Diagnostico</div>
                                    {result.debugImageUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={result.debugImageUrl}
                                        alt={`Diagnostico ${result.scenarioName}`}
                                        className="w-full rounded-xl border border-slate-800"
                                      />
                                    ) : (
                                      <div className="rounded-xl border border-dashed border-slate-800 px-4 py-10 text-center text-xs text-slate-500">
                                        Diagnostico indisponivel
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
                                    <div className="font-medium text-slate-100">Respostas</div>
                                    <div className="mt-2 font-mono">{answersToCompactString(result.answers)}</div>
                                    {result.mismatchQuestions.length > 0 && (
                                      <div className="mt-2 text-amber-300">
                                        Divergencias: {result.mismatchQuestions.join(', ')}
                                      </div>
                                    )}
                                  </div>
                                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
                                    <div className="font-medium text-slate-100">Alertas</div>
                                    <div className="mt-2 space-y-1">
                                      {result.warnings.length > 0 ? (
                                        result.warnings.slice(0, 8).map((warning) => (
                                          <div key={warning}>{warning}</div>
                                        ))
                                      ) : (
                                        <div>Nenhum alerta relevante.</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </details>
                            </td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
                                {result.status === 'ok' ? 'OK' : result.status === 'warning' ? 'Alerta' : 'Falhou'}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-slate-300">
                              {result.qrText ? 'Lido' : 'Nao'}
                            </td>
                            <td className="px-4 py-4 text-slate-300">
                              {result.matchCount == null ? '-' : result.matchCount}
                            </td>
                            <td className="px-4 py-4 text-slate-300">{result.emptyCount}</td>
                            <td className="px-4 py-4 text-slate-300">{result.ambiguousCount}</td>
                            <td className="px-4 py-4 text-slate-300">
                              {result.totalMs == null ? '-' : `${Math.round(result.totalMs)} ms`}
                            </td>
                            <td className="px-4 py-4 text-slate-300">
                              {result.orientationChecks == null ? '-' : result.orientationChecks}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {results.length === 0 && (
                  <div className="px-6 py-12 text-center text-sm text-slate-500">
                    Carregue uma imagem base e rode a bateria para ver o relatorio.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
