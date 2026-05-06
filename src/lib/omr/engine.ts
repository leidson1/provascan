/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Motor OMR v3.0 - Leitura Óptica de Marcações
 * Portado fielmente de OMR.html (sistema GAS original)
 * Abordagem progressiva: tenta rápido primeiro, escala se falhar
 */

import { CARTAO, calcPosicoesBolhas, calcPosicoesBolhasMista, type BubblePosition } from './card-layout'

// ── Types ──────────────────────────────────────────────────

export interface OMRResult {
  sucesso: boolean
  mensagem?: string
  qr?: { provaId: number; alunoId?: number | null; reserva?: string; raw?: string }
  respostas?: OMRResposta[]
  confianca?: number[]
  debug?: { imageUrl: string; levels: DebugLevel[] }
  telemetry?: OMRTelemetry
}

export interface OMRTelemetry {
  deviceTier: 'low' | 'balanced' | 'high'
  totalMs: number
  preprocessMs: number
  pageDetectMs: number
  markerDetectMs: number
  analysisMs: number
  qrMs: number
  bubbleMs: number
  debugMs: number
  candidateCount: number
  orientationChecks: number
  fastPathUsed: boolean
  selectedSource: 'page' | 'markers' | 'unknown'
}

export interface OMRResposta {
  questao: number
  marcada: string | null
  confianca: number
  status: 'ok' | 'vazia' | 'ambigua'
  niveis: number[]
}

interface DebugLevel {
  q: number
  niveis: number[]
  marcada: string
  status: string
}

type ParsedQRData = { provaId: number; alunoId: number | null; reserva?: string; raw: string } | null
type DeviceTier = 'low' | 'balanced' | 'high'

export interface OMRProcessOptions {
  deviceTier?: DeviceTier
}

interface WarpAnalysisTelemetry {
  analysisMs: number
  qrMs: number
  bubbleMs: number
  debugMs: number
}

interface OrientationAnalysisTelemetry extends WarpAnalysisTelemetry {
  orientationChecks: number
  fastPathUsed: boolean
  selectedSource: 'page' | 'markers' | 'unknown'
}

interface WarpedAnalysisResult {
  qr: ParsedQRData
  respostas: OMRResposta[]
  debug?: { imageUrl: string; levels: DebugLevel[] }
  score: number
  telemetry: WarpAnalysisTelemetry
}

interface OrientationAnalysisResult {
  qr: ParsedQRData
  respostas: OMRResposta[]
  debug?: { imageUrl: string; levels: DebugLevel[] }
  score: number
  telemetry: OrientationAnalysisTelemetry
}

interface Marcadores {
  tl: Ponto
  tr: Ponto
  bl: Ponto
  br: Ponto
}

interface Ponto {
  x: number
  y: number
  area?: number
  w?: number
  h?: number
}

// OpenCV.js global types (minimal declarations for what we use)
declare global {
  interface Window {
    cv: any
    jsQR: any
  }
  var cv: any
  var jsQR: any
}

// ── OMR Engine ─────────────────────────────────────────────

export class OMREngine {
  private static PX_MM = 4
  private static CARD_W = 840   // 210mm * 4
  private static CARD_H = 594   // 148.5mm * 4
  private static MIN_FILL = 0.16
  private static AMBIG_RATIO = 0.82

  private _pronto = false

  /**
   * Carrega OpenCV.js e jsQR dinamicamente.
   * Resolve quando ambas libs estão prontas.
   */
  async load(): Promise<void> {
    if (this._pronto) return

    const promises: Promise<void>[] = []

    // OpenCV.js
    if (typeof cv !== 'undefined' && cv.Mat) {
      // Already loaded
    } else {
      promises.push(
        new Promise<void>((resolve, reject) => {
          const s1 = document.createElement('script')
          s1.src = '/opencv.js'
          s1.async = true
          s1.onload = () => {
            const check = setInterval(() => {
              if (typeof cv !== 'undefined' && cv.Mat) {
                clearInterval(check)
                resolve()
              }
            }, 100)
            setTimeout(() => {
              clearInterval(check)
              reject(new Error('Timeout ao inicializar OpenCV'))
            }, 60000)
          }
          s1.onerror = () => reject(new Error('Erro ao carregar OpenCV.js'))
          document.head.appendChild(s1)
        })
      )
    }

    // jsQR
    if (window.jsQR) {
      // Already loaded
    } else {
      promises.push(
        import('jsqr').then((mod) => {
          window.jsQR = mod.default || mod
        })
      )
    }

    await Promise.all(promises)
    this._pronto = true
  }

  isReady(): boolean {
    return this._pronto
  }

  private _now(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
  }

  /**
   * Processa um canvas contendo a foto de um cartão-resposta.
   * Retorna resultado OMR com QR, respostas e debug.
   */
  process(
    canvas: HTMLCanvasElement,
    nq: number,
    nalts: number,
    tiposQuestoes?: string,
    criterioDiscursiva?: number,
    expectedProvaId?: number,
    options: OMRProcessOptions = {}
  ): OMRResult {
    const startedAt = this._now()
    const deviceTier = options.deviceTier || 'balanced'
    nq = nq || 10
    nalts = nalts || 5
    const letrasObj = ['A', 'B', 'C', 'D', 'E'].slice(0, nalts)
    const criterioLetrasMap: Record<number, string[]> = {
      2: ['C', 'E'],
      3: ['C', 'P', 'E'],
      4: ['E', 'B', 'P', 'I'],
    }
    const tipos = tiposQuestoes ? tiposQuestoes.split(',') : []
    const criterio = criterioDiscursiva || 3

    // Construir letras por questão
    const letrasPerQ: string[][] = []
    for (let q = 0; q < nq; q++) {
      if (tipos[q]?.trim() === 'D') {
        letrasPerQ.push(criterioLetrasMap[criterio] || criterioLetrasMap[3])
      } else {
        letrasPerQ.push(letrasObj)
      }
    }
    // Para compatibilidade, letras padrão (usado quando não há tipos)

    let src: any = null
    let gray: any = null
    const allMats: any[] = []
    const telemetry: OMRTelemetry = {
      deviceTier,
      totalMs: 0,
      preprocessMs: 0,
      pageDetectMs: 0,
      markerDetectMs: 0,
      analysisMs: 0,
      qrMs: 0,
      bubbleMs: 0,
      debugMs: 0,
      candidateCount: 0,
      orientationChecks: 0,
      fastPathUsed: false,
      selectedSource: 'unknown',
    }

    try {
      const preprocessStartedAt = this._now()
      src = cv.imread(canvas)
      gray = new cv.Mat()
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
      const normalizedGray = this._normalizarIluminacao(gray)
      allMats.push(normalizedGray)

      // ── Nível 1: Otsu simples (funciona 80% das vezes com foto boa) ──
      const blurred = new cv.Mat()
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
      const bin1 = new cv.Mat()
      cv.threshold(blurred, bin1, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)
      allMats.push(blurred, bin1)
      telemetry.preprocessMs = this._now() - preprocessStartedAt

      const candidatosWarp: Array<{ mat: any; source: 'page' | 'markers' }> = []

      const pageDetectStartedAt = this._now()
      const pagina = this._encontrarContornoPagina(normalizedGray) || this._encontrarContornoPagina(gray)
      telemetry.pageDetectMs = this._now() - pageDetectStartedAt
      if (pagina) {
        const paginaRefinada = this._refinarCantosSubpixel(normalizedGray, pagina)
        const paginaOrientada = this._alinharOrientacao(src, paginaRefinada, 'page')
        const warpedPagina = this._corrigirPerspectivaPagina(src, paginaOrientada)
        candidatosWarp.push({ mat: warpedPagina, source: 'page' })
        allMats.push(warpedPagina)

        const warpedPaginaDeskew = this._criarWarpDeskewSeguro(warpedPagina)
        if (warpedPaginaDeskew) {
          candidatosWarp.push({ mat: warpedPaginaDeskew, source: 'page' })
          allMats.push(warpedPaginaDeskew)
        }
      }

      const markerDetectStartedAt = this._now()
      let marcadores = this._encontrarMarcadores(bin1)

      // ── Nível 2: Adaptive threshold (iluminação irregular) ──
      if (!marcadores) {
        const bin2Raw = new cv.Mat()
        cv.adaptiveThreshold(
          normalizedGray, bin2Raw, 255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 51, 10
        )
        const bin2 = this._refinarMascaraBolhas(bin2Raw)
        bin2Raw.delete()
        allMats.push(bin2)
        marcadores = this._encontrarMarcadores(bin2)
      }

      // ── Nível 3: Normalização de iluminação + Otsu (foto ruim) ──
      if (!marcadores) {
        const bin3Raw = new cv.Mat()
        cv.threshold(normalizedGray, bin3Raw, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)
        const bin3 = this._refinarMascaraBolhas(bin3Raw)
        bin3Raw.delete()
        allMats.push(bin3)
        marcadores = this._encontrarMarcadores(bin3)
      }
      telemetry.markerDetectMs = this._now() - markerDetectStartedAt

      if (!marcadores && candidatosWarp.length === 0) {
        telemetry.totalMs = this._now() - startedAt
        return {
          sucesso: false,
          mensagem: 'Não foi possível localizar a folha. Enquadre todo o cartão com boa iluminação e contraste.',
        }
      }

      // Corrigir orientação: o cartão é paisagem (largura > altura)
      // Se os marcadores indicam retrato, rotacionar
      if (marcadores) {
        const marcadoresOrientados = this._alinharOrientacao(src, marcadores, 'markers')
        const warpedMarcadores = this._corrigirPerspectiva(src, marcadoresOrientados)
        candidatosWarp.push({ mat: warpedMarcadores, source: 'markers' })
        allMats.push(warpedMarcadores)
      }
      telemetry.candidateCount = candidatosWarp.length

      let analise: OrientationAnalysisResult | null = null
      for (let idx = 0; idx < candidatosWarp.length; idx++) {
        const candidatoWarp = candidatosWarp[idx]
        const tentativa = this._analisarMelhorOrientacao(
          candidatoWarp.mat,
          nq,
          nalts,
          letrasPerQ,
          tiposQuestoes,
          criterioDiscursiva,
          expectedProvaId
        )
        if (!analise || tentativa.score > analise.score) {
          analise = {
            ...tentativa,
            telemetry: {
              ...tentativa.telemetry,
              selectedSource: candidatoWarp.source,
            },
          }
        }

        if (deviceTier === 'low' && this._atingiuScoreConfiavel(tentativa, nq, expectedProvaId)) {
          analise = {
            ...tentativa,
            telemetry: {
              ...tentativa.telemetry,
              selectedSource: candidatoWarp.source,
              fastPathUsed:
                tentativa.telemetry.fastPathUsed || idx < candidatosWarp.length - 1,
            },
          }
          break
        }
      }

      if (!analise) {
        telemetry.totalMs = this._now() - startedAt
        return {
          sucesso: false,
          mensagem: 'Falha ao analisar a folha capturada.',
          telemetry,
        }
      }

      telemetry.analysisMs = analise.telemetry.analysisMs
      telemetry.qrMs = analise.telemetry.qrMs
      telemetry.bubbleMs = analise.telemetry.bubbleMs
      telemetry.debugMs = analise.telemetry.debugMs
      telemetry.orientationChecks = analise.telemetry.orientationChecks
      telemetry.fastPathUsed = analise.telemetry.fastPathUsed
      telemetry.selectedSource = analise.telemetry.selectedSource
      telemetry.totalMs = this._now() - startedAt

      return {
        sucesso: true,
        qr: analise.qr ?? undefined,
        respostas: analise.respostas,
        confianca: analise.respostas.map((r) => r.confianca),
        debug: analise.debug,
        telemetry,
      }
    } catch (e: unknown) {
      telemetry.totalMs = this._now() - startedAt
      return {
        sucesso: false,
        mensagem: 'Erro no processamento: ' + (e instanceof Error ? e.message : String(e)),
        telemetry,
      }
    } finally {
      if (src) src.delete()
      if (gray) gray.delete()
      for (const m of allMats) {
        if (m) m.delete()
      }
    }
  }

