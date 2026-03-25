'use client'

import { Button } from '@/components/ui/button'

interface AnswerKeyEditorProps {
  numQuestoes: number
  numAlternativas: number
  value: string
  onChange: (value: string) => void
}

const ALTERNATIVAS = ['A', 'B', 'C', 'D', 'E']

export function AnswerKeyEditor({
  numQuestoes,
  numAlternativas,
  value,
  onChange,
}: AnswerKeyEditorProps) {
  const answers = value ? value.split(',') : Array(numQuestoes).fill('')

  // Ensure answers array matches numQuestoes
  while (answers.length < numQuestoes) answers.push('')
  if (answers.length > numQuestoes) answers.length = numQuestoes

  const filledCount = answers.filter((a) => a !== '').length
  const alternatives = ALTERNATIVAS.slice(0, numAlternativas)

  function handleSelect(questionIndex: number, letter: string) {
    const updated = [...answers]
    // Toggle: clicking the same deselects
    updated[questionIndex] = updated[questionIndex] === letter ? '' : letter
    onChange(updated.join(','))
  }

  function handleAnular(questionIndex: number) {
    const updated = [...answers]
    updated[questionIndex] = updated[questionIndex] === 'X' ? '' : 'X'
    onChange(updated.join(','))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">
          {filledCount}/{numQuestoes} questões preenchidas
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-indigo-500" />
            Selecionada
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-amber-500" />
            Anulada
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {answers.map((answer, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
          >
            <span className="w-8 shrink-0 text-sm font-semibold text-gray-600">
              Q{idx + 1}
            </span>

            <div className="flex flex-1 items-center gap-1">
              {alternatives.map((letter) => (
                <Button
                  key={letter}
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={`h-8 w-8 p-0 text-xs font-semibold ${
                    answer === letter
                      ? 'bg-indigo-500 text-white hover:bg-indigo-600 hover:text-white'
                      : 'bg-slate-100 text-gray-700 hover:bg-slate-200'
                  }`}
                  onClick={() => handleSelect(idx, letter)}
                >
                  {letter}
                </Button>
              ))}

              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={`ml-1 h-8 w-8 p-0 text-xs font-semibold ${
                  answer === 'X'
                    ? 'bg-amber-500 text-white hover:bg-amber-600 hover:text-white'
                    : 'bg-slate-100 text-gray-700 hover:bg-slate-200'
                }`}
                onClick={() => handleAnular(idx)}
              >
                X
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
