'use client'

import { useState, useEffect } from 'react'
import {
  ChevronRight, ChevronLeft, Save, Loader2, BookOpen, Settings2,
  ClipboardList, Check, Circle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { Disciplina, Turma } from '@/types/database'

// ── Types ──────────────────────────────────────────────
export interface ProvaFormData {
  data: string
  bloco: string
  disciplinaId: string
  turmaId: string
  tipoProva: 'objetiva' | 'mista' | 'discursiva'
  numQuestoes: number
  numAlternativas: number
  criterioDiscursiva: number
  modoAvaliacao: 'acertos' | 'nota'
  notaTotal: number
  modoAnulacao: 'contar_certa' | 'redistribuir'
  tiposQuestoes: string[]
  gabarito: string
  pesosQuestoes: number[]
}

interface ProvaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  disciplinas: Disciplina[]
  turmas: Turma[]
  saving: boolean
  onSave: (data: ProvaFormData) => void
  initial?: Partial<ProvaFormData>
  editMode?: boolean
}

const STEPS = [
  { id: 'info', label: 'Informações', icon: BookOpen },
  { id: 'config', label: 'Configuração', icon: Settings2 },
  { id: 'gabarito', label: 'Gabarito', icon: ClipboardList },
]

const CRITERIO_LABELS: Record<number, { labels: string[], cores: string[] }> = {
  2: { labels: ['C', 'E'], cores: ['bg-emerald-500', 'bg-red-500'] },
  3: { labels: ['C', 'P', 'E'], cores: ['bg-emerald-500', 'bg-amber-400', 'bg-red-500'] },
  4: { labels: ['E', 'B', 'P', 'I'], cores: ['bg-emerald-500', 'bg-teal-400', 'bg-amber-400', 'bg-red-500'] },
}