  // ── NORMALIZAÇÃO DE ILUMINAÇÃO (leve, sem CLAHE pesado) ────

  private _analisarWarped(
    warped: any,
    nq: number,
    nalts: number,
    letrasPerQ: string[][],
    tiposQuestoes?: string,
    criterioDiscursiva?: number,
    expectedProvaId?: number,
    includeDebug = true
  ): WarpedAnalysisResult {
    const analysisStartedAt = this._now()
    const qrStartedAt = this._now()
    const qr = this._lerQRProgressivo(warped)
    const qrMs = this._now() - qrStartedAt
    const wGray = new cv.Mat()

    try {
      const bubbleStartedAt = this._now()
      cv.cvtColor(warped, wGray, cv.COLOR_RGBA2GRAY)
      const respostas = this._lerBolhasMista(wGray, nq, nalts, letrasPerQ, tiposQuestoes, criterioDiscursiva)
      const bubbleMs = this._now() - bubbleStartedAt
      const structuralScore = this._pontuarEstruturaEsperada(wGray, nq, nalts, tiposQuestoes, criterioDiscursiva)

      let debug: { imageUrl: string; levels: DebugLevel[] } | undefined
      let debugMs = 0
      if (includeDebug) {
        const debugStartedAt = this._now()
        try {
          debug = this._gerarDebugMista(warped, wGray, nq, nalts, respostas, tiposQuestoes, criterioDiscursiva)
        } catch {
          // debug falhou, ignora
        } finally {
          debugMs = this._now() - debugStartedAt
        }
      }

      return {
        qr,
        respostas,
        debug,
        score: this._pontuarAnalise(qr, respostas, expectedProvaId) + structuralScore,
        telemetry: {
          analysisMs: this._now() - analysisStartedAt,
          qrMs,
          bubbleMs,
          debugMs,
        },
      }
    } finally {
      wGray.delete()
    }
  }

  private _analisarMelhorOrientacao(
    warped: any,
    nq: number,
    nalts: number,
    letrasPerQ: string[][],
    tiposQuestoes?: string,
    criterioDiscursiva?: number,
    expectedProvaId?: number
  ): OrientationAnalysisResult {
    const orientacoes = [
      { mat: warped, owns: false },
      { mat: this._rotacionar90Horario(warped), owns: true },
      { mat: this._rotacionar180(warped), owns: true },
      { mat: this._rotacionar90AntiHorario(warped), owns: true },
    ]

    const telemetry: OrientationAnalysisTelemetry = {
      analysisMs: 0,
      qrMs: 0,
      bubbleMs: 0,
      debugMs: 0,
      orientationChecks: 0,
      fastPathUsed: false,
      selectedSource: 'unknown',
    }
    let melhor: WarpedAnalysisResult | null = null
    let melhorFinal: OrientationAnalysisResult | null = null
    let melhorOrientacao = 0

    try {
      for (let idx = 0; idx < orientacoes.length; idx++) {
        const orientacao = orientacoes[idx]
        const analise = this._analisarWarped(
          orientacao.mat,
          nq,
          nalts,
          letrasPerQ,
          tiposQuestoes,
          criterioDiscursiva,
          expectedProvaId,
          false
        )
        telemetry.analysisMs += analise.telemetry.analysisMs
        telemetry.qrMs += analise.telemetry.qrMs
        telemetry.bubbleMs += analise.telemetry.bubbleMs
        telemetry.debugMs += analise.telemetry.debugMs
        telemetry.orientationChecks += 1
        if (!melhor || analise.score > melhor.score) {
          melhor = analise
          melhorOrientacao = idx
        }

        if (this._atingiuScoreConfiavel(analise, nq, expectedProvaId)) {
          melhor = analise
          melhorOrientacao = idx
          telemetry.fastPathUsed = idx < orientacoes.length - 1
          break
        }
      }

      const melhorComDebug = this._analisarWarped(
        orientacoes[melhorOrientacao].mat,
        nq,
        nalts,
        letrasPerQ,
        tiposQuestoes,
        criterioDiscursiva,
        expectedProvaId,
        true
      )
      telemetry.analysisMs += melhorComDebug.telemetry.analysisMs
      telemetry.qrMs += melhorComDebug.telemetry.qrMs
      telemetry.bubbleMs += melhorComDebug.telemetry.bubbleMs
      telemetry.debugMs += melhorComDebug.telemetry.debugMs
      melhorFinal = {
        ...melhorComDebug,
        telemetry,
      }
    } finally {
      for (const orientacao of orientacoes) {
        if (orientacao.owns) {
          orientacao.mat.delete()
        }
      }
    }

    return melhorFinal!
  }

  private _atingiuScoreConfiavel(
    analise: {
      qr: ParsedQRData
      respostas: OMRResposta[]
      score: number
    },
    nq: number,
    expectedProvaId?: number
  ): boolean {
    if (!analise.qr) return false
    if (expectedProvaId != null && analise.qr.provaId !== expectedProvaId) return false

    let ok = 0
    let ambiguas = 0
    for (const resposta of analise.respostas) {
      if (resposta.status === 'ok') ok++
      else if (resposta.status === 'ambigua') ambiguas++
    }

    return ok >= Math.max(1, Math.floor(nq * 0.8)) && ambiguas === 0
  }

  private _pontuarAnalise(
    qr: ParsedQRData,
    respostas: OMRResposta[],
    expectedProvaId?: number
  ): number {
    let score = 0

    if (qr) {
      score += 1000
      if (expectedProvaId != null) {
        score += qr.provaId === expectedProvaId ? 2000 : -250
      }
    }

    for (const resposta of respostas) {
      if (resposta.status === 'ok') {
        score += 25 + resposta.confianca
      } else if (resposta.status === 'ambigua') {
        score += 4
      } else {
        score -= 6
      }
    }

    return score
  }

