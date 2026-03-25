'use client'

import { useCallback, useRef, useEffect } from 'react'
import { CRITERIOS_DISCURSIVA } from '@/types/database'

interface CorrectionGridProps {
  gabarito: string[]
  numQuestoes: number
  numAlternativas: number
  alunos: Array<{ id: number; nome: string; numero: number | null }>
  dados: Record<
    number,
    {
      presenca: string
      questoes: Record<string, number>
      acertos: number
      percentual: number
    }
  >
  onTogglePresenca: (alunoId: number) => void
  onToggleQuestao: (alunoId: number, qIndex: number) => void
  modoVisualizacao?: boolean
  tiposQuestoes?: string[]
  criterioDiscursiva?: number
}

function getDiscursivaStyle(valor: number | undefined) {
  if (valor === undefined) return 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
  if (valor >= 1.0) return 'bg-green-500 text-white border-green-600 hover:bg-green-600'
  if (valor >= 0.75) return 'bg-emerald-400 text-white border-emerald-500 hover:bg-emerald-500'
  if (valor >= 0.5) return 'bg-yellow-400 text-white border-yellow-500 hover:bg-yellow-500'
  return 'bg-red-500 text-white border-red-600 hover:bg-red-600'
}

function getDiscursivaLabel(valor: number | undefined, criterio: number) {
  const criterios = CRITERIOS_DISCURSIVA[criterio as 2 | 3 | 4]
  const found = criterios?.find((c) => c.valor === valor)
  return found?.label || '–'
}

