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
  // eslint-disable-next-line no-var
  var cv: any
  // eslint-disable-next-line no-var
  var jsQR: any
}

// ── OMR Engine ─────────────────────────────────────────────

export class OMREngine {
  private static PX_MM = 4
  private static CARD_W = 840   // 210mm * 4
  private static CARD_H = 594   // 148.5mm * 4
  private static MIN_FILL = 0.20
  private static AMBIG_RATIO = 0.58

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

  /**
   * Processa um canvas contendo a foto de um cartão-resposta.
   * Retorna resultado OMR com QR, respostas e debug.
   */
  process(
    canvas: HTMLCanvasElement,
    nq: number,
    nalts: number,
    tiposQuestoes?: string,
    criterioDiscursiva?: number
  ): OMRResult {
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
    const letras = letrasObj

    let src: any = null
    let gray: any = null
    let warped: any = null
    let wGray: any = null
    const allMats: any[] = []

    try {
      src = cv.imread(canvas)
      gray = new cv.Mat()
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

      // ── Nível 1: Otsu simples (funciona 80% das vezes com foto boa) ──
      const blurred = new cv.Mat()
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
      const bin1 = new cv.Mat()
      cv.threshold(blurred, bin1, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)
      allMats.push(blurred, bin1)

      let marcadores = this._encontrarMarcadores(bin1)

      // ── Nível 2: Adaptive threshold (iluminação irregular) ──
      if (!marcadores) {
        const bin2 = new cv.Mat()
        cv.adaptiveThreshold(
          gray, bin2, 255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 51, 10
        )
        allMats.push(bin2)
        marcadores = this._encontrarMarcadores(bin2)
      }

      // ── Nível 3: Normalização de iluminação + Otsu (foto ruim) ──
      if (!marcadores) {
        const norm = this._normalizarIluminacao(gray)
        const bin3 = new cv.Mat()
        cv.threshold(norm, bin3, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)
        allMats.push(norm, bin3)
        marcadores = this._encontrarMarcadores(bin3)
      }

      if (!marcadores) {
        return {
          sucesso: false,
          mensagem: 'Marcadores não detectados. Enquadre todo o cartão com boa iluminação.',
        }
      }

      // Corrigir orientação se necessário
      const wTop = Math.hypot(
        marcadores.tr.x - marcadores.tl.x,
        marcadores.tr.y - marcadores.tl.y
      )
      const hLeft = Math.hypot(
        marcadores.bl.x - marcadores.tl.x,
        marcadores.bl.y - marcadores.tl.y
      )
      if (hLeft > wTop * 1.15) {
        const tmp = marcadores
        marcadores = { tl: tmp.bl, tr: tmp.tl, bl: tmp.br, br: tmp.tr }
      }

      warped = this._corrigirPerspectiva(src, marcadores)

      // ── QR: progressivo (normal -> mediana -> escala) ──
      const qrResult = this._lerQRProgressivo(warped)

      // ── Bolhas: leitura direta + fallback ──
      wGray = new cv.Mat()
      cv.cvtColor(warped, wGray, cv.COLOR_RGBA2GRAY)
      const respostas = this._lerBolhasMista(wGray, nq, nalts, letrasPerQ, tiposQuestoes, criterioDiscursiva)

      // ── Debug: gerar imagem anotada da perspectiva corrigida ──
      let debugData: { imageUrl: string; levels: DebugLevel[] } | undefined
      try {
        debugData = this._gerarDebugMista(warped, wGray, nq, nalts, respostas, tiposQuestoes, criterioDiscursiva)
      } catch {
        // debug falhou, ignora
      }

      return {
        sucesso: true,
        qr: qrResult ?? undefined,
        respostas,
        confianca: respostas.map((r) => r.confianca),
        debug: debugData,
      }
    } catch (e: any) {
      return {
        sucesso: false,
        mensagem: 'Erro no processamento: ' + (e?.message || e),
      }
    } finally {
      if (src) src.delete()
      if (gray) gray.delete()
      if (warped) warped.delete()
      if (wGray) wGray.delete()
      for (const m of allMats) {
        if (m) m.delete()
      }
    }
  }

  // ── NORMALIZAÇÃO DE ILUMINAÇÃO (leve, sem CLAHE pesado) ────

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

    const finalResult = new cv.Mat()
    cv.normalize(result, finalResult, 0, 255, cv.NORM_MINMAX)

    bg.delete()
    floatGray.delete()
    floatBg.delete()
    normalized.delete()
    result.delete()

