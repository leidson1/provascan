'use client'

export type ResizeOptions = {
  maxLongSide: number
  minShortSide: number
}

export type CaptureQualityReport = {
  brightness: number
  contrast: number
  sharpness: number
  shortestSide: number
  longestSide: number
  warnings: string[]
}

type CaptureQualityOptions = {
  ignoreResolution?: boolean
}

export const CAPTURE_MAX_LONG_SIDE = 2400
export const CAPTURE_MIN_SHORT_SIDE = 1200

const QUALITY_SAMPLE_MAX_SIDE = 360

export function resizeCanvasToBounds(
  sourceCanvas: HTMLCanvasElement,
  options: ResizeOptions
): HTMLCanvasElement {
  const srcW = sourceCanvas.width
  const srcH = sourceCanvas.height
  const longSide = Math.max(srcW, srcH)
  const shortSide = Math.min(srcW, srcH)

  let scale = 1
  if (shortSide > 0 && shortSide < options.minShortSide) {
    scale = options.minShortSide / shortSide
  }
  if (longSide > 0 && longSide * scale > options.maxLongSide) {
    scale = options.maxLongSide / longSide
  }

  if (Math.abs(scale - 1) < 0.001) {
    return sourceCanvas
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(srcW * scale))
  canvas.height = Math.max(1, Math.round(srcH * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return sourceCanvas
  }

  ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height)
  return canvas
}

export function analyzeCaptureQuality(
  canvas: HTMLCanvasElement,
  options: CaptureQualityOptions = {}
): CaptureQualityReport {
  const shortestSide = Math.min(canvas.width, canvas.height)
  const longestSide = Math.max(canvas.width, canvas.height)
  const sampleScale = longestSide > QUALITY_SAMPLE_MAX_SIDE
    ? QUALITY_SAMPLE_MAX_SIDE / longestSide
    : 1

  const sampleWidth = Math.max(1, Math.round(canvas.width * sampleScale))
  const sampleHeight = Math.max(1, Math.round(canvas.height * sampleScale))
  const sampleCanvas = document.createElement('canvas')
  sampleCanvas.width = sampleWidth
  sampleCanvas.height = sampleHeight

  const sampleCtx = sampleCanvas.getContext('2d')
  if (!sampleCtx) {
    return {
      brightness: 0,
      contrast: 0,
      sharpness: 0,
      shortestSide,
      longestSide,
      warnings: [],
    }
  }

  sampleCtx.drawImage(canvas, 0, 0, sampleWidth, sampleHeight)
  const imageData = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight)
  const gray = new Float32Array(sampleWidth * sampleHeight)

  let sum = 0
  let sumSq = 0
  for (let i = 0, px = 0; i < imageData.data.length; i += 4, px++) {
    const luminance =
      imageData.data[i] * 0.299 +
      imageData.data[i + 1] * 0.587 +
      imageData.data[i + 2] * 0.114
    gray[px] = luminance
    sum += luminance
    sumSq += luminance * luminance
  }

  let edgeEnergy = 0
  for (let y = 0; y < sampleHeight; y++) {
    for (let x = 0; x < sampleWidth; x++) {
      const idx = y * sampleWidth + x
      const value = gray[idx]
      if (x > 0) edgeEnergy += Math.abs(value - gray[idx - 1])
      if (y > 0) edgeEnergy += Math.abs(value - gray[idx - sampleWidth])
    }
  }

  const pixelCount = Math.max(1, gray.length)
  const brightness = sum / pixelCount
  const contrast = Math.sqrt(Math.max(0, sumSq / pixelCount - brightness * brightness))
  const sharpness = edgeEnergy / pixelCount

  sampleCanvas.width = 0
  sampleCanvas.height = 0

  const warnings: string[] = []
  if (!options.ignoreResolution && shortestSide < CAPTURE_MIN_SHORT_SIDE) {
    warnings.push('Imagem com resolucao baixa para leitura fina.')
  }
  if (brightness < 95) {
    warnings.push('Foto escura; tente uma luz mais uniforme.')
  } else if (brightness > 215) {
    warnings.push('Foto clara demais; evite reflexo direto no papel.')
  }
  if (contrast < 40) {
    warnings.push('Contraste baixo; reduza sombra e melhore o enquadramento.')
  }
  if (sharpness < 18) {
    warnings.push('Foto possivelmente desfocada ou distante demais do cartao.')
  }

  return {
    brightness,
    contrast,
    sharpness,
    shortestSide,
    longestSide,
    warnings,
  }
}