export function CorrectionGrid({
  gabarito,
  numQuestoes,
  alunos,
  dados,
  onTogglePresenca,
  onToggleQuestao,
  modoVisualizacao = false,
  tiposQuestoes = [],
  criterioDiscursiva = 3,
}: CorrectionGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)

  // Keyboard navigation
  const focusedCell = useRef<{ row: number; col: number }>({ row: 0, col: 0 })

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (modoVisualizacao) return
      const grid = gridRef.current
      if (!grid) return

      const buttons = grid.querySelectorAll<HTMLButtonElement>(
        '[data-row][data-col]'
      )
      if (!buttons.length) return

      const { row, col } = focusedCell.current
      let newRow = row
      let newCol = col

      switch (e.key) {
        case 'ArrowRight':
          newCol = Math.min(col + 1, numQuestoes)
          e.preventDefault()
          break
        case 'ArrowLeft':
          newCol = Math.max(col - 1, 0)
          e.preventDefault()
          break
        case 'ArrowDown':
          newRow = Math.min(row + 1, alunos.length - 1)
          e.preventDefault()
          break
        case 'ArrowUp':
          newRow = Math.max(row - 1, 0)
          e.preventDefault()
          break
        default:
          return
      }

      focusedCell.current = { row: newRow, col: newCol }
      const target = grid.querySelector<HTMLButtonElement>(
        `[data-row="${newRow}"][data-col="${newCol}"]`
      )
      target?.focus()
    },
    [alunos.length, numQuestoes, modoVisualizacao]
  )

  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    grid.addEventListener('keydown', handleKeyDown)
    return () => grid.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  function presencaDisplay(presenca: string) {
    if (presenca === '*')
      return {
        label: '*',
        className:
          'bg-green-100 text-green-700 border-green-300 hover:bg-green-200',
      }
    if (presenca === 'F')
      return {
        label: 'F',
        className: 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200',
      }
    return {
      label: '-',
      className:
        'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100',
    }
  }

  function questaoDisplay(value: number | undefined) {
    if (value === 1)
      return {
        label: '1',
        className:
          'bg-green-100 text-green-700 border-green-300 hover:bg-green-200',
      }
    if (value === 0)
      return {
        label: '0',
        className: 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200',
      }
    return {
      label: '-',
      className:
        'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100',
    }
  }

  return (
    <div ref={gridRef} className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          {/* Gabarito row */}
          <tr className="bg-indigo-50">
            <th className="sticky left-0 z-10 bg-indigo-50 px-2 py-2 text-left text-xs font-semibold text-indigo-600 whitespace-nowrap">
              N
            </th>
            <th className="sticky left-[2rem] z-10 bg-indigo-50 px-2 py-2 text-left text-xs font-semibold text-indigo-600 min-w-[120px] whitespace-nowrap">
              Nome
            </th>
            <th className="bg-indigo-50 px-1 py-2 text-center text-xs font-semibold text-indigo-600 whitespace-nowrap">
              P
            </th>
            {gabarito.map((g, i) => {
              const tipo = tiposQuestoes[i] || 'O'
              const isDiscursiva = tipo === 'D'

              return (
                <th
                  key={i}
                  className="bg-indigo-50 px-1 py-2 text-center text-xs font-semibold text-indigo-600 whitespace-nowrap"
                >
                  <div>Q{i + 1}</div>
                  {isDiscursiva ? (
                    <div className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold bg-blue-500 text-white">
                      D
                    </div>
                  ) : (
                    <div
                      className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${
                        g === 'X'
                          ? 'bg-amber-400 text-white'
                          : g
                            ? 'bg-indigo-500 text-white'
                            : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      {g || '?'}
                    </div>
                  )}
                </th>
              )
            })}
            <th className="bg-indigo-50 px-2 py-2 text-center text-xs font-semibold text-indigo-600 whitespace-nowrap">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {alunos.map((aluno, rowIdx) => {
            const d = dados[aluno.id] || {
              presenca: '',
              questoes: {},
              acertos: 0,
              percentual: 0,
            }
            const isFalta = d.presenca === 'F'
            const pDisplay = presencaDisplay(d.presenca)

            return (
              <tr
                key={aluno.id}
                className={`border-b border-gray-100 ${
                  rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                } ${isFalta ? 'opacity-60' : ''}`}
              >
                <td className="sticky left-0 z-10 bg-inherit px-2 py-1 text-xs font-medium text-gray-500 whitespace-nowrap">
                  {aluno.numero ?? rowIdx + 1}
                </td>
                <td className="sticky left-[2rem] z-10 bg-inherit px-2 py-1 text-xs font-medium text-gray-800 max-w-[150px] truncate whitespace-nowrap">
                  {aluno.nome}
                </td>
                <td className="px-1 py-1 text-center">
                  <button
                    data-row={rowIdx}
                    data-col={0}
                    disabled={modoVisualizacao}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded border text-xs font-bold transition-colors ${pDisplay.className} ${modoVisualizacao ? 'cursor-default' : 'cursor-pointer'}`}
                    onClick={() => onTogglePresenca(aluno.id)}
                    onFocus={() => {
                      focusedCell.current = { row: rowIdx, col: 0 }
                    }}
                  >
                    {pDisplay.label}
                  </button>
                </td>
                {Array.from({ length: numQuestoes }, (_, qIdx) => {
                  const val = d.questoes[`q${qIdx + 1}`]
                  const tipo = tiposQuestoes[qIdx] || 'O'
                  const isDiscursiva = tipo === 'D'

                  if (isDiscursiva) {
                    const style = getDiscursivaStyle(val)
                    const label = getDiscursivaLabel(val, criterioDiscursiva)

                    return (
                      <td key={qIdx} className="px-1 py-1 text-center">
                        <button
                          data-row={rowIdx}
                          data-col={qIdx + 1}
                          disabled={modoVisualizacao || isFalta}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded border text-xs font-bold transition-colors ${
                            isFalta
                              ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-300'
                              : `${style} ${modoVisualizacao ? 'cursor-default' : 'cursor-pointer'}`
                          }`}
                          onClick={() => onToggleQuestao(aluno.id, qIdx)}
                          onFocus={() => {
                            focusedCell.current = { row: rowIdx, col: qIdx + 1 }
                          }}
                        >
                          {isFalta ? '-' : label}
                        </button>
                      </td>
                    )
                  }

                  const qDisplay = questaoDisplay(val)

                  return (
                    <td key={qIdx} className="px-1 py-1 text-center">
                      <button
                        data-row={rowIdx}
                        data-col={qIdx + 1}
                        disabled={modoVisualizacao || isFalta}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded border text-xs font-bold transition-colors ${
                          isFalta
                            ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-300'
                            : `${qDisplay.className} ${modoVisualizacao ? 'cursor-default' : 'cursor-pointer'}`
                        }`}
                        onClick={() => onToggleQuestao(aluno.id, qIdx)}
                        onFocus={() => {
                          focusedCell.current = { row: rowIdx, col: qIdx + 1 }
                        }}
                      >
                        {isFalta ? '-' : qDisplay.label}
                      </button>
                    </td>
                  )
                })}
                <td className="px-2 py-1 text-center text-xs font-semibold text-gray-700 whitespace-nowrap">
                  {d.presenca === '*'
                    ? `${d.acertos}/${numQuestoes}`
                    : isFalta
                      ? '0'
                      : '-'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