    return finalResult
  }

  // ── DETECÇÃO DE MARCADORES ────────────────────────────────

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

    let selected: Ponto[] | null = candidatos.length > 4
      ? this._selecionar4Melhores(candidatos)
      : candidatos

    if (!selected) return null

    return this._ordenarPontos(selected)
  }

  private _selecionar4Melhores(cands: Ponto[]): Ponto[] | null {
    const targetRatio = CARTAO.largura / CARTAO.altura
    let best: Ponto[] | null = null
    let bestScore = Infinity

    // Pegar os 12 maiores candidatos
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

            const ratio = avgW / avgH
            let score = Math.abs(ratio - targetRatio)
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
    cv.warpPerspective(src, warped, M, new cv.Size(OMREngine.CARD_W, OMREngine.CARD_H))

    srcPts.delete()
    dstPts.delete()
    M.delete()

    return warped
  }

  // ── LEITURA DE QR PROGRESSIVA ─────────────────────────────

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
    let rw = Math.min(Math.round(area.w * px), mat.cols - rx)
    let rh = Math.min(Math.round(area.h * px), mat.rows - ry)
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

    // Leitura principal
    const wBin1 = new cv.Mat()
    cv.adaptiveThreshold(
      wGray, wBin1, 255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 8
    )
    const leitura1 = this._lerBolhasUmaVezMista(wBin1, posicoes, nq, raio)
    wBin1.delete()

    // Verificar se precisa fallback
    let precisaFallback = false
    for (let q = 0; q < nq; q++) {
      let maxN = 0
      for (let a = 0; a < leitura1[q].length; a++) {
        if (leitura1[q][a] > maxN) maxN = leitura1[q][a]
      }
      if (maxN < OMREngine.MIN_FILL * 1.5) {
        precisaFallback = true
        break
      }
    }

    if (!precisaFallback) {
      return this._decidirRespostasMista(leitura1, nq, letrasPerQ)
    }

    // Fallback
    const wBin2 = new cv.Mat()
    cv.adaptiveThreshold(
      wGray, wBin2, 255,
      cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 21, 6
    )
    const leitura2 = this._lerBolhasUmaVezMista(wBin2, posicoes, nq, raio)
    wBin2.delete()

    const combinado: number[][] = []
    for (let q = 0; q < nq; q++) {
      const niveis: number[] = []
      for (let a = 0; a < leitura1[q].length; a++) {
        niveis.push((leitura1[q][a] + leitura2[q][a]) / 2)
      }
      combinado.push(niveis)
    }

    const resultado = this._decidirRespostasMista(combinado, nq, letrasPerQ)
    let ambiguas = 0
    for (let q = 0; q < resultado.length; q++) {
      if (resultado[q].status === 'ambigua' || resultado[q].status === 'vazia') ambiguas++
    }

    if (ambiguas > nq * 0.3) {
      const wBin3 = new cv.Mat()
      cv.adaptiveThreshold(
        wGray, wBin3, 255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, 5
      )
      const leitura3 = this._lerBolhasUmaVezMista(wBin3, posicoes, nq, raio)
      wBin3.delete()

      const triplo: number[][] = []
      for (let q = 0; q < nq; q++) {
        const niveis: number[] = []
        for (let a = 0; a < leitura1[q].length; a++) {
          niveis.push((leitura1[q][a] + leitura2[q][a] + leitura3[q][a]) / 3)
        }
        triplo.push(niveis)
      }
      return this._decidirRespostasMista(triplo, nq, letrasPerQ)
    }

    return resultado
  }

  private _lerBolhasUmaVezMista(
    matBin: any,
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
        niveis.push(this._nivelBolha(matBin, cx, cy, raio))
      }
      resultados.push(niveis)
    }
    return resultados
  }

  private _decidirRespostasMista(
    niveis: number[][],
    nq: number,
    letrasPerQ: string[][]
  ): OMRResposta[] {
    const respostas: OMRResposta[] = []

    for (let q = 0; q < nq; q++) {
      const qLetras = letrasPerQ[q]
      const qNalts = qLetras.length

      const sorted: { idx: number; val: number }[] = []
      for (let a = 0; a < qNalts; a++) {
        sorted.push({ idx: a, val: niveis[q][a] })
      }
      sorted.sort((a, b) => b.val - a.val)

      const maxNivel = sorted[0].val
      const maxIdx = sorted[0].idx
      const secondMax = sorted.length > 1 ? sorted[1].val : 0

      const outros: number[] = []
      for (let a = 1; a < sorted.length; a++) outros.push(sorted[a].val)
      outros.sort((a, b) => a - b)
      const mediana = outros.length > 0 ? outros[Math.floor(outros.length / 2)] : 0

      const resp: OMRResposta = {
        questao: q + 1,
        niveis: niveis[q],
        marcada: null,
        confianca: 0,
        status: 'vazia',
      }

      const destaque = mediana > 0 ? maxNivel / mediana : (maxNivel > 0.05 ? 10 : 0)

      const threshAlto = mediana > 0 ? mediana * 1.8 : 0.10
      let bolhasAltas = 0
      for (let a = 0; a < qNalts; a++) {
        if (niveis[q][a] >= threshAlto && niveis[q][a] >= 0.10) {
          bolhasAltas++
        }
      }

      if (destaque < 1.3) {
        resp.marcada = null
        resp.confianca = 0
        resp.status = 'vazia'
      } else if (bolhasAltas >= 2 && secondMax > maxNivel * 0.55) {
        resp.marcada = 'DUPLA'
        resp.confianca = 0
        resp.status = 'ambigua'
      } else {
        resp.marcada = qLetras[maxIdx]
        resp.confianca = maxNivel
        resp.status = 'ok'
      }

      respostas.push(resp)
    }

    return respostas
  }

  // ── DEBUG (MISTA) ──────────────────────────────────────────

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
      const total = roi.rows * roi.cols
      const preenchido = cv.countNonZero(roi)
      return total > 0 ? preenchido / total : 0
    } finally {
      if (roi) roi.delete()
    }
  }
}