  private _pontuarEstruturaEsperada(
    wGray: any,
    nq: number,
    nalts: number,
    tiposQuestoes?: string,
    criterioDiscursiva?: number
  ): number {
    const px = OMREngine.PX_MM
    const posicoes = calcPosicoesBolhasMista(nq, nalts, tiposQuestoes, criterioDiscursiva)
    const qrMargin = Math.round(4 * px)
    const qrRect = new cv.Rect(
      Math.max(0, Math.round((CARTAO.qrX - qrMargin / px) * px)),
      Math.max(0, Math.round((CARTAO.qrY - qrMargin / px) * px)),
      Math.min(wGray.cols, Math.round((CARTAO.qrTamanho + qrMargin * 2 / px) * px)),
      Math.min(wGray.rows, Math.round((CARTAO.qrTamanho + qrMargin * 2 / px) * px))
    )

    const raio = Math.round(CARTAO.bolhaRaio * px * 1.3)
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = 0
    let maxY = 0

    for (const linha of posicoes) {
      for (const bolha of linha) {
        const cx = Math.round(bolha.cx * px)
        const cy = Math.round(bolha.cy * px)
        minX = Math.min(minX, cx - raio)
        minY = Math.min(minY, cy - raio)
        maxX = Math.max(maxX, cx + raio)
        maxY = Math.max(maxY, cy + raio)
      }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return 0

    const gridRect = new cv.Rect(
      Math.max(0, minX),
      Math.max(0, minY),
      Math.max(1, Math.min(wGray.cols - Math.max(0, minX), maxX - Math.max(0, minX))),
      Math.max(1, Math.min(wGray.rows - Math.max(0, minY), maxY - Math.max(0, minY)))
    )

    const normalized = this._normalizarIluminacao(wGray)
    const bin = new cv.Mat()

    try {
      cv.threshold(normalized, bin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)
      const qrDensity = this._densidadeRegiao(bin, qrRect)
      const gridDensity = this._densidadeRegiao(bin, gridRect)

      const qrScore = this._pontuarDensidadeAlvo(qrDensity, 0.34, 0.26, 180)
      const gridScore = this._pontuarDensidadeAlvo(gridDensity, 0.15, 0.11, 240)

      return qrScore + gridScore
    } finally {
      normalized.delete()
      bin.delete()
    }
  }

  private _densidadeRegiao(matBin: any, rect: any): number {
    const x = Math.max(0, Math.min(matBin.cols - 1, rect.x))
    const y = Math.max(0, Math.min(matBin.rows - 1, rect.y))
    const w = Math.max(1, Math.min(rect.width, matBin.cols - x))
    const h = Math.max(1, Math.min(rect.height, matBin.rows - y))

    let roi: any = null
    try {
      roi = matBin.roi(new cv.Rect(x, y, w, h))
      return cv.countNonZero(roi) / (w * h)
    } finally {
      if (roi) roi.delete()
    }
  }

  private _pontuarDensidadeAlvo(densidade: number, alvo: number, tolerancia: number, maxScore: number): number {
    const desvio = Math.abs(densidade - alvo)
    if (desvio >= tolerancia) return 0
    return maxScore * (1 - desvio / tolerancia)
  }

  private _rotacionar180(src: any): any {
    const rotated = new cv.Mat()
    cv.flip(src, rotated, -1)
    return rotated
  }

  private _rotacionar90Horario(src: any): any {
    const rotated = new cv.Mat()

    if (typeof cv.rotate === 'function' && typeof cv.ROTATE_90_CLOCKWISE !== 'undefined') {
      cv.rotate(src, rotated, cv.ROTATE_90_CLOCKWISE)
      return rotated
    }

    const transposed = new cv.Mat()
    cv.transpose(src, transposed)
    cv.flip(transposed, rotated, 1)
    transposed.delete()
    return rotated
  }

  private _rotacionar90AntiHorario(src: any): any {
    const rotated = new cv.Mat()

    if (typeof cv.rotate === 'function' && typeof cv.ROTATE_90_COUNTERCLOCKWISE !== 'undefined') {
      cv.rotate(src, rotated, cv.ROTATE_90_COUNTERCLOCKWISE)
      return rotated
    }

    const transposed = new cv.Mat()
    cv.transpose(src, transposed)
    cv.flip(transposed, rotated, 0)
    transposed.delete()
    return rotated
  }

  private _normalizarIluminacao(gray: any): any {
    const bg = new cv.Mat()
    cv.GaussianBlur(gray, bg, new cv.Size(51, 51), 0)

    const floatGray = new cv.Mat()
    const floatBg = new cv.Mat()
    gray.convertTo(floatGray, cv.CV_32F)
    bg.convertTo(floatBg, cv.CV_32F)

    // Evitar divisão por zero
    const ones = new cv.Mat(floatBg.rows, floatBg.cols, cv.CV_32F, new cv.Scalar(1))
    cv.max(floatBg, ones, floatBg)
    ones.delete()

    const normalized = new cv.Mat()
    cv.divide(floatGray, floatBg, normalized)

    const result = new cv.Mat()
    normalized.convertTo(result, cv.CV_8U, 200, 0)

    const stretched = new cv.Mat()
    cv.normalize(result, stretched, 0, 255, cv.NORM_MINMAX)

    const localContrast = this._aplicarClahe(stretched)
    const gammaCorrected = this._ajustarGamma(localContrast, 0.92)
    const softened = new cv.Mat()
    cv.GaussianBlur(gammaCorrected, softened, new cv.Size(3, 3), 0)

    const finalResult = new cv.Mat()
    cv.addWeighted(gammaCorrected, 1.15, softened, -0.15, 0, finalResult)

    bg.delete()
    floatGray.delete()
    floatBg.delete()
    normalized.delete()
    result.delete()
    stretched.delete()
    localContrast.delete()
    gammaCorrected.delete()
    softened.delete()

    return finalResult
  }

  private _aplicarClahe(gray: any): any {
    if (typeof cv.createCLAHE !== 'function') {
      return gray.clone()
    }

    const clahe = cv.createCLAHE(2.5, new cv.Size(8, 8))
    const result = new cv.Mat()
    try {
      clahe.apply(gray, result)
      return result
    } finally {
      clahe.delete()
    }
  }

  private _ajustarGamma(gray: any, gamma: number): any {
    const floatGray = new cv.Mat()
    gray.convertTo(floatGray, cv.CV_32F, 1 / 255, 0)

    const correctedFloat = new cv.Mat()
    cv.pow(floatGray, gamma, correctedFloat)

    const corrected = new cv.Mat()
    correctedFloat.convertTo(corrected, cv.CV_8U, 255, 0)

    floatGray.delete()
    correctedFloat.delete()

    return corrected
  }

  private _prepararCinzaBolhas(wGray: any): any {
    const normalized = this._normalizarIluminacao(wGray)
    const prepared = new cv.Mat()
    cv.GaussianBlur(normalized, prepared, new cv.Size(3, 3), 0)
    normalized.delete()
    return prepared
  }

  private _realcarMarcasBolhas(gray: any): any {
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(11, 11))
    const blackhat = new cv.Mat()
    const boosted = new cv.Mat()
    const softened = new cv.Mat()

    cv.morphologyEx(gray, blackhat, cv.MORPH_BLACKHAT, kernel)
    cv.normalize(blackhat, boosted, 0, 255, cv.NORM_MINMAX)
    cv.GaussianBlur(boosted, softened, new cv.Size(3, 3), 0)

    kernel.delete()
    blackhat.delete()
    boosted.delete()

    return softened
  }

  private _criarMascaraBolhas(
    gray: any,
    adaptiveMethod: number,
    blockSize: number,
    c: number
  ): any {
    const bin = new cv.Mat()
    cv.adaptiveThreshold(
      gray,
      bin,
      255,
      adaptiveMethod,
      cv.THRESH_BINARY_INV,
      blockSize,
      c
    )

    const refined = this._refinarMascaraBolhas(bin)
    bin.delete()
    return refined
  }