// ── Component ──────────────────────────────────────────
export function ProvaModal({
  open, onOpenChange, disciplinas, turmas, saving, onSave, initial, editMode,
}: ProvaModalProps) {
  const [step, setStep] = useState(0)

  // Form state
  const [data, setData] = useState('')
  const [bloco, setBloco] = useState('B1')
  const [disciplinaId, setDisciplinaId] = useState('')
  const [turmaId, setTurmaId] = useState('')
  const [tipoProva, setTipoProva] = useState<'objetiva' | 'mista' | 'discursiva'>('objetiva')
  const [numQuestoes, setNumQuestoes] = useState(10)
  const [numAlternativas, setNumAlternativas] = useState(5)
  const [criterioDiscursiva, setCriterioDiscursiva] = useState(3)
  const [modoAvaliacao, setModoAvaliacao] = useState<'acertos' | 'nota'>('acertos')
  const [notaTotal, setNotaTotal] = useState(10)
  const [modoAnulacao, setModoAnulacao] = useState<'contar_certa' | 'redistribuir'>('contar_certa')
  const [tiposQuestoes, setTiposQuestoes] = useState<string[]>([])
  const [gabarito, setGabarito] = useState('')
  const [pesosQuestoes, setPesosQuestoes] = useState<number[]>([])

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(0)
      if (initial) {
        setData(initial.data || new Date().toISOString().split('T')[0])
        setBloco(initial.bloco || 'B1')
        setDisciplinaId(initial.disciplinaId || '')
        setTurmaId(initial.turmaId || '')
        setTipoProva(initial.tipoProva || 'objetiva')
        setNumQuestoes(initial.numQuestoes || 10)
        setNumAlternativas(initial.numAlternativas || 5)
        setCriterioDiscursiva(initial.criterioDiscursiva || 3)
        setModoAvaliacao(initial.modoAvaliacao || 'acertos')
        setNotaTotal(initial.notaTotal || 10)
        setModoAnulacao(initial.modoAnulacao || 'contar_certa')
        setTiposQuestoes(initial.tiposQuestoes || [])
        setGabarito(initial.gabarito || '')
        setPesosQuestoes(initial.pesosQuestoes || [])
      } else {
        setData(new Date().toISOString().split('T')[0])
        setBloco('B1')
        setDisciplinaId('')
        setTurmaId('')
        setTipoProva('objetiva')
        setNumQuestoes(10)
        setNumAlternativas(5)
        setCriterioDiscursiva(3)
        setModoAvaliacao('acertos')
        setNotaTotal(10)
        setModoAnulacao('contar_certa')
        setTiposQuestoes([])
        setGabarito('')
        setPesosQuestoes([])
      }
    }
  }, [open, initial])

  // Sync tipos with numQuestoes
  useEffect(() => {
    if (tipoProva === 'discursiva') {
      setTiposQuestoes(Array(numQuestoes).fill('D'))
    } else if (tipoProva === 'objetiva') {
      setTiposQuestoes(Array(numQuestoes).fill('O'))
    } else {
      setTiposQuestoes(prev => {
        const arr = [...prev]
        while (arr.length < numQuestoes) arr.push('O')
        if (arr.length > numQuestoes) arr.length = numQuestoes
        return arr
      })
    }
  }, [numQuestoes, tipoProva])

  // Auto nota for discursiva
  useEffect(() => {
    if (tipoProva === 'discursiva') setModoAvaliacao('nota')
  }, [tipoProva])

  function handleSave() {
    // Build final gabarito
    const gabArr = gabarito ? gabarito.split(',') : []
    while (gabArr.length < numQuestoes) gabArr.push('')
    const finalTipos = tipoProva === 'objetiva' ? Array(numQuestoes).fill('O')
      : tipoProva === 'discursiva' ? Array(numQuestoes).fill('D')
      : tiposQuestoes
    for (let i = 0; i < numQuestoes; i++) {
      if (finalTipos[i] === 'D' && gabArr[i] !== 'D') gabArr[i] = 'D'
    }

    onSave({
      data, bloco, disciplinaId, turmaId, tipoProva, numQuestoes,
      numAlternativas, criterioDiscursiva, modoAvaliacao, notaTotal,
      modoAnulacao, tiposQuestoes: finalTipos,
      gabarito: gabArr.join(','),
      pesosQuestoes,
    })
  }

  // ── Gabarito helpers ──
  const ALTS = ['A', 'B', 'C', 'D', 'E'].slice(0, numAlternativas)
  const discInfo = CRITERIO_LABELS[criterioDiscursiva] || CRITERIO_LABELS[3]
  const gabArr = gabarito ? gabarito.split(',') : []
  while (gabArr.length < numQuestoes) gabArr.push('')
  if (gabArr.length > numQuestoes) gabArr.length = numQuestoes
  const pesArr = [...pesosQuestoes]
  while (pesArr.length < numQuestoes) pesArr.push(1)

  const tiposArr = tipoProva === 'objetiva' ? Array(numQuestoes).fill('O')
    : tipoProva === 'discursiva' ? Array(numQuestoes).fill('D')
    : tiposQuestoes

  const filledCount = gabArr.filter(a => a !== '').length

  function gabSelect(i: number, l: string) {
    const u = [...gabArr]; u[i] = u[i] === l ? '' : l; setGabarito(u.join(','))
  }
  function gabAnul(i: number) {
    const u = [...gabArr]; u[i] = u[i] === 'X' ? '' : 'X'; setGabarito(u.join(','))
  }
  function pesoChange(i: number, v: number) {
    const u = [...pesArr]; u[i] = v; setPesosQuestoes(u)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden">
        {/* ── Header ── */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-lg">
            {editMode ? 'Editar Prova' : 'Nova Prova'}
          </DialogTitle>
        </DialogHeader>

        {/* ── Steps indicator ── */}
        <div className="flex items-center px-6 pb-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const isActive = i === step
            const isDone = i < step
            return (
              <div key={s.id} className="flex items-center flex-1">
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                      : isDone
                        ? 'text-emerald-600'
                        : 'text-gray-400'
                  }`}
                >
                  {isDone ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-2 ${i < step ? 'bg-emerald-300' : 'bg-gray-200'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* ── Step content ── */}
        <div className="px-6 pb-2 min-h-[320px]">

          {/* ═══ STEP 1: Informações ═══ */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Disciplina</Label>
                  <Select value={disciplinaId} onValueChange={(v) => v && setDisciplinaId(v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {disciplinas.map(d => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Turma</Label>
                  <Select value={turmaId} onValueChange={(v) => v && setTurmaId(v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {turmas.map(t => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.serie} - {t.turma}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Data da Prova</Label>
                  <Input type="date" value={data} onChange={e => setData(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Bloco</Label>
                  <Input value={bloco} onChange={e => setBloco(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de Prova</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(['objetiva', 'mista', 'discursiva'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setTipoProva(t)}
                      className={`rounded-lg border-2 px-3 py-3 text-center transition-all ${
                        tipoProva === t
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}>
                      <div className="text-sm font-semibold capitalize">{t}</div>
                      <div className="text-[10px] mt-0.5 text-gray-400">
                        {t === 'objetiva' ? 'A/B/C/D/E' : t === 'mista' ? 'Obj + Disc' : 'C/P/E'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 2: Configuração ═══ */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Número de Questões</Label>
                  <Input type="number" min={1} max={50} value={numQuestoes}
                    onChange={e => setNumQuestoes(Number(e.target.value))} />
                </div>
                {tipoProva !== 'discursiva' && (
                  <div className="space-y-1.5">
                    <Label>Alternativas</Label>
                    <Select value={String(numAlternativas)} onValueChange={v => v && setNumAlternativas(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="4">4 alternativas (A–D)</SelectItem>
                        <SelectItem value="5">5 alternativas (A–E)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {tipoProva !== 'objetiva' && (
                  <div className="space-y-1.5">
                    <Label>Critério Discursiva</Label>
                    <Select value={String(criterioDiscursiva)} onValueChange={v => v && setCriterioDiscursiva(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">2 níveis — Certo / Errado</SelectItem>
                        <SelectItem value="3">3 níveis — Certo / Parcial / Errado</SelectItem>
                        <SelectItem value="4">4 níveis — Excelente / Bom / Parcial / Insuf.</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Avaliação</Label>
                  <Select value={modoAvaliacao} onValueChange={v => v && setModoAvaliacao(v as 'acertos'|'nota')}
                    disabled={tipoProva === 'discursiva'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="acertos">Por Acertos</SelectItem>
                      <SelectItem value="nota">Por Nota</SelectItem>
                    </SelectContent>
                  </Select>
                  {tipoProva === 'discursiva' && (
                    <p className="text-[10px] text-muted-foreground">Discursiva usa modo Nota automaticamente</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Se anular questão</Label>
                  <Select value={modoAnulacao} onValueChange={v => v && setModoAnulacao(v as 'contar_certa'|'redistribuir')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contar_certa">Contar como certa</SelectItem>
                      <SelectItem value="redistribuir">Redistribuir peso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {modoAvaliacao === 'nota' && tipoProva !== 'discursiva' && (
                <div className="space-y-1.5">
                  <Label>Nota Total</Label>
                  <Input type="number" min={1} step={0.5} value={notaTotal}
                    onChange={e => setNotaTotal(Number(e.target.value))} />
                </div>
              )}

              {/* O/D toggle for mista */}
              {tipoProva === 'mista' && numQuestoes > 0 && (
                <div className="space-y-2">
                  <Label>Marque as questões discursivas</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: numQuestoes }).map((_, i) => {
                      const t = tiposQuestoes[i] || 'O'
                      return (
                        <button key={i} type="button"
                          onClick={() => {
                            const nt = [...tiposQuestoes]
                            while (nt.length <= i) nt.push('O')
                            nt[i] = nt[i] === 'D' ? 'O' : 'D'
                            setTiposQuestoes(nt)
                          }}
                          className={`w-9 h-9 rounded-lg text-xs font-bold border-2 transition-all ${
                            t === 'D'
                              ? 'bg-blue-500 text-white border-blue-500 shadow-sm shadow-blue-200'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'
                          }`}>
                          <div className="text-[8px] leading-tight opacity-60">{i + 1}</div>
                          <div className="leading-tight">{t}</div>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {tiposQuestoes.filter(t => t === 'D').length} discursiva(s) · {tiposQuestoes.filter(t => t === 'O').length} objetiva(s)
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 3: Gabarito ═══ */}
          {step === 2 && (
            <div className="space-y-3">
              {/* Legend */}
              <div className="flex items-center gap-4 text-[11px] text-gray-500">
                {tipoProva !== 'discursiva' && (
                  <>
                    <span className="flex items-center gap-1">
                      <Circle className="h-2.5 w-2.5 fill-indigo-500 text-indigo-500" /> Resposta
                    </span>
                    <span className="flex items-center gap-1">
                      <Circle className="h-2.5 w-2.5 fill-amber-500 text-amber-500" /> Anulada
                    </span>
                  </>
                )}
                {tipoProva !== 'objetiva' && (
                  <span className="flex items-center gap-1">
                    <Circle className="h-2.5 w-2.5 fill-blue-500 text-blue-500" /> Discursiva
                  </span>
                )}
              </div>

              {/* Grid */}
              <div className="max-h-[260px] overflow-y-auto rounded-xl border border-gray-200 bg-gray-50/50">
                {Array.from({ length: numQuestoes }).map((_, idx) => {
                  const isD = tiposArr[idx] === 'D'
                  const ans = gabArr[idx] || ''

                  return (
                    <div key={idx}
                      className={`flex items-center px-3 py-1.5 ${
                        idx < numQuestoes - 1 ? 'border-b border-gray-100' : ''
                      } ${isD ? 'bg-blue-50/60' : 'bg-white'}`}>

                      {/* Question number */}
                      <span className={`w-7 text-xs font-bold tabular-nums ${isD ? 'text-blue-500' : 'text-gray-400'}`}>
                        {idx + 1}
                      </span>

                      {/* Buttons area */}
                      <div className="flex items-center gap-1 flex-1">
                        {isD ? (
                          <>
                            {discInfo.labels.map((label, li) => (
                              <span key={label}
                                className={`inline-flex items-center justify-center h-7 w-7 rounded-md text-[11px] font-bold text-white ${discInfo.cores[li]}`}>
                                {label}
                              </span>
                            ))}
                          </>
                        ) : (
                          <>
                            {ALTS.map(letter => (
                              <button key={letter} type="button" onClick={() => gabSelect(idx, letter)}
                                className={`h-7 w-7 rounded-md text-[11px] font-bold transition-all ${
                                  ans === letter
                                    ? 'bg-indigo-500 text-white shadow-sm shadow-indigo-200'
                                    : 'bg-white text-gray-500 border border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                                }`}>
                                {letter}
                              </button>
                            ))}
                            <button type="button" onClick={() => gabAnul(idx)}
                              className={`h-7 w-7 rounded-md text-[11px] font-bold transition-all ml-0.5 ${
                                ans === 'X'
                                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-200'
                                  : 'bg-white text-gray-400 border border-gray-200 hover:border-amber-300 hover:text-amber-600'
                              }`}>
                              X
                            </button>
                          </>
                        )}
                      </div>

                      {/* Valor (for discursive) */}
                      {isD && (
                        <div className="ml-auto pl-2">
                          <input type="number" min={0} step={0.5}
                            value={pesArr[idx] || ''}
                            onChange={e => pesoChange(idx, Number(e.target.value))}
                            className="w-14 h-7 text-xs text-center rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                            placeholder="pts" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Summary */}
              <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium ${
                filledCount >= numQuestoes ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
              }`}>
                <span>{filledCount >= numQuestoes ? '✓' : '○'} {filledCount}/{numQuestoes} questões</span>
                {tipoProva !== 'objetiva' && (
                  <span>
                    {pesArr.slice(0, numQuestoes).filter((_, i) => tiposArr[i] === 'D').reduce((s, v) => s + (v || 0), 0).toFixed(1)} pontos
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer with navigation ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50/80">
          <div>
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(s => s - 1)} className="gap-1.5">
                <ChevronLeft className="h-4 w-4" /> Voltar
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            {step < 2 ? (
              <Button onClick={() => setStep(s => s + 1)} className="gap-1.5">
                Próximo <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Salvando...' : editMode ? 'Salvar' : 'Criar Prova'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
