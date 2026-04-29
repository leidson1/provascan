'use client'

import { useMemo, useState } from 'react'
import {
  ChevronRight, ChevronLeft, Save, Loader2, BookOpen, Settings2,
  ClipboardList, Check, Circle, ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import type { Disciplina, Turma } from '@/types/database'

export interface ProvaFormData {
  data: string
  bloco: string
  disciplinaId: string
  turmaId: string
  turmaIds: string[]
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

function createInitialFormState(initial?: Partial<ProvaFormData>): ProvaFormData {
  return {
    data: initial?.data || new Date().toISOString().split('T')[0],
    bloco: initial?.bloco || 'B1',
    disciplinaId: initial?.disciplinaId || '',
    turmaId: initial?.turmaId || '',
    turmaIds: initial?.turmaIds && initial.turmaIds.length > 0
      ? initial.turmaIds
      : (initial?.turmaId ? [initial.turmaId] : []),
    tipoProva: initial?.tipoProva || 'objetiva',
    numQuestoes: initial?.numQuestoes || 10,
    numAlternativas: initial?.numAlternativas || 5,
    criterioDiscursiva: initial?.criterioDiscursiva || 3,
    modoAvaliacao: initial?.modoAvaliacao || 'acertos',
    notaTotal: initial?.notaTotal || 10,
    modoAnulacao: initial?.modoAnulacao || 'contar_certa',
    tiposQuestoes: initial?.tiposQuestoes || [],
    gabarito: initial?.gabarito || '',
    pesosQuestoes: initial?.pesosQuestoes || [],
  }
}

function syncTiposQuestoes(
  tipoProva: ProvaFormData['tipoProva'],
  numQuestoes: number,
  tiposQuestoes: string[]
) {
  if (tipoProva === 'discursiva') return Array(numQuestoes).fill('D')
  if (tipoProva === 'objetiva') return Array(numQuestoes).fill('O')

  const next = [...tiposQuestoes]
  while (next.length < numQuestoes) next.push('O')
  if (next.length > numQuestoes) next.length = numQuestoes
  return next
}

function Dropdown({ label, value, options, onChange, disabled }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value)

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={`flex h-9 w-full items-center justify-between rounded-lg border bg-white px-3 text-sm transition-colors ${
          disabled ? 'cursor-not-allowed border-gray-200 opacity-50' : 'border-gray-300 hover:border-indigo-400'
        } ${open ? 'border-indigo-500 ring-2 ring-indigo-100' : ''}`}
      >
        <span className={selected ? 'truncate pr-2 text-gray-900' : 'truncate pr-2 text-gray-400'}>
          {selected?.label || label}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center px-3 py-2 text-sm transition-colors hover:bg-indigo-50 ${
                  option.value === value ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-gray-700'
                }`}
              >
                {option.value === value && <Check className="mr-2 h-3.5 w-3.5 shrink-0 text-indigo-500" />}
                <span className={option.value === value ? '' : 'pl-5.5'}>{option.label}</span>
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

const CRITERIO_LABELS: Record<number, { labels: string[]; cores: string[] }> = {
  2: { labels: ['C', 'E'], cores: ['bg-emerald-500', 'bg-red-500'] },
  3: { labels: ['C', 'P', 'E'], cores: ['bg-emerald-500', 'bg-amber-400', 'bg-red-500'] },
  4: { labels: ['E', 'B', 'P', 'I'], cores: ['bg-emerald-500', 'bg-teal-400', 'bg-amber-400', 'bg-red-500'] },
}

export function ProvaModal({
  open,
  onOpenChange,
  disciplinas,
  turmas,
  saving,
  onSave,
  initial,
  editMode,
}: ProvaModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ProvaModalInner
          disciplinas={disciplinas}
          turmas={turmas}
          saving={saving}
          onSave={onSave}
          initial={initial}
          editMode={editMode}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </Dialog>
  )
}

function ProvaModalInner({
  onOpenChange,
  disciplinas,
  turmas,
  saving,
  onSave,
  initial,
  editMode,
}: Omit<ProvaModalProps, 'open'>) {
  const initialState = createInitialFormState(initial)

  const [step, setStep] = useState(0)
  const [data, setData] = useState(initialState.data)
  const [bloco, setBloco] = useState(initialState.bloco)
  const [disciplinaId, setDisciplinaId] = useState(initialState.disciplinaId)
  const [turmaId, setTurmaId] = useState(initialState.turmaId)
  const [turmaIds, setTurmaIds] = useState<string[]>(initialState.turmaIds)
  const [tipoProva, setTipoProva] = useState<ProvaFormData['tipoProva']>(initialState.tipoProva)
  const [numQuestoes, setNumQuestoes] = useState(initialState.numQuestoes)
  const [numAlternativas, setNumAlternativas] = useState(initialState.numAlternativas)
  const [criterioDiscursiva, setCriterioDiscursiva] = useState(initialState.criterioDiscursiva)
  const [modoAvaliacao, setModoAvaliacao] = useState<ProvaFormData['modoAvaliacao']>(initialState.modoAvaliacao)
  const [notaTotal, setNotaTotal] = useState(initialState.notaTotal)
  const [modoAnulacao, setModoAnulacao] = useState<ProvaFormData['modoAnulacao']>(initialState.modoAnulacao)
  const [tiposQuestoes, setTiposQuestoes] = useState<string[]>(
    syncTiposQuestoes(initialState.tipoProva, initialState.numQuestoes, initialState.tiposQuestoes)
  )
  const [gabarito, setGabarito] = useState(initialState.gabarito)
  const [pesosQuestoes, setPesosQuestoes] = useState<number[]>(initialState.pesosQuestoes)

  const discOpts = useMemo(
    () => disciplinas.map((disciplina) => ({ value: String(disciplina.id), label: disciplina.nome })),
    [disciplinas]
  )
  const turmaOpts = useMemo(
    () => turmas.map((turma) => ({ value: String(turma.id), label: `${turma.serie} - ${turma.turma}` })),
    [turmas]
  )

  function handleTipoProvaChange(nextTipo: ProvaFormData['tipoProva']) {
    setTipoProva(nextTipo)
    setTiposQuestoes((prev) => syncTiposQuestoes(nextTipo, numQuestoes, prev))
    if (nextTipo === 'discursiva') {
      setModoAvaliacao('nota')
    }
  }

  function handleNumQuestoesChange(nextNumQuestoes: number) {
    const safeNumQuestoes = Math.max(1, nextNumQuestoes || 1)
    setNumQuestoes(safeNumQuestoes)
    setTiposQuestoes((prev) => syncTiposQuestoes(tipoProva, safeNumQuestoes, prev))
  }

  function handleSave() {
    const gabArr = gabarito ? gabarito.split(',') : []
    while (gabArr.length < numQuestoes) gabArr.push('')

    const finalTipos = syncTiposQuestoes(tipoProva, numQuestoes, tiposQuestoes)
    for (let i = 0; i < numQuestoes; i++) {
      if (finalTipos[i] === 'D' && gabArr[i] !== 'D') gabArr[i] = 'D'
    }

    const finalTurmaIds = editMode
      ? [turmaId]
      : turmaIds.length > 0
        ? turmaIds
        : (turmaId ? [turmaId] : [])

    onSave({
      data,
      bloco,
      disciplinaId,
      turmaId: finalTurmaIds[0] || '',
      turmaIds: finalTurmaIds,
      tipoProva,
      numQuestoes,
      numAlternativas,
      criterioDiscursiva,
      modoAvaliacao,
      notaTotal,
      modoAnulacao,
      tiposQuestoes: finalTipos,
      gabarito: gabArr.join(','),
      pesosQuestoes,
    })
  }

  const alternativas = ['A', 'B', 'C', 'D', 'E'].slice(0, numAlternativas)
  const discInfo = CRITERIO_LABELS[criterioDiscursiva] || CRITERIO_LABELS[3]
  const gabArr = gabarito ? gabarito.split(',') : []
  while (gabArr.length < numQuestoes) gabArr.push('')
  if (gabArr.length > numQuestoes) gabArr.length = numQuestoes

  const pesArr = [...pesosQuestoes]
  while (pesArr.length < numQuestoes) pesArr.push(1)

  const tiposArr = syncTiposQuestoes(tipoProva, numQuestoes, tiposQuestoes)
  const filledCount = gabArr.filter((item) => item !== '').length

  function gabSelect(index: number, value: string) {
    const next = [...gabArr]
    next[index] = next[index] === value ? '' : value
    setGabarito(next.join(','))
  }

  function gabAnul(index: number) {
    const next = [...gabArr]
    next[index] = next[index] === 'X' ? '' : 'X'
    setGabarito(next.join(','))
  }

  function pesoChange(index: number, value: number) {
    const next = [...pesArr]
    next[index] = value
    setPesosQuestoes(next)
  }

  return (
    <DialogContent className="gap-0 p-0 sm:max-w-[540px]">
      <DialogHeader className="px-6 pb-3 pt-5">
        <DialogTitle className="text-lg font-bold">
          {editMode ? 'Editar Prova' : 'Nova Prova'}
        </DialogTitle>
      </DialogHeader>

      <div className="flex items-center gap-1 px-6 pb-4">
        {STEPS.map((stepItem, index) => {
          const Icon = stepItem.icon
          const active = index === step
          const done = index < step

          return (
            <div key={stepItem.id} className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => setStep(index)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  active ? 'bg-indigo-100 text-indigo-700' : done ? 'text-emerald-600' : 'text-gray-400'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                {stepItem.label}
              </button>
              {index < 2 && <div className={`mx-1.5 h-px flex-1 ${done ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
            </div>
          )
        })}
      </div>

      <div className="min-h-[340px] px-6 pb-3">
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Disciplina</Label>
              <Dropdown
                label="Selecione a disciplina..."
                value={disciplinaId}
                options={discOpts}
                onChange={setDisciplinaId}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Turma{!editMode && 's'}
                {!editMode && turmaIds.length > 1 && (
                  <span className="ml-2 text-xs font-normal text-indigo-600">
                    ({turmaIds.length} selecionada{turmaIds.length > 1 ? 's' : ''} — será criada uma prova para cada)
                  </span>
                )}
              </Label>

              {editMode ? (
                <Dropdown
                  label="Selecione a turma..."
                  value={turmaId}
                  options={turmaOpts}
                  onChange={setTurmaId}
                />
              ) : (
                <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                  {turmaOpts.map((turma) => (
                    <label
                      key={turma.value}
                      className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 transition-colors hover:bg-gray-50 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={turmaIds.includes(turma.value)}
                        onChange={(event) => {
                          const nextTurmaIds = event.target.checked
                            ? [...turmaIds, turma.value]
                            : turmaIds.filter((id) => id !== turma.value)

                          setTurmaIds(nextTurmaIds)
                          setTurmaId(nextTurmaIds[0] || '')
                        }}
                      />
                      <span className="text-sm text-gray-700">{turma.label}</span>
                    </label>
                  ))}
                  {turmaOpts.length === 0 && (
                    <p className="py-3 text-center text-xs text-gray-400">Nenhuma turma cadastrada</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Data da Prova</Label>
                <Input className="h-9" type="date" value={data} onChange={(event) => setData(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Bloco</Label>
                <Input className="h-9" value={bloco} onChange={(event) => setBloco(event.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Tipo de Prova</Label>
              <div className="grid grid-cols-3 gap-2 pt-1">
                {[
                  { key: 'objetiva' as const, title: 'Objetiva', desc: 'Alternativas A–E' },
                  { key: 'mista' as const, title: 'Mista', desc: 'Objetiva + Discursiva' },
                  { key: 'discursiva' as const, title: 'Discursiva', desc: 'Critérios C/P/E' },
                ].map((tipo) => (
                  <button
                    key={tipo.key}
                    type="button"
                    onClick={() => handleTipoProvaChange(tipo.key)}
                    className={`rounded-xl border-2 p-3 text-center transition-all ${
                      tipoProva === tipo.key
                        ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`text-sm font-semibold ${tipoProva === tipo.key ? 'text-indigo-700' : 'text-gray-700'}`}>
                      {tipo.title}
                    </div>
                    <div className="mt-0.5 text-[10px] text-gray-400">{tipo.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Número de Questões</Label>
                <Input
                  className="h-9"
                  type="number"
                  min={1}
                  max={50}
                  value={numQuestoes}
                  onChange={(event) => handleNumQuestoesChange(Number(event.target.value))}
                />
              </div>

              {tipoProva !== 'discursiva' && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Alternativas</Label>
                  <Dropdown
                    label="Selecione..."
                    value={String(numAlternativas)}
                    onChange={(value) => setNumAlternativas(Number(value))}
                    options={[
                      { value: '4', label: '4 alternativas (A–D)' },
                      { value: '5', label: '5 alternativas (A–E)' },
                    ]}
                  />
                </div>
              )}

              {tipoProva !== 'objetiva' && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Critério Discursiva</Label>
                  <Dropdown
                    label="Selecione..."
                    value={String(criterioDiscursiva)}
                    onChange={(value) => setCriterioDiscursiva(Number(value))}
                    options={[
                      { value: '2', label: '2 níveis — Certo / Errado' },
                      { value: '3', label: '3 níveis — Certo / Parcial / Errado' },
                      { value: '4', label: '4 níveis — Excelente / Bom / Parcial / Insuf.' },
                    ]}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Avaliação</Label>
                <Dropdown
                  label="Selecione..."
                  value={modoAvaliacao}
                  onChange={(value) => setModoAvaliacao(value as 'acertos' | 'nota')}
                  disabled={tipoProva === 'discursiva'}
                  options={[
                    { value: 'acertos', label: 'Por Acertos' },
                    { value: 'nota', label: 'Por Nota' },
                  ]}
                />
                {tipoProva === 'discursiva' && (
                  <p className="text-[10px] text-gray-400">Discursiva usa nota automaticamente</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Se anular questão</Label>
                <Dropdown
                  label="Selecione..."
                  value={modoAnulacao}
                  onChange={(value) => setModoAnulacao(value as 'contar_certa' | 'redistribuir')}
                  options={[
                    { value: 'contar_certa', label: 'Contar como certa' },
                    { value: 'redistribuir', label: 'Redistribuir peso' },
                  ]}
                />
              </div>
            </div>

            {modoAvaliacao === 'nota' && tipoProva !== 'discursiva' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Nota Total</Label>
                <Input
                  className="h-9 max-w-[200px]"
                  type="number"
                  min={1}
                  step={0.5}
                  value={notaTotal}
                  onChange={(event) => setNotaTotal(Number(event.target.value))}
                />
              </div>
            )}

            {tipoProva === 'mista' && numQuestoes > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Marque as questões discursivas</Label>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: numQuestoes }).map((_, index) => {
                    const tipo = tiposQuestoes[index] || 'O'
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => {
                          const next = [...tiposQuestoes]
                          while (next.length <= index) next.push('O')
                          next[index] = next[index] === 'D' ? 'O' : 'D'
                          setTiposQuestoes(next)
                        }}
                        className={`h-9 w-9 rounded-lg border-2 text-xs font-bold transition-all ${
                          tipo === 'D'
                            ? 'border-blue-500 bg-blue-500 text-white shadow-sm shadow-blue-200'
                            : 'border-gray-200 bg-white text-gray-500 hover:border-indigo-300'
                        }`}
                      >
                        <div className="text-[8px] leading-tight opacity-60">{index + 1}</div>
                        <div className="leading-tight">{tipo}</div>
                      </button>
                    )
                  })}
                </div>
                <p className="text-[10px] text-gray-400">
                  {tiposQuestoes.filter((tipo) => tipo === 'D').length} discursiva(s) ·{' '}
                  {tiposQuestoes.filter((tipo) => tipo === 'O').length} objetiva(s)
                </p>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
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

            <div className="max-h-[260px] overflow-y-auto rounded-xl border border-gray-200">
              {Array.from({ length: numQuestoes }).map((_, index) => {
                const isDiscursiva = tiposArr[index] === 'D'
                const answer = gabArr[index] || ''

                return (
                  <div
                    key={index}
                    className={`flex items-center px-3 py-1.5 ${
                      index < numQuestoes - 1 ? 'border-b border-gray-100' : ''
                    } ${isDiscursiva ? 'bg-blue-50/60' : index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                  >
                    <span className={`w-8 shrink-0 text-xs font-bold tabular-nums ${isDiscursiva ? 'text-blue-500' : 'text-gray-400'}`}>
                      {index + 1}
                    </span>

                    <div className="flex flex-1 items-center gap-1.5">
                      {isDiscursiva ? (
                        discInfo.labels.map((label, labelIndex) => (
                          <span
                            key={label}
                            className={`inline-flex h-7 w-8 items-center justify-center rounded-md text-[11px] font-bold text-white ${discInfo.cores[labelIndex]}`}
                          >
                            {label}
                          </span>
                        ))
                      ) : (
                        <>
                          {alternativas.map((letter) => (
                            <button
                              key={letter}
                              type="button"
                              onClick={() => gabSelect(index, letter)}
                              className={`h-7 w-8 rounded-md text-[11px] font-bold transition-all ${
                                answer === letter
                                  ? 'bg-indigo-500 text-white shadow-sm'
                                  : 'border border-gray-200 bg-white text-gray-500 hover:border-indigo-300'
                              }`}
                            >
                              {letter}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => gabAnul(index)}
                            className={`h-7 w-8 rounded-md text-[11px] font-bold transition-all ${
                              answer === 'X'
                                ? 'bg-amber-500 text-white shadow-sm'
                                : 'border border-gray-200 bg-white text-gray-400 hover:border-amber-300'
                            }`}
                          >
                            X
                          </button>
                        </>
                      )}
                    </div>

                    {isDiscursiva && (
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={pesArr[index] || ''}
                        onChange={(event) => pesoChange(index, Number(event.target.value))}
                        className="ml-2 h-7 w-16 rounded-md border border-gray-200 bg-white text-center text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="pontos"
                      />
                    )}
                  </div>
                )
              })}
            </div>

            <div
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium ${
                filledCount >= numQuestoes
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
              }`}
            >
              <span>{filledCount >= numQuestoes ? '✓' : '○'} {filledCount}/{numQuestoes} questões</span>
              {tipoProva !== 'objetiva' && (
                <span>
                  {pesArr
                    .slice(0, numQuestoes)
                    .filter((_, index) => tiposArr[index] === 'D')
                    .reduce((sum, value) => sum + (value || 0), 0)
                    .toFixed(1)} pontos
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t bg-gray-50/80 px-6 py-4">
        <div>
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep((current) => current - 1)} className="gap-1.5">
              <ChevronLeft className="h-4 w-4" /> Voltar
            </Button>
          ) : <div />}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {step < 2 ? (
            <Button onClick={() => setStep((current) => current + 1)} className="gap-1.5">
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
  )
}