  private _refinarMascaraBolhas(matBin: any): any {
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3))
    const opened = new cv.Mat()
    const refined = new cv.Mat()

    cv.morphologyEx(matBin, opened, cv.MORPH_OPEN, kernel)
    cv.morphologyEx(opened, refined, cv.MORPH_CLOSE, kernel)

    kernel.delete()
    opened.delete()

    return refined
  }

  // ── DETECÇÃO DE MARCADORES ────────────────────────────────

  private _encontrarContornoPagina(gray: any): Marcadores | null {
    const blurred = new cv.Mat()
    const bin = new cv.Mat()
    const closed = new cv.Mat()
    const contours = new cv.MatVector()
    const hierarchy = new cv.Mat()
    let kernel: any = null
    let best: Marcadores | null = null
    let bestScore = Infinity

    try {
      cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 0)
      cv.threshold(blurred, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
      kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9))
      cv.morphologyEx(bin, closed, cv.MORPH_CLOSE, kernel)
      cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

      const imgArea = gray.rows * gray.cols
      const targetRatio = CARTAO.largura / CARTAO.altura
      const imgDiag = Math.hypot(gray.cols, gray.rows)

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i)
        const area = Math.abs(cv.contourArea(cnt))
        const relArea = area / imgArea
        if (relArea < 0.18 || relArea > 0.98) {
          cnt.delete()
          continue
        }

        const perimeter = cv.arcLength(cnt, true)
        const points = this._aproximarQuadrilatero(cnt, perimeter)
        cnt.delete()
        if (!points) continue

        const ord = this._ordenarPontos(points)
        if (!ord) continue

        const wTop = Math.hypot(ord.tr.x - ord.tl.x, ord.tr.y - ord.tl.y)
        const wBottom = Math.hypot(ord.br.x - ord.bl.x, ord.br.y - ord.bl.y)
        const hLeft = Math.hypot(ord.bl.x - ord.tl.x, ord.bl.y - ord.tl.y)
        const hRight = Math.hypot(ord.br.x - ord.tr.x, ord.br.y - ord.tr.y)
        const avgW = (wTop + wBottom) / 2
        const avgH = (hLeft + hRight) / 2

        if (avgW < gray.cols * 0.35 || avgH < gray.rows * 0.35) continue

        const normalizedRatio = Math.max(avgW / Math.max(avgH, 1), avgH / Math.max(avgW, 1))
        const ratioError = Math.abs(normalizedRatio - targetRatio)
        if (ratioError > 0.65) continue

        const cornerPenalty = (
          Math.hypot(ord.tl.x, ord.tl.y) +
          Math.hypot(gray.cols - ord.tr.x, ord.tr.y) +
          Math.hypot(ord.bl.x, gray.rows - ord.bl.y) +
          Math.hypot(gray.cols - ord.br.x, gray.rows - ord.br.y)
        ) / (imgDiag * 4)

        const symmetryPenalty = Math.abs(wTop - wBottom) / Math.max(avgW, 1)
          + Math.abs(hLeft - hRight) / Math.max(avgH, 1)

        const score = ratioError * 4 + symmetryPenalty * 2 + cornerPenalty - relArea * 1.5
        if (score < bestScore) {
          bestScore = score
          best = ord
        }
      }
    } finally {
      blurred.delete()
      bin.delete()
      closed.delete()
      contours.delete()
      hierarchy.delete()
      if (kernel) kernel.delete()
    }

    return best
  }

  private _encontrarMarcadores(matBin: any): Marcadores | null {
    const contours = new cv.MatVector()
    const hierarchy = new cv.Mat()
    const candidatos: Ponto[] = []

    try {
      cv.findContours(matBin, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
      const imgArea = matBin.rows * matBin.cols

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i)
        const area = cv.contourArea(cnt)
        const rect = cv.boundingRect(cnt)

        const relArea = area / imgArea
        if (relArea < 0.0001 || relArea > 0.05) {
          cnt.delete()
          continue
        }

        const aspect = rect.width / rect.height
        if (aspect < 0.4 || aspect > 2.5) {
          cnt.delete()
          continue
        }

        const solidez = area / (rect.width * rect.height)
        if (solidez < 0.55) {
          cnt.delete()
          continue
        }

        const approx = new cv.Mat()
        const epsilon = cv.arcLength(cnt, true) * 0.05
        cv.approxPolyDP(cnt, approx, epsilon, true)
        const vertices = approx.rows
        approx.delete()

        if (vertices < 4 || vertices > 8) {
          cnt.delete()
          continue
        }

        candidatos.push({
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          area,
          w: rect.width,
          h: rect.height,
        })

        cnt.delete()
      }
    } finally {
      contours.delete()
      hierarchy.delete()
    }

    if (candidatos.length < 4) return null

    const selected: Ponto[] | null = candidatos.length > 4
      ? this._selecionar4Melhores(candidatos, matBin.cols, matBin.rows)
      : candidatos

    if (!selected) return null

    return this._ordenarPontos(selected)
  }

  private _aproximarQuadrilatero(cnt: any, perimeter: number): Ponto[] | null {
    const epsilons = [0.03, 0.05, 0.08]

    for (const factor of epsilons) {
      const approx = new cv.Mat()
      try {
        cv.approxPolyDP(cnt, approx, perimeter * factor, true)
        if (approx.rows !== 4) continue

        const pontos: Ponto[] = []
        for (let i = 0; i < 4; i++) {
          const ponto = approx.intPtr(i, 0)
          pontos.push({ x: ponto[0], y: ponto[1] })
        }
        return pontos
      } finally {
        approx.delete()
      }
    }

    return null
  }

  private _selecionar4Melhores(cands: Ponto[], imgW: number, imgH: number): Ponto[] | null {
    const targetRatio = CARTAO.largura / CARTAO.altura
    let best: Ponto[] | null = null
    let bestScore = Infinity
    const imgArea = imgW * imgH
    const imgDiag = Math.hypot(imgW, imgH)

    const n = Math.min(cands.length, 12)
    cands.sort((a, b) => (b.area || 0) - (a.area || 0))
    cands = cands.slice(0, n)

    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        for (let c = b + 1; c < n; c++) {
          for (let d = c + 1; d < n; d++) {
            const pts = [cands[a], cands[b], cands[c], cands[d]]
            const ord = this._ordenarPontos(pts)
            if (!ord) continue

            const w1 = Math.hypot(ord.tr.x - ord.tl.x, ord.tr.y - ord.tl.y)
            const w2 = Math.hypot(ord.br.x - ord.bl.x, ord.br.y - ord.bl.y)
            const h1 = Math.hypot(ord.bl.x - ord.tl.x, ord.bl.y - ord.tl.y)
            const h2 = Math.hypot(ord.br.x - ord.tr.x, ord.br.y - ord.tr.y)
            const avgW = (w1 + w2) / 2
            const avgH = (h1 + h2) / 2
            if (avgH === 0) continue
            if (avgW < imgW * 0.3 || avgH < imgH * 0.3) continue

            const ratio = avgW / avgH
            const normalizedRatio = Math.max(ratio, 1 / Math.max(ratio, 0.001))
            const quadArea = this._calcularAreaQuadrilatero(ord)
            const relQuadArea = quadArea / imgArea
            if (relQuadArea < 0.12) continue

            let score = Math.abs(normalizedRatio - targetRatio)
            score += Math.abs(w1 - w2) / Math.max(w1, w2)
            score += Math.abs(h1 - h2) / Math.max(h1, h2)

            const areas = [
              cands[a].area || 0,
              cands[b].area || 0,
              cands[c].area || 0,
              cands[d].area || 0,
            ]
            const maxA = Math.max(...areas)
            const minA = Math.min(...areas)
            if (maxA > 0) score += (1 - minA / maxA) * 2

            const cornerPenalty = (
              Math.hypot(ord.tl.x, ord.tl.y) +
              Math.hypot(imgW - ord.tr.x, ord.tr.y) +
              Math.hypot(ord.bl.x, imgH - ord.bl.y) +
              Math.hypot(imgW - ord.br.x, imgH - ord.br.y)
            ) / (imgDiag * 4)
            score += cornerPenalty * 1.4
            score -= relQuadArea * 0.75

            if (score < bestScore) {
              bestScore = score
              best = pts
            }
          }
        }
      }
    }

    return best
  }

  private _calcularAreaQuadrilatero(ord: Marcadores): number {
    const pontos = [ord.tl, ord.tr, ord.br, ord.bl]
    let area = 0

    for (let i = 0; i < pontos.length; i++) {
      const atual = pontos[i]
      const proximo = pontos[(i + 1) % pontos.length]
      area += atual.x * proximo.y - proximo.x * atual.y
    }

    return Math.abs(area) / 2
  }

  private _ordenarPontos(pts: Ponto[]): Marcadores | null {
    if (!pts || pts.length !== 4) return null

    const sorted = pts.slice().sort((a, b) => (a.x + a.y) - (b.x + b.y))
    const tl = sorted[0]
    const br = sorted[3]

    const mid = [sorted[1], sorted[2]]
    let tr: Ponto, bl: Ponto
    if ((mid[0].x - mid[0].y) > (mid[1].x - mid[1].y)) {
      tr = mid[0]
      bl = mid[1]
    } else {
      tr = mid[1]
      bl = mid[0]
    }

    return { tl, tr, bl, br }
  }

  // ── CORREÇÃO DE PERSPECTIVA ─────────────────────────────────

  private _refinarCantosSubpixel(gray: any, cantos: Marcadores): Marcadores {
    if (
      typeof cv.cornerSubPix !== 'function' ||
      typeof cv.TermCriteria !== 'function' ||
      typeof cv.CV_32FC2 === 'undefined'
    ) {
      return cantos
    }

    const limitar = (valor: number, maximo: number) => Math.min(Math.max(valor, 0), Math.max(0, maximo))
    const pontosOriginais = [cantos.tl, cantos.tr, cantos.bl, cantos.br]
    const corners = cv.matFromArray(4, 1, cv.CV_32FC2, [
      limitar(cantos.tl.x, gray.cols - 1), limitar(cantos.tl.y, gray.rows - 1),
      limitar(cantos.tr.x, gray.cols - 1), limitar(cantos.tr.y, gray.rows - 1),
      limitar(cantos.bl.x, gray.cols - 1), limitar(cantos.bl.y, gray.rows - 1),
      limitar(cantos.br.x, gray.cols - 1), limitar(cantos.br.y, gray.rows - 1),
    ])

    try {
      const termType = (cv.TermCriteria_EPS || 2) + (cv.TermCriteria_MAX_ITER || 1)
      const criteria = new cv.TermCriteria(termType, 30, 0.01)
      cv.cornerSubPix(gray, corners, new cv.Size(11, 11), new cv.Size(-1, -1), criteria)

      const refinados: Ponto[] = []
      for (let i = 0; i < 4; i++) {
        const ponto = corners.floatPtr(i, 0)
        refinados.push({
          x: limitar(ponto[0], gray.cols - 1),
          y: limitar(ponto[1], gray.rows - 1),
        })
      }

      const ordenados = this._ordenarPontos(refinados)
      if (!ordenados) return cantos

      const pontosRefinados = [ordenados.tl, ordenados.tr, ordenados.bl, ordenados.br]
      const maxShift = Math.max(12, Math.min(gray.cols, gray.rows) * 0.035)
      for (let i = 0; i < 4; i++) {
        const shift = Math.hypot(
          pontosRefinados[i].x - pontosOriginais[i].x,
          pontosRefinados[i].y - pontosOriginais[i].y
        )
        if (shift > maxShift) return cantos
      }

      const areaOriginal = this._calcularAreaQuadrilatero(cantos)
      const areaRefinada = this._calcularAreaQuadrilatero(ordenados)
      if (
        areaOriginal <= 0 ||
        areaRefinada < areaOriginal * 0.85 ||
        areaRefinada > areaOriginal * 1.15
      ) {
        return cantos
      }

      return ordenados
    } catch {
      return cantos
    } finally {
      corners.delete()
    }
  }

  private _rotacionar90Cantos(cantos: Marcadores): Marcadores {
    return { tl: cantos.bl, tr: cantos.tl, bl: cantos.br, br: cantos.tr }
  }

  private _rotacionar180Cantos(cantos: Marcadores): Marcadores {
    return { tl: cantos.br, tr: cantos.bl, bl: cantos.tr, br: cantos.tl }
  }

  private _alinharOrientacao(
    src: any,
    cantos: Marcadores,
    modo: 'markers' | 'page'
  ): Marcadores {
    let alinhados = cantos

    const wTop = Math.hypot(
      alinhados.tr.x - alinhados.tl.x,
      alinhados.tr.y - alinhados.tl.y
    )
    const hLeft = Math.hypot(
      alinhados.bl.x - alinhados.tl.x,
      alinhados.bl.y - alinhados.tl.y
    )

    if (hLeft > wTop * 1.15) {
      alinhados = this._rotacionar90Cantos(alinhados)
    }

    try {
      const testWarped = modo === 'page'
        ? this._corrigirPerspectivaPagina(src, alinhados)
        : this._corrigirPerspectiva(src, alinhados)
      const testGray = new cv.Mat()
      const testBin = new cv.Mat()
      cv.cvtColor(testWarped, testGray, cv.COLOR_RGBA2GRAY)
      cv.threshold(testGray, testBin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)

      const px = OMREngine.PX_MM
      const qrRegion = { x: Math.round(10 * px), y: Math.round(20 * px), w: Math.round(26 * px), h: Math.round(26 * px) }
      const rx = Math.max(0, qrRegion.x)
      const ry = Math.max(0, qrRegion.y)
      const rw = Math.min(qrRegion.w, testBin.cols - rx)
      const rh = Math.min(qrRegion.h, testBin.rows - ry)

      if (rw > 0 && rh > 0) {
        const roiTL = testBin.roi(new cv.Rect(rx, ry, rw, rh))
        const densidadeTL = cv.countNonZero(roiTL) / (rw * rh)
        roiTL.delete()

        const brx = Math.max(0, testBin.cols - rx - rw)
        const bry = Math.max(0, testBin.rows - ry - rh)
        const brw = Math.min(rw, testBin.cols - brx)
        const brh = Math.min(rh, testBin.rows - bry)

        if (brw > 0 && brh > 0) {
          const roiBR = testBin.roi(new cv.Rect(brx, bry, brw, brh))
          const densidadeBR = cv.countNonZero(roiBR) / (brw * brh)
          roiBR.delete()

          if (densidadeBR > densidadeTL * 1.5 && densidadeBR > 0.15) {
            alinhados = this._rotacionar180Cantos(alinhados)
          }
        }
      }

      testBin.delete()
      testGray.delete()
      testWarped.delete()
    } catch {
      // Mantemos a orientação atual se a heurística falhar.
    }

    return alinhados
  }

  private _corrigirPerspectiva(src: any, m: Marcadores): any {
    const C = CARTAO
    const px = OMREngine.PX_MM

    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      m.tl.x, m.tl.y, m.tr.x, m.tr.y, m.bl.x, m.bl.y, m.br.x, m.br.y,
    ])

    const mc = C.margem + C.marcador / 2
    const rc = C.largura - C.margem - C.marcador / 2
    const bc = C.altura - C.margem - C.marcador / 2

    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      mc * px, mc * px, rc * px, mc * px, mc * px, bc * px, rc * px, bc * px,
    ])

    const M = cv.getPerspectiveTransform(srcPts, dstPts)
    const warped = new cv.Mat()
    cv.warpPerspective(
      src,
      warped,
      M,
      new cv.Size(OMREngine.CARD_W, OMREngine.CARD_H),
      cv.INTER_CUBIC,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255)
    )

    srcPts.delete()
    dstPts.delete()
    M.delete()

    return warped
  }

  // ── LEITURA DE QR PROGRESSIVA ─────────────────────────────

  private _corrigirPerspectivaPagina(src: any, pagina: Marcadores): any {
    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      pagina.tl.x, pagina.tl.y, pagina.tr.x, pagina.tr.y, pagina.bl.x, pagina.bl.y, pagina.br.x, pagina.br.y,
    ])

    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      OMREngine.CARD_W - 1, 0,
      0, OMREngine.CARD_H - 1,
      OMREngine.CARD_W - 1, OMREngine.CARD_H - 1,
    ])

    const M = cv.getPerspectiveTransform(srcPts, dstPts)
    const warped = new cv.Mat()
    cv.warpPerspective(
      src,
      warped,
      M,
      new cv.Size(OMREngine.CARD_W, OMREngine.CARD_H),
      cv.INTER_CUBIC,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255)
    )

    srcPts.delete()
    dstPts.delete()
    M.delete()

    return warped
  }

  private _criarWarpDeskewSeguro(warped: any): any | null {
    try {
      const angle = this._estimarCorrecaoDeskew(warped)
      if (angle == null) return null
      return this._rotacionarGraus(warped, angle)
    } catch {
      return null
    }
  }

  private _estimarCorrecaoDeskew(warped: any): number | null {
    if (typeof cv.HoughLinesP !== 'function') return null

    const gray = new cv.Mat()
    const normalized = new cv.Mat()
    const edges = new cv.Mat()
    const lines = new cv.Mat()

    try {
      cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY)
      const prepared = this._normalizarIluminacao(gray)
      prepared.copyTo(normalized)
      prepared.delete()

      cv.Canny(normalized, edges, 50, 150, 3, false)
      cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 70, Math.round(Math.min(warped.cols, warped.rows) * 0.18), 18)

      if (lines.rows < 3) return null

      let weightedCorrection = 0
      let totalWeight = 0
      let considered = 0
      const corrections: Array<{ correction: number; weight: number }> = []

      for (let i = 0; i < lines.rows; i++) {
        const line = lines.intPtr(i, 0)
        const dx = line[2] - line[0]
        const dy = line[3] - line[1]
        const length = Math.hypot(dx, dy)
        if (length < Math.min(warped.cols, warped.rows) * 0.18) continue

        let theta = Math.atan2(dy, dx) * 180 / Math.PI
        if (theta < 0) theta += 180

        let correction: number | null = null
        if (theta <= 12 || theta >= 168) {
          correction = theta >= 90 ? 180 - theta : -theta
        } else if (Math.abs(theta - 90) <= 12) {
          correction = 90 - theta
        }

        if (correction == null) continue

        corrections.push({ correction, weight: length })
        weightedCorrection += correction * length
        totalWeight += length
        considered += 1
      }

      if (considered < 3 || totalWeight <= 0) return null

      const averageCorrection = weightedCorrection / totalWeight
      if (Math.abs(averageCorrection) < 0.35 || Math.abs(averageCorrection) > 7.5) {
        return null
      }

      let weightedDeviation = 0
      for (const item of corrections) {
        weightedDeviation += Math.abs(item.correction - averageCorrection) * item.weight
      }
      const averageDeviation = weightedDeviation / totalWeight
      if (averageDeviation > 2.4) return null

      return averageCorrection
    } catch {
      return null
    } finally {
      gray.delete()
      normalized.delete()
      edges.delete()
      lines.delete()
    }
  }

  private _rotacionarGraus(src: any, angle: number): any {
    if (typeof cv.getRotationMatrix2D !== 'function' || typeof cv.warpAffine !== 'function') {
      return src.clone()
    }
    const center = new cv.Point(src.cols / 2, src.rows / 2)
    const matrix = cv.getRotationMatrix2D(center, angle, 1)
    const rotated = new cv.Mat()
    cv.warpAffine(
      src,
      rotated,
      matrix,
      new cv.Size(src.cols, src.rows),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255)
    )
    matrix.delete()
    return rotated
  }

  private _lerQRProgressivo(matWarped: any): ReturnType<typeof this._parseQRData> {
    const C = CARTAO
    const px = OMREngine.PX_MM

    // 2 regiões: precisa e ampla
    const regioes = [
      { x: C.qrX - 8, y: C.qrY - 8, w: C.qrTamanho + 16, h: C.qrTamanho + 16 },
      { x: 0, y: 0, w: C.largura * 0.45, h: C.altura * 0.5 },
    ]

    // Nível 1: Direto (foto limpa de papel)
    for (const regiao of regioes) {
      const result = this._tentarQRRegiao(matWarped, regiao, px, 'normal')
      if (result) return result
    }

    // Nível 2: Mediana (moiré de monitor/tela)
    for (const regiao of regioes) {
      const result = this._tentarQRRegiao(matWarped, regiao, px, 'median')
      if (result) return result
    }

    // Nível 3: Nitidez (foto desfocada)
    const sharpResult = this._tentarQRRegiao(matWarped, regioes[0], px, 'sharp')
    if (sharpResult) return sharpResult

    // Nível 4: Escala diferente (quebra moiré)
    for (const regiao of regioes) {
      const result = this._tentarQRRegiao(matWarped, regiao, px, 'scale15')
      if (result) return result
    }

    // Nível 5: Último recurso - região inteira + binarizado
    const fullRegion = { x: 0, y: 0, w: C.largura, h: C.altura }
    const binaryResult = this._tentarQRRegiao(matWarped, fullRegion, px, 'binary')
    if (binaryResult) return binaryResult

    return null
  }

  private _tentarQRRegiao(
    mat: any,
    area: { x: number; y: number; w: number; h: number },
    px: number,
    modo: 'normal' | 'median' | 'sharp' | 'scale15' | 'binary'
  ): ReturnType<typeof this._parseQRData> {
    const rx = Math.max(0, Math.round(area.x * px))
    const ry = Math.max(0, Math.round(area.y * px))
    const rw = Math.min(Math.round(area.w * px), mat.cols - rx)
    const rh = Math.min(Math.round(area.h * px), mat.rows - ry)
    if (rw <= 0 || rh <= 0) return null

    let roi: any = null
    const tmpMats: any[] = []

    try {
      roi = mat.roi(new cv.Rect(rx, ry, rw, rh))
      let srcMat = roi

      if (modo === 'median') {
        const med = new cv.Mat()
        cv.medianBlur(roi, med, 3)
        tmpMats.push(med)
        srcMat = med
      } else if (modo === 'sharp') {
        const blurMat = new cv.Mat()
        cv.GaussianBlur(roi, blurMat, new cv.Size(0, 0), 2)
        const sharp = new cv.Mat()
        cv.addWeighted(roi, 1.8, blurMat, -0.8, 0, sharp)
        tmpMats.push(blurMat, sharp)
        srcMat = sharp
      } else if (modo === 'scale15') {
        const nw = Math.round(roi.cols * 1.5)
        const nh = Math.round(roi.rows * 1.5)
        const scaled = new cv.Mat()
        cv.resize(roi, scaled, new cv.Size(nw, nh), 0, 0, cv.INTER_CUBIC)
        const med2 = new cv.Mat()
        cv.medianBlur(scaled, med2, 3)
        tmpMats.push(scaled, med2)
        srcMat = med2
      } else if (modo === 'binary') {
        const g = new cv.Mat()
        cv.cvtColor(roi, g, cv.COLOR_RGBA2GRAY)
        const b = new cv.Mat()
        cv.adaptiveThreshold(
          g, b, 255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 21, 5
        )
        const rgba = new cv.Mat()
        cv.cvtColor(b, rgba, cv.COLOR_GRAY2RGBA)
        tmpMats.push(g, b, rgba)
        srcMat = rgba
      }

      // Garantir resolução mínima para jsQR
      const minSide = Math.min(srcMat.cols, srcMat.rows)
      if (minSide < 300) {
        const scale = Math.ceil(300 / minSide)
        const sc = new cv.Mat()
        cv.resize(srcMat, sc, new cv.Size(srcMat.cols * scale, srcMat.rows * scale), 0, 0, cv.INTER_CUBIC)
        tmpMats.push(sc)
        srcMat = sc
      }

      return this._extrairQR(srcMat)
    } catch {
      return null
    } finally {
      if (roi) roi.delete()
      for (const m of tmpMats) {
        if (m) m.delete()
      }
    }
  }

  private _extrairQR(srcMat: any): ReturnType<typeof this._parseQRData> {
    const tmpCanvas = document.createElement('canvas')
    tmpCanvas.width = srcMat.cols
    tmpCanvas.height = srcMat.rows
    cv.imshow(tmpCanvas, srcMat)
    const ctx = tmpCanvas.getContext('2d')!
    const imgData = ctx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height)
    // Clean up canvas to avoid memory leak
    tmpCanvas.width = 0
    tmpCanvas.height = 0

    const qr = jsQR(imgData.data, imgData.width, imgData.height, {
      inversionAttempts: 'attemptBoth',
    })

    if (qr && qr.data) {
      return this._parseQRData(qr.data)
    }
    return null
  }

  private _parseQRData(
    data: string
  ): { provaId: number; alunoId: number | null; reserva?: string; raw: string } | null {
    // Formato simples: "5:42" ou reserva "5:R1"
    const parts = data.split(':')
    if (parts.length === 2 && !isNaN(Number(parts[0]))) {
      const isReserva = /^R\d+$/i.test(parts[1])
      if (isReserva) {
        return {
          provaId: parseInt(parts[0]),
          alunoId: null,
          reserva: parts[1].toUpperCase(),
          raw: data,
        }
      }
      if (!isNaN(Number(parts[1]))) {
        return {
          provaId: parseInt(parts[0]),
          alunoId: parseInt(parts[1]),
          raw: data,
        }
      }
    }

    // Formato URL: "...?page=camera&p=5&a=42"
    const match = data.match(/[?&]p=(\d+)/)
    const matchA = data.match(/[?&]a=(\d+)/)
    if (match) {
      return {
        provaId: parseInt(match[1]),
        alunoId: matchA ? parseInt(matchA[1]) : null,
        raw: data,
      }
    }

    return null
  }

  // ── LEITURA DE BOLHAS (MISTA) ─────────────────────────────

  private _lerBolhasMista(
    wGray: any,
    nq: number,
    nalts: number,
    letrasPerQ: string[][],
    tiposQuestoes?: string,
    criterioDiscursiva?: number
  ): OMRResposta[] {
    const px = OMREngine.PX_MM
    const posicoes = calcPosicoesBolhasMista(nq, nalts, tiposQuestoes, criterioDiscursiva)
    const raio = Math.round(CARTAO.bolhaRaio * px * 0.75)

    const preparedGray = this._prepararCinzaBolhas(wGray)
    const inkGray = this._realcarMarcasBolhas(preparedGray)
    try {
      const wBin1 = this._criarMascaraBolhas(preparedGray, cv.ADAPTIVE_THRESH_GAUSSIAN_C, 15, 8)
      const leitura1 = this._lerBolhasUmaVezMista(wBin1, inkGray, posicoes, nq, raio)
      wBin1.delete()

      let precisaFallback = false
      for (let q = 0; q < nq; q++) {
        let maxN = 0
        for (let a = 0; a < leitura1[q].length; a++) {
          if (leitura1[q][a] > maxN) maxN = leitura1[q][a]
        }
        if (maxN < Math.max(OMREngine.MIN_FILL * 1.2, 0.18)) {
          precisaFallback = true
          break
        }
      }

      if (!precisaFallback) {
        return this._decidirRespostasMista(leitura1, nq, letrasPerQ)
      }

      const wBin2 = this._criarMascaraBolhas(inkGray, cv.ADAPTIVE_THRESH_GAUSSIAN_C, 17, 6)
      const leitura2 = this._lerBolhasUmaVezMista(wBin2, inkGray, posicoes, nq, raio)
      wBin2.delete()

      const combinado = this._combinarLeiturasBolhas([leitura1, leitura2], nq)

      const resultado = this._decidirRespostasMista(combinado, nq, letrasPerQ)
      let ambiguas = 0
      for (let q = 0; q < resultado.length; q++) {
        if (resultado[q].status === 'ambigua' || resultado[q].status === 'vazia') ambiguas++
      }

      if (ambiguas > nq * 0.3) {
        const wBin3 = this._criarMascaraBolhas(preparedGray, cv.ADAPTIVE_THRESH_MEAN_C, 27, 5)
        const leitura3 = this._lerBolhasUmaVezMista(wBin3, inkGray, posicoes, nq, raio)
        wBin3.delete()

        const triplo = this._combinarLeiturasBolhas([leitura1, leitura2, leitura3], nq)
        return this._decidirRespostasMista(triplo, nq, letrasPerQ)
      }

      return resultado
    } finally {
      inkGray.delete()
      preparedGray.delete()
    }
  }

  private _lerBolhasUmaVezMista(
    matBin: any,
    inkGray: any,
    posicoes: BubblePosition[][],
    nq: number,
    raio: number
  ): number[][] {
    const resultados: number[][] = []
    for (let q = 0; q < nq; q++) {
      const niveis: number[] = []
      const numBolhas = posicoes[q].length
      for (let a = 0; a < numBolhas; a++) {
        const cx = Math.round(posicoes[q][a].cx * OMREngine.PX_MM)
        const cy = Math.round(posicoes[q][a].cy * OMREngine.PX_MM)
        niveis.push(this._nivelBolhaHibrido(matBin, inkGray, cx, cy, raio))
      }
      resultados.push(niveis)
    }
    return resultados
  }

  private _combinarLeiturasBolhas(leituras: number[][][], nq: number): number[][] {
    const combinado: number[][] = []

    for (let q = 0; q < nq; q++) {
      const niveis: number[] = []
      const quantidadeAlternativas = leituras[0]?.[q]?.length || 0

      for (let a = 0; a < quantidadeAlternativas; a++) {
        const valores = leituras
          .map((leitura) => leitura[q]?.[a] ?? 0)
          .filter((valor) => Number.isFinite(valor))

        if (valores.length === 0) {
          niveis.push(0)
          continue
        }

        const pico = Math.max(...valores)
        const media = valores.reduce((soma, valor) => soma + valor, 0) / valores.length
        niveis.push(Math.max(0, Math.min(1, media * 0.7 + pico * 0.3)))
      }

      combinado.push(niveis)
    }

    return combinado
  }

  private _decidirRespostasMista(
    niveis: number[][],
    nq: number,
    letrasPerQ: string[][]
  ): OMRResposta[] {
    const respostas: OMRResposta[] = []

    for (let q = 0; q < nq; q++) {
      respostas.push(this._resolverResposta(q + 1, niveis[q], letrasPerQ[q]))
    }

    return respostas
  }

  // ── DEBUG (MISTA) ──────────────────────────────────────────

  private _resolverResposta(questao: number, niveisQuestao: number[], letras: string[]): OMRResposta {
    const sorted = niveisQuestao
      .map((val, idx) => ({ idx, val }))
      .sort((a, b) => b.val - a.val)

    const maxNivel = sorted[0]?.val ?? 0
    const maxIdx = sorted[0]?.idx ?? 0
    const secondMax = sorted[1]?.val ?? 0
    const outros = sorted
      .slice(1)
      .map((entry) => entry.val)
      .sort((a, b) => a - b)
    const mediana = outros.length > 0 ? outros[Math.floor(outros.length / 2)] : 0
    const q3 = outros.length > 0 ? outros[Math.floor(outros.length * 0.75)] : mediana
    const baseline = Math.max(mediana, q3 * 0.85, 0.02)
    const contrasteAbs = maxNivel - baseline
    const contrasteRel = baseline > 0 ? maxNivel / baseline : maxNivel / 0.02

    const nearPeak = niveisQuestao.filter((valor) => valor >= Math.max(0.12, maxNivel - 0.06)).length
    const secondaryStrong = secondMax >= Math.max(
      maxNivel * OMREngine.AMBIG_RATIO,
      baseline + 0.05,
      0.12
    )
    const hasStrongMark = maxNivel >= Math.max(
      OMREngine.MIN_FILL * 0.75,
      baseline + 0.05,
      0.12
    )

    const resposta: OMRResposta = {
      questao,
      niveis: niveisQuestao,
      marcada: null,
      confianca: 0,
      status: 'vazia',
    }

    if (!hasStrongMark || contrasteAbs < 0.045 || contrasteRel < 1.35) {
      return resposta
    }

    if (nearPeak >= 2 || secondaryStrong) {
      resposta.marcada = 'DUPLA'
      resposta.status = 'ambigua'
      return resposta
    }

    resposta.marcada = letras[maxIdx] ?? null
    resposta.confianca = Math.max(
      0,
      Math.min(1, maxNivel * 0.55 + Math.max(0, contrasteAbs) * 2.8 + Math.max(0, contrasteRel - 1) * 0.18)
    )
    resposta.status = 'ok'
    return resposta
  }

  private _gerarDebugMista(
    warped: any,
    wGray: any,
    nq: number,
    nalts: number,
    respostas: OMRResposta[],
    tiposQuestoes?: string,
    criterioDiscursiva?: number
  ): { imageUrl: string; levels: DebugLevel[] } {
    const px = OMREngine.PX_MM
    const posicoes = calcPosicoesBolhasMista(nq, nalts, tiposQuestoes, criterioDiscursiva)
    const raio = Math.round(CARTAO.bolhaRaio * px * 1.1)

    const debug = warped.clone()

    for (let q = 0; q < nq; q++) {
      const resp = respostas[q]
      const numBolhas = posicoes[q].length
      for (let a = 0; a < numBolhas; a++) {
        const cx = Math.round(posicoes[q][a].cx * px)
        const cy = Math.round(posicoes[q][a].cy * px)
        const nivel = resp.niveis[a]
        const nivelPct = Math.round(nivel * 100)

        let cor: any
        if (resp.status === 'ok' && a === resp.niveis.indexOf(Math.max(...resp.niveis))) {
          cor = new cv.Scalar(0, 255, 0, 255)
        } else if (nivel > OMREngine.MIN_FILL) {
          cor = new cv.Scalar(255, 165, 0, 255)
        } else {
          cor = new cv.Scalar(128, 128, 128, 255)
        }

        cv.circle(debug, new cv.Point(cx, cy), raio, cor, 2)
        cv.putText(
          debug,
          nivelPct + '%',
          new cv.Point(cx - 12, cy - raio - 3),
          cv.FONT_HERSHEY_SIMPLEX,
          0.35,
          cor,
          1
        )
      }
    }

    const tmpCanvas = document.createElement('canvas')
    tmpCanvas.width = debug.cols
    tmpCanvas.height = debug.rows
    cv.imshow(tmpCanvas, debug)
    const dataUrl = tmpCanvas.toDataURL('image/jpeg', 0.8)
    tmpCanvas.width = 0
    tmpCanvas.height = 0
    debug.delete()

    const rawLevels: DebugLevel[] = []
    for (let q = 0; q < nq; q++) {
      const row: DebugLevel = {
        q: q + 1,
        niveis: [],
        marcada: respostas[q].marcada || '-',
        status: respostas[q].status,
      }
      for (let a = 0; a < respostas[q].niveis.length; a++) {
        row.niveis.push(Math.round(respostas[q].niveis[a] * 100))
      }
      rawLevels.push(row)
    }

    return { imageUrl: dataUrl, levels: rawLevels }
  }

  // ── LEITURA DE BOLHAS (legado) ──────────────────────────────

  private _lerBolhas(wGray: any, nq: number, nalts: number, letras: string[]): OMRResposta[] {
    const px = OMREngine.PX_MM
    const posicoes = calcPosicoesBolhas(nq, nalts)
    // Raio menor (0.75x) para amostrar o CENTRO da bolha, evitando a borda preta
    const raio = Math.round(CARTAO.bolhaRaio * px * 0.75)

    // Leitura principal: adaptive gaussian
    const wBin1 = new cv.Mat()
    cv.adaptiveThreshold(
      wGray, wBin1, 255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 8
    )
    const leitura1 = this._lerBolhasUmaVez(wBin1, posicoes, nq, nalts, raio)
    wBin1.delete()

    // Verificar se tem questões com baixa confiança
    let precisaFallback = false
    for (let q = 0; q < nq; q++) {
      let maxN = 0
      for (let a = 0; a < nalts; a++) {
        if (leitura1[q][a] > maxN) maxN = leitura1[q][a]
      }
      if (maxN < OMREngine.MIN_FILL * 1.5) {
        precisaFallback = true
        break
      }
    }

    if (!precisaFallback) {
      return this._decidirRespostas(leitura1, nq, nalts, letras)
    }

    // Fallback: segunda leitura com parâmetros diferentes + votação
    const wBin2 = new cv.Mat()
    cv.adaptiveThreshold(
      wGray, wBin2, 255,
      cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 21, 6
    )
    const leitura2 = this._lerBolhasUmaVez(wBin2, posicoes, nq, nalts, raio)
    wBin2.delete()

    // Combinar leituras 1 e 2
    const combinado: number[][] = []
    for (let q = 0; q < nq; q++) {
      const niveis: number[] = []
      for (let a = 0; a < nalts; a++) {
        niveis.push((leitura1[q][a] + leitura2[q][a]) / 2)
      }
      combinado.push(niveis)
    }

    // Verificar se ainda há muitas ambiguidades
    const resultado = this._decidirRespostas(combinado, nq, nalts, letras)
    let ambiguas = 0
    for (let q = 0; q < resultado.length; q++) {
      if (resultado[q].status === 'ambigua' || resultado[q].status === 'vazia') ambiguas++
    }

    // Fallback 2: se >30% ambíguas, tentar com kernel/blockSize diferentes
    if (ambiguas > nq * 0.3) {
      const wBin3 = new cv.Mat()
      cv.adaptiveThreshold(
        wGray, wBin3, 255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, 5
      )
      const leitura3 = this._lerBolhasUmaVez(wBin3, posicoes, nq, nalts, raio)
      wBin3.delete()

      // Votação de 3 leituras
      const triplo: number[][] = []
      for (let q = 0; q < nq; q++) {
        const niveis: number[] = []
        for (let a = 0; a < nalts; a++) {
          niveis.push((leitura1[q][a] + leitura2[q][a] + leitura3[q][a]) / 3)
        }
        triplo.push(niveis)
      }
      return this._decidirRespostas(triplo, nq, nalts, letras)
    }

    return resultado
  }

  private _lerBolhasUmaVez(
    matBin: any,
    posicoes: BubblePosition[][],
    nq: number,
    nalts: number,
    raio: number
  ): number[][] {
    const resultados: number[][] = []
    for (let q = 0; q < nq; q++) {
      const niveis: number[] = []
      for (let a = 0; a < nalts; a++) {
        const cx = Math.round(posicoes[q][a].cx * OMREngine.PX_MM)
        const cy = Math.round(posicoes[q][a].cy * OMREngine.PX_MM)
        niveis.push(this._nivelBolha(matBin, cx, cy, raio))
      }
      resultados.push(niveis)
    }
    return resultados
  }

  private _decidirRespostas(
    niveis: number[][],
    nq: number,
    nalts: number,
    letras: string[]
  ): OMRResposta[] {
    const respostas: OMRResposta[] = []

    for (let q = 0; q < nq; q++) {
      // Ordenar níveis para análise relativa
      const sorted: { idx: number; val: number }[] = []
      for (let a = 0; a < nalts; a++) {
        sorted.push({ idx: a, val: niveis[q][a] })
      }
      sorted.sort((a, b) => b.val - a.val)

      const maxNivel = sorted[0].val
      const maxIdx = sorted[0].idx
      const secondMax = sorted[1].val

      // Calcular mediana das alternativas não-max (baseline da questão)
      const outros: number[] = []
      for (let a = 1; a < nalts; a++) outros.push(sorted[a].val)
      outros.sort((a, b) => a - b)
      const mediana = outros[Math.floor(outros.length / 2)]

      const resp: OMRResposta = {
        questao: q + 1,
        niveis: niveis[q],
        marcada: null,
        confianca: 0,
        status: 'vazia',
      }

      // Decisão RELATIVA: o que importa é a diferença entre max e os demais
      const destaque = mediana > 0 ? maxNivel / mediana : (maxNivel > 0.05 ? 10 : 0)

      // Contar quantas bolhas têm preenchimento significativo (acima do baseline)
      const threshAlto = mediana > 0 ? mediana * 1.8 : 0.10
      let bolhasAltas = 0
      for (let a = 0; a < nalts; a++) {
        if (niveis[q][a] >= threshAlto && niveis[q][a] >= 0.10) {
          bolhasAltas++
        }
      }

      if (destaque < 1.3) {
        // Todas as bolhas têm nível similar -> nenhuma marcada (vazia)
        resp.marcada = null
        resp.confianca = 0
        resp.status = 'vazia'
      } else if (bolhasAltas >= 2 && secondMax > maxNivel * 0.55) {
        // Duas ou mais bolhas preenchidas significativamente -> dupla marcação
        resp.marcada = 'DUPLA'
        resp.confianca = 0
        resp.status = 'ambigua'
      } else {
        // Uma bolha se destaca claramente
        resp.marcada = letras[maxIdx]
        resp.confianca = maxNivel
        resp.status = 'ok'
      }

      respostas.push(resp)
    }

    return respostas
  }

  // ── DEBUG: gera imagem anotada + dados diagnósticos ──

  private _gerarDebug(
    warped: any,
    wGray: any,
    nq: number,
    nalts: number,
    respostas: OMRResposta[]
  ): { imageUrl: string; levels: DebugLevel[] } {
    const px = OMREngine.PX_MM
    const posicoes = calcPosicoesBolhas(nq, nalts)
    const raio = Math.round(CARTAO.bolhaRaio * px * 1.1)
    const allLetras = ['A', 'B', 'C', 'D', 'E']

    // Criar cópia colorida para anotar
    const debug = warped.clone()

    // Desenhar círculo em cada posição de bolha
    for (let q = 0; q < nq; q++) {
      const resp = respostas[q]
      for (let a = 0; a < nalts; a++) {
        const cx = Math.round(posicoes[q][a].cx * px)
        const cy = Math.round(posicoes[q][a].cy * px)
        const nivel = resp.niveis[a]
        const nivelPct = Math.round(nivel * 100)

        // Cor: verde se marcada correta, laranja se tem preenchimento, cinza se vazia
        let cor: any
        if (resp.status === 'ok' && resp.marcada === allLetras[a]) {
          cor = new cv.Scalar(0, 255, 0, 255) // verde
        } else if (nivel > OMREngine.MIN_FILL) {
          cor = new cv.Scalar(255, 165, 0, 255) // laranja
        } else {
          cor = new cv.Scalar(128, 128, 128, 255) // cinza
        }

        cv.circle(debug, new cv.Point(cx, cy), raio, cor, 2)

        // Texto com percentual de preenchimento
        cv.putText(
          debug,
          nivelPct + '%',
          new cv.Point(cx - 12, cy - raio - 3),
          cv.FONT_HERSHEY_SIMPLEX,
          0.35,
          cor,
          1
        )
      }
    }

    // Converter para data URL
    const tmpCanvas = document.createElement('canvas')
    tmpCanvas.width = debug.cols
    tmpCanvas.height = debug.rows
    cv.imshow(tmpCanvas, debug)
    const dataUrl = tmpCanvas.toDataURL('image/jpeg', 0.8)
    tmpCanvas.width = 0
    tmpCanvas.height = 0
    debug.delete()

    // Coletar níveis brutos para diagnóstico
    const rawLevels: DebugLevel[] = []
    for (let q = 0; q < nq; q++) {
      const row: DebugLevel = {
        q: q + 1,
        niveis: [],
        marcada: respostas[q].marcada || '-',
        status: respostas[q].status,
      }
      for (let a = 0; a < nalts; a++) {
        row.niveis.push(Math.round(respostas[q].niveis[a] * 100))
      }
      rawLevels.push(row)
    }

    return { imageUrl: dataUrl, levels: rawLevels }
  }

  private _nivelBolha(matBin: any, cx: number, cy: number, raio: number): number {
    const r = raio
    let x = cx - r
    let y = cy - r
    let w = r * 2
    let h = r * 2

    if (x < 0) { w += x; x = 0 }
    if (y < 0) { h += y; y = 0 }
    if (x + w > matBin.cols) w = matBin.cols - x
    if (y + h > matBin.rows) h = matBin.rows - y
    if (w <= 0 || h <= 0) return 0

    let roi: any = null
    try {
      roi = matBin.roi(new cv.Rect(x, y, w, h))
      const centerX = cx - x
      const centerY = cy - y
      const innerRadius = Math.max(2, r * 0.55)
      const ringInnerRadius = Math.max(innerRadius + 1, r * 0.72)
      const ringOuterRadius = Math.max(ringInnerRadius + 1, r * 0.98)

      let centerCount = 0
      let centerFilled = 0
      let ringCount = 0
      let ringFilled = 0
      let totalCount = 0
      let totalFilled = 0

      for (let yy = 0; yy < roi.rows; yy++) {
        for (let xx = 0; xx < roi.cols; xx++) {
          const dx = xx + 0.5 - centerX
          const dy = yy + 0.5 - centerY
          const distance = Math.hypot(dx, dy)
          const filled = roi.ucharPtr(yy, xx)[0] > 0 ? 1 : 0

          totalCount++
          totalFilled += filled

          if (distance <= innerRadius) {
            centerCount++
            centerFilled += filled
          } else if (distance >= ringInnerRadius && distance <= ringOuterRadius) {
            ringCount++
            ringFilled += filled
          }
        }
      }

      const centerDensity = centerCount > 0 ? centerFilled / centerCount : 0
      const ringDensity = ringCount > 0 ? ringFilled / ringCount : 0
      const totalDensity = totalCount > 0 ? totalFilled / totalCount : 0
      const emphasis = Math.max(0, centerDensity - ringDensity)

      return Math.max(
        0,
        Math.min(1, centerDensity * 0.85 + emphasis * 0.65 + Math.max(0, totalDensity - ringDensity * 0.5) * 0.2)
      )
    } finally {
      if (roi) roi.delete()
    }
  }

  private _nivelBolhaCinza(matGray: any, cx: number, cy: number, raio: number): number {
    const r = raio
    let x = cx - r
    let y = cy - r
    let w = r * 2
    let h = r * 2

    if (x < 0) { w += x; x = 0 }
    if (y < 0) { h += y; y = 0 }
    if (x + w > matGray.cols) w = matGray.cols - x
    if (y + h > matGray.rows) h = matGray.rows - y
    if (w <= 0 || h <= 0) return 0

    let roi: any = null
    try {
      roi = matGray.roi(new cv.Rect(x, y, w, h))
      const centerX = cx - x
      const centerY = cy - y
      const innerRadius = Math.max(2, r * 0.55)
      const ringInnerRadius = Math.max(innerRadius + 1, r * 0.72)
      const ringOuterRadius = Math.max(ringInnerRadius + 1, r * 0.98)

      let centerCount = 0
      let centerInk = 0
      let ringCount = 0
      let ringInk = 0
      let totalCount = 0
      let totalInk = 0

      for (let yy = 0; yy < roi.rows; yy++) {
        for (let xx = 0; xx < roi.cols; xx++) {
          const dx = xx + 0.5 - centerX
          const dy = yy + 0.5 - centerY
          const distance = Math.hypot(dx, dy)
          const ink = roi.ucharPtr(yy, xx)[0] / 255

          totalCount++
          totalInk += ink

          if (distance <= innerRadius) {
            centerCount++
            centerInk += ink
          } else if (distance >= ringInnerRadius && distance <= ringOuterRadius) {
            ringCount++
            ringInk += ink
          }
        }
      }

      const centerMean = centerCount > 0 ? centerInk / centerCount : 0
      const ringMean = ringCount > 0 ? ringInk / ringCount : 0
      const totalMean = totalCount > 0 ? totalInk / totalCount : 0
      const emphasis = Math.max(0, centerMean - ringMean * 0.82)

      return Math.max(
        0,
        Math.min(1, centerMean * 0.85 + emphasis * 0.8 + Math.max(0, totalMean - ringMean * 0.4) * 0.18)
      )
    } finally {
      if (roi) roi.delete()
    }
  }

  private _nivelBolhaHibrido(matBin: any, matGray: any, cx: number, cy: number, raio: number): number {
    const binaryScore = this._nivelBolha(matBin, cx, cy, raio)
    const grayScore = this._nivelBolhaCinza(matGray, cx, cy, raio)
    const combined = binaryScore * 0.55 + grayScore * 0.45 + Math.max(0, grayScore - binaryScore) * 0.2
    return Math.max(0, Math.min(1, combined))
  }
}
