'use client'

import { useEffect, useRef, useState } from 'react'
import {
  analyzeCaptureQuality,
  CAPTURE_MAX_LONG_SIDE,
  CAPTURE_MIN_SHORT_SIDE,
  resizeCanvasToBounds,
} from '@/lib/omr/capture-quality'

type LiveScannerProps = {
  disabled?: boolean
  onCapture: (canvas: HTMLCanvasElement) => Promise<void> | void
}

type ScannerStatus = 'loading' | 'ready' | 'unsupported' | 'blocked' | 'error'

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: VideoFrameRequestCallback) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

function stopStream(stream: MediaStream | null) {
  if (!stream) return
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

function getCameraErrorMessage(error: unknown): { status: ScannerStatus; message: string } {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return {
        status: 'blocked',
        message: 'Permita o acesso a camera para usar o scanner ao vivo.',
      }
    }
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return {
        status: 'unsupported',
        message: 'Nao encontramos uma camera traseira pronta para o scanner ao vivo.',
      }
    }
  }

  return {
    status: 'error',
    message: 'Nao foi possivel iniciar a camera ao vivo neste aparelho.',
  }
}

export function LiveScanner({ disabled = false, onCapture }: LiveScannerProps) {
  const videoRef = useRef<VideoWithFrameCallback | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameHandleRef = useRef<number | null>(null)
  const timeoutHandleRef = useRef<number | null>(null)

  const [restartToken, setRestartToken] = useState(0)
  const [status, setStatus] = useState<ScannerStatus>('loading')
  const [statusMessage, setStatusMessage] = useState('Abrindo camera traseira...')
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([])
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchEnabled, setTorchEnabled] = useState(false)
  const [capturing, setCapturing] = useState(false)

  useEffect(() => {
    let cancelled = false

    function clearSampling() {
      const video = videoRef.current
      if (frameHandleRef.current != null && video?.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(frameHandleRef.current)
        frameHandleRef.current = null
      }
      if (timeoutHandleRef.current != null) {
        window.clearTimeout(timeoutHandleRef.current)
        timeoutHandleRef.current = null
      }
    }

    function teardownStream() {
      clearSampling()
      stopStream(streamRef.current)
      streamRef.current = null
      setTorchSupported(false)
      setTorchEnabled(false)
      setPreviewWarnings([])
    }

    function samplePreview(video: HTMLVideoElement) {
      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        return
      }

      const maxSide = 960
      const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight))
      const sampleCanvas = document.createElement('canvas')
      sampleCanvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      sampleCanvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      const ctx = sampleCanvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(video, 0, 0, sampleCanvas.width, sampleCanvas.height)
      const report = analyzeCaptureQuality(sampleCanvas, { ignoreResolution: true })
      setPreviewWarnings(report.warnings)
    }

    function scheduleSampling() {
      const video = videoRef.current
      if (!video || cancelled) return

      if (typeof video.requestVideoFrameCallback === 'function') {
        frameHandleRef.current = video.requestVideoFrameCallback(() => {
          samplePreview(video)
          scheduleSampling()
        })
        return
      }

      timeoutHandleRef.current = window.setTimeout(() => {
        samplePreview(video)
        scheduleSampling()
      }, 700)
    }

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unsupported')
        setStatusMessage('Scanner ao vivo nao suportado neste navegador. Use a foto do aparelho abaixo.')
        return
      }

      teardownStream()
      setStatus('loading')
      setStatusMessage('Abrindo camera traseira...')

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        })

        if (cancelled) {
          stopStream(stream)
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (!video) {
          teardownStream()
          return
        }

        video.srcObject = stream
        await video.play()

        const track = stream.getVideoTracks()[0]
        const capabilities = typeof track.getCapabilities === 'function'
          ? track.getCapabilities()
          : null
        setTorchSupported(Boolean(capabilities && 'torch' in capabilities && capabilities.torch))
        setStatus('ready')
        setStatusMessage('Centralize o cartao e mantenha a mao firme.')
        scheduleSampling()
      } catch (error) {
        const result = getCameraErrorMessage(error)
        setStatus(result.status)
        setStatusMessage(result.message)
        teardownStream()
      }
    }

    startCamera()

    return () => {
      cancelled = true
      teardownStream()
    }
  }, [restartToken])

  async function handleTorchToggle() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track || typeof track.applyConstraints !== 'function') return

    try {
      await track.applyConstraints({
        advanced: [{ torch: !torchEnabled } as MediaTrackConstraintSet],
      })
      setTorchEnabled((current) => !current)
    } catch {
      setStatusMessage('Nao foi possivel alternar a luz da camera neste aparelho.')
    }
  }

  async function handleCapture() {
    const video = videoRef.current
    if (!video || disabled || capturing || status !== 'ready') return
    if (video.videoWidth === 0 || video.videoHeight === 0) return

    setCapturing(true)
    try {
      const rawCanvas = document.createElement('canvas')
      rawCanvas.width = video.videoWidth
      rawCanvas.height = video.videoHeight

      const ctx = rawCanvas.getContext('2d')
      if (!ctx) {
        throw new Error('Nao foi possivel capturar o quadro da camera.')
      }

      ctx.drawImage(video, 0, 0, rawCanvas.width, rawCanvas.height)
      const normalizedCanvas = resizeCanvasToBounds(rawCanvas, {
        maxLongSide: CAPTURE_MAX_LONG_SIDE,
        minShortSide: CAPTURE_MIN_SHORT_SIDE,
      })
      await onCapture(normalizedCanvas)
    } finally {
      setCapturing(false)
    }
  }

  const isReady = status === 'ready'
  const showWarningCard = previewWarnings.length > 0 && isReady

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
      <div className="relative overflow-hidden rounded-xl bg-slate-950">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="max-h-[60vh] w-full bg-slate-950 object-cover"
        />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-[72%] w-[88%] rounded-[28px] border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.4)]">
            <div className="absolute left-4 top-3 rounded-full bg-slate-950/80 px-3 py-1 text-[11px] font-medium text-emerald-100">
              Enquadre o cartao inteiro
            </div>
          </div>
        </div>

        {status !== 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 p-6 text-center">
            <div>
              {status === 'loading' && (
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              )}
              <p className="text-sm font-medium text-slate-100">{statusMessage}</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCapture}
          disabled={!isReady || disabled || capturing}
          className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-50"
        >
          {capturing ? 'Capturando...' : 'Ler com Camera Ao Vivo'}
        </button>

        {torchSupported && (
          <button
            type="button"
            onClick={handleTorchToggle}
            disabled={!isReady}
            className="rounded-xl border border-slate-600 px-4 py-3 text-sm font-medium text-slate-100 transition hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
          >
            {torchEnabled ? 'Desligar Luz' : 'Ligar Luz'}
          </button>
        )}

        {status !== 'ready' && (
          <button
            type="button"
            onClick={() => setRestartToken((current) => current + 1)}
            className="rounded-xl border border-slate-600 px-4 py-3 text-sm font-medium text-slate-100 transition hover:bg-slate-800"
          >
            Tentar Novamente
          </button>
        )}
      </div>

      {isReady && !showWarningCard && (
        <div className="mt-3 rounded-lg border border-emerald-800/40 bg-emerald-950/25 px-3 py-3 text-xs text-emerald-100">
          A camera esta pronta. Pode capturar com o cartao em pe ou deitado, desde que ele apareca inteiro.
        </div>
      )}

      {showWarningCard && (
        <div className="mt-3 rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-3 text-xs text-amber-100">
          <div className="font-semibold text-sm">Ajustes antes da captura</div>
          <div className="mt-1">
            {previewWarnings.slice(0, 3).join(' • ')}
            {previewWarnings.length > 3 ? ` • +${previewWarnings.length - 3} outras` : ''}
          </div>
        </div>
      )}
    </div>
  )
}
