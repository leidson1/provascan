'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  ChevronRight, ChevronLeft, Save, Loader2, BookOpen, Settings2,
  ClipboardList, Check, Circle, ChevronDown
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
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

// ── Custom Dropdown (replace shadcn Select to fix display issues) ──
function Dropdown({ label, value, options, onChange, disabled }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.value === value)

  return (
    <div className="relative">
      <button type="button" disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={`flex w-full items-center justify-between rounded-lg border bg-white px-3 h-9 text-sm transition-colors ${
          disabled ? 'opacity-50 cursor-not-allowed border-gray-200' : 'border-gray-300 hover:border-indigo-400'
        } ${open ? 'border-indigo-500 ring-2 ring-indigo-100' : ''}`}>
        <span className={selected ? 'text-gray-900 truncate pr-2' : 'text-gray-400 truncate pr-2'}>
          {selected?.label || label}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
            {options.map(o => (
              <button key={o.value} type="button"
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`flex w-full items-center px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                  o.value === value ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                }`}>
                {o.value === value && <Check className="h-3.5 w-3.5 mr-2 text-indigo-500 shrink-0" />}
                <span className={o.value === value ? '' : 'pl-5.5'}>{o.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
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

  // Dropdown options
  const discOpts = useMemo(() => disciplinas.map(d => ({ value: String(d.id), label: d.nome })), [disciplinas])
  const turmaOpts = useMemo(() => turmas.map(t => ({ value: String(t.id), label: `${t.serie} - ${t.turma}` })), [turmas])

  useEffect(() => {
    if (open) {
      setStep(0)
      const i = initial
      setData(i?.data || new Date().toISOString().split('T')[0])
      setBloco(i?.bloco || 'B1')
      setDisciplinaId(i?.disciplinaId || '')
      setTurmaId(i?.turmaId || '')
      setTipoProva(i?.tipoProva || 'objetiva')
      setNumQuestoes(i?.numQuestoes || 10)
      setNumAlternativas(i?.numAlternativas || 5)
      setCriterioDiscursiva(i?.criterioDiscursiva || 3)
      setModoAvaliacao(i?.modoAvaliacao || 'acertos')
      setNotaTotal(i?.notaTotal || 10)
      setModoAnulacao(i?.modoAnulacao || 'contar_certa')
      setTiposQuestoes(i?.tiposQuestoes || [])
      setGabarito(i?.gabarito || '')
      setPesosQuestoes(i?.pesosQuestoes || [])
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tipoProva === 'discursiva') {
      setTiposQuestoes(Array(numQuestoes).fill('D'))
      setModoAvaliacao('nota')
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

  function handleSave() {
    const gabArr = gabarito ? gabarito.split(',') : []
    while (gabArr.length < numQuestoes) gabArr.push('')
    const finalTipos = tipoProva === 'objetiva' ? Array(numQuestoes).fill('O')
      : tipoProva === 'discursiva' ? Array(numQuestoes).fill('D') : tiposQuestoes
    for (let i = 0; i < numQuestoes; i++) {
      if (finalTipos[i] === 'D' && gabArr[i] !== 'D') gabArr[i] = 'D'
    }
    onSave({
      data, bloco, disciplinaId, turmaId, tipoProva, numQuestoes,
      numAlternativas, criterioDiscursiva, modoAvaliacao, notaTotal,
      modoAnulacao, tiposQuestoes: finalTipos,
      gabarito: gabArr.join(','), pesosQuestoes,
    })
  }

  // ── Gabarito data ──
  const ALTS = ['A', 'B', 'C', 'D', 'E'].slice(0, numAlternativas)
  const discInfo = CRITERIO_LABELS[criterioDiscursiva] || CRITERIO_LABELS[3]
  const gabArr = gabarito ? gabarito.split(',') : []
  while (gabArr.length < numQuestoes) gabArr.push('')
  if (gabArr.length > numQuestoes) gabArr.length = numQuestoes
  const pesArr = [...pesosQuestoes]
  while (pesArr.length < numQuestoes) pesArr.push(1)
  const tiposArr = tipoProva === 'objetiva' ? Array(numQuestoes).fill('O')
    : tipoProva === 'discursiva' ? Array(numQuestoes).fill('D') : tiposQuestoes
  const filledCount = gabArr.filter(a => a !== '').length

  function gabSelect(i: number, l: string) { const u = [...gabArr]; u[i] = u[i] === l ? '' : l; setGabarito(u.join(',')) }
  function gabAnul(i: number) { const u = [...gabArr]; u[i] = u[i] === 'X' ? '' : 'X'; setGabarito(u.join(',')) }
  function pesoChange(i: number, v: number) { const u = [...pesArr]; u[i] = v; setPesosQuestoes(u) }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] p-0 gap-0 overflow-hidden">
        {/* ── Header ── */}
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="text-lg font-bold">
            {editMode ? 'Editar Prova' : 'Nova Prova'}
          </DialogTitle>
        </DialogHeader>

        {/* ── Steps ── */}
        <div className="flex items-center gap-1 px-6 pb-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const active = i === step
            const done = i < step
            return (
              <div key={s.id} className="flex items-center flex-1">
                <button type="button" onClick={() => setStep(i)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    active ? 'bg-indigo-100 text-indigo-700' : done ? 'text-emerald-600' : 'text-gray-400'
                  }`}>
                  {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  {s.label}
                </button>
                {i < 2 && <div className={`flex-1 h-px mx-1.5 ${done ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
              </div>
            )
          })}
        </div>

        {/* ── Content ── */}
        <div className="px-6 pb-3 min-h-[340px]">

          {/* ═══ STEP 1 ═══ */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Disciplina</Label>
                <Dropdown label="Selecione a disciplina..." value={disciplinaId} options={discOpts} onChange={setDisciplinaId} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Turma</Label>
                <Dropdown label="Selecione a turma..." value={turmaId} options={turmaOpts} onChange={setTurmaId} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Data da Prova</Label>
                  <Input className="h-9" type="date" value={data} onChange={e => setData(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Bloco</Label>
                  <Input className="h-9" value={bloco} onChange={e => setBloco(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Tipo de Prova</Label>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {([
                    { key: 'objetiva' as const, title: 'Objetiva', desc: 'Alternativas A–E' },
                    { key: 'mista' as const, title: 'Mista', desc: 'Objetiva + Discursiva' },
                    { key: 'discursiva' as const, title: 'Discursiva', desc: 'Critérios C/P/E' },
                  ]).map(t => (
                    <button key={t.key} type="button" onClick={() => setTipoProva(t.key)}
                      className={`rounded-xl border-2 p-3 text-center transition-all ${
                        tipoProva === t.key
                          ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <div className={`text-sm font-semibold ${tipoProva === t.key ? 'text-indigo-700' : 'text-gray-700'}`}>{t.title}</div>
                      <div className="text-[10px] mt-0.5 text-gray-400">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 2 ═══ */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Número de Questões</Label>
                  <Input className="h-9" type="number" min={1} max={50} value={numQuestoes}
                    onChange={e => setNumQuestoes(Number(e.target.value))} />
                </div>
                {tipoProva !== 'discursiva' && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Alternativas</Label>
                    <Dropdown label="Selecione..." value={String(numAlternativas)} onChange={v => setNumAlternativas(Number(v))}
                      options={[{ value: '4', label: '4 alternativas (A–D)' }, { value: '5', label: '5 alternativas (A–E)' }]} />
                  </div>
                )}
                {tipoProva !== 'objetiva' && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Critério Discursiva</Label>
                    <Dropdown label="Selecione..." value={String(criterioDiscursiva)} onChange={v => setCriterioDiscursiva(Number(v))}
                      options={[
                        { value: '2', label: '2 níveis — Certo / Errado' },
                        { value: '3', label: '3 níveis — Certo / Parcial / Errado' },
                        { value: '4', label: '4 níveis — Excelente / Bom / Parcial / Insuf.' },
                      ]} />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Avaliação</Label>
                  <Dropdown label="Selecione..." value={modoAvaliacao} onChange={v => setModoAvaliacao(v as 'acertos'|'nota')}
                    disabled={tipoProva === 'discursiva'}
                    options={[{ value: 'acertos', label: 'Por Acertos' }, { value: 'nota', label: 'Por Nota' }]} />
                  {tipoProva === 'discursiva' && (
                    <p className="text-[10px] text-gray-400">Discursiva usa nota automaticamente</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Se anular questão</Label>
                  <Dropdown label="Selecione..." value={modoAnulacao} onChange={v => setModoAnulacao(v as 'contar_certa'|'redistribuir')}
                    options={[{ value: 'contar_certa', label: 'Contar como certa' }, { value: 'redistribuir', label: 'Redistribuir peso' }]} />
                </div>
              </div>

              {modoAvaliacao === 'nota' && tipoProva !== 'discursiva' && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Nota Total</Label>
                  <Input className="h-9 max-w-[200px]" type="number" min={1} step={0.5} value={notaTotal}
                    onChange={e => setNotaTotal(Number(e.target.value))} />
                </div>
              )}

              {tipoProva === 'mista' && numQuestoes > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Marque as questões discursivas</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: numQuestoes }).map((_, i) => {
                      const t = tiposQuestoes[i] || 'O'
                      return (
                        <button key={i} type="button"
                          onClick={() => {
                            const nt = [...tiposQuestoes]; while (nt.length <= i) nt.push('O')
                            nt[i] = nt[i] === 'D' ? 'O' : 'D'; setTiposQuestoes(nt)
                          }}
                          className={`w-9 h-9 rounded-lg text-xs font-bold border-2 transition-all ${
                            t === 'D' ? 'bg-blue-500 text-white border-blue-500 shadow-sm shadow-blue-200'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'
                          }`}>
                          <div className="text-[8px] leading-tight opacity-60">{i + 1}</div>
                          <div className="leading-tight">{t}</div>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-gray-400">
                    {tiposQuestoes.filter(t => t === 'D').length} discursiva(s) · {tiposQuestoes.filter(t => t === 'O').length} objetiva(s)
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 3: Gabarito ═══ */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-[11px] text-gray-500">
                {tipoProva !== 'discursiva' && (
                  <>
                    <span className="flex items-center gap-1"><Circle className="h-2.5 w-2.5 fill-indigo-500 text-indigo-500" /> Resposta</span>
                    <span className="flex items-center gap-1"><Circle className="h-2.5 w-2.5 fill-amber-500 text-amber-500" /> Anulada</span>
                  </>
                )}
                {tipoProva !== 'objetiva' && (
                  <span className="flex items-center gap-1"><Circle className="h-2.5 w-2.5 fill-blue-500 text-blue-500" /> Discursiva</span>
                )}
              </div>

              <div className="max-h-[260px] overflow-y-auto rounded-xl border border-gray-200">
                {Array.from({ length: numQuestoes }).map((_, idx) => {
                  const isD = tiposArr[idx] === 'D'
                  const ans = gabArr[idx] || ''
                  return (
                    <div key={idx} className={`flex items-center px-3 py-1.5 ${idx < numQuestoes - 1 ? 'border-b border-gray-100' : ''} ${isD ? 'bg-blue-50/60' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <span className={`w-8 text-xs font-bold tabular-nums shrink-0 ${isD ? 'text-blue-500' : 'text-gray-400'}`}>{idx + 1}</span>
                      <div className="flex items-center gap-1.5 flex-1">
                        {isD ? (
                          discInfo.labels.map((label, li) => (
                            <span key={label} className={`inline-flex items-center justify-center h-7 w-8 rounded-md text-[11px] font-bold text-white ${discInfo.cores[li]}`}>{label}</span>
                          ))
                        ) : (
                          <>
                            {ALTS.map(letter => (
                              <button key={letter} type="button" onClick={() => gabSelect(idx, letter)}
                                className={`h-7 w-8 rounded-md text-[11px] font-bold transition-all ${
                                  ans === letter ? 'bg-indigo-500 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:border-indigo-300'
                                }`}>{letter}</button>
                            ))}
                            <button type="button" onClick={() => gabAnul(idx)}
                              className={`h-7 w-8 rounded-md text-[11px] font-bold transition-all ${
                                ans === 'X' ? 'bg-amber-500 text-white shadow-sm' : 'bg-white text-gray-400 border border-gray-200 hover:border-amber-300'
                              }`}>X</button>
                          </>
                        )}
                      </div>
                      {isD && (
                        <input type="number" min={0} step={0.5} value={pesArr[idx] || ''}
                          onChange={e => pesoChange(idx, Number(e.target.value))}
                          className="w-16 h-7 text-xs text-center rounded-md border border-gray-200 bg-white ml-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          placeholder="pontos" />
                      )}
                    </div>
                  )
                })}
              </div>

              <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium ${
                filledCount >= numQuestoes ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
              }`}>
                <span>{filledCount >= numQuestoes ? '✓' : '○'} {filledCount}/{numQuestoes} questões</span>
                {tipoProva !== 'objetiva' && (
                  <span>{pesArr.slice(0, numQuestoes).filter((_, i) => tiposArr[i] === 'D').reduce((s, v) => s + (v || 0), 0).toFixed(1)} pontos</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50/80">
          <div>
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep(s => s - 1)} className="gap-1.5">
                <ChevronLeft className="h-4 w-4" /> Voltar
              </Button>
            ) : <div />}
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
