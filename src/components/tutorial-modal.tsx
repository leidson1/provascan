'use client'

import { useState, useEffect } from 'react'
import {
  ScanLine, Camera, FileText, BarChart3, Users, BookOpen,
  Smartphone, Clock, ChevronRight, ChevronLeft, X, Sparkles,
  UserPlus, Crown, UserCheck, Shield
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const TUTORIAL_VERSION = '3'
const STORAGE_KEY = 'provascan_tutorial_seen'

interface TutorialSlide {
  titulo: string
  descricao: string
  icon: React.ReactNode
  itens: { icon: React.ReactNode; texto: string }[]
  cor: string
}

const slides: TutorialSlide[] = [
  {
    titulo: 'Bem-vindo ao ProvaScan!',
    descricao: 'Uma iniciativa gratuita para ajudar professores a reduzir o tempo de correção de provas.',
    icon: <ScanLine className="h-10 w-10" />,
    cor: 'from-indigo-500 to-violet-600',
    itens: [
      { icon: <Smartphone className="h-4 w-4" />, texto: 'Corrija provas usando apenas a câmera do celular' },
      { icon: <Clock className="h-4 w-4" />, texto: 'Reduza drasticamente o tempo de correção' },
      { icon: <Shield className="h-4 w-4" />, texto: 'Gratuito para Ensino Fundamental, Médio e Superior' },
    ],
  },
  {
    titulo: 'Como funciona',
    descricao: 'Em 3 passos simples você já está corrigindo.',
    icon: <Camera className="h-10 w-10" />,
    cor: 'from-emerald-500 to-teal-600',
    itens: [
      { icon: <FileText className="h-4 w-4" />, texto: '1. Cadastre o gabarito da prova e imprima os cartões-resposta' },
      { icon: <Camera className="h-4 w-4" />, texto: '2. Fotografe cada cartão com o celular — a leitura é automática' },
      { icon: <BarChart3 className="h-4 w-4" />, texto: '3. Veja as notas na hora com estatísticas por turma e aluno' },
    ],
  },
  {
    titulo: 'Tipos de Prova',
    descricao: 'Suporte a provas objetivas, discursivas e mistas.',
    icon: <BookOpen className="h-10 w-10" />,
    cor: 'from-amber-500 to-orange-600',
    itens: [
      { icon: <FileText className="h-4 w-4" />, texto: 'Objetiva: até 50 questões com 4 ou 5 alternativas' },
      { icon: <FileText className="h-4 w-4" />, texto: 'Discursiva: critérios de avaliação (Certo/Parcial/Errado)' },
      { icon: <FileText className="h-4 w-4" />, texto: 'Mista: combine objetivas e discursivas na mesma prova' },
    ],
  },
  {
    titulo: 'Equipe e Papéis',
    descricao: 'Convide professores para trabalhar junto.',
    icon: <Users className="h-10 w-10" />,
    cor: 'from-sky-500 to-blue-600',
    itens: [
      { icon: <Crown className="h-4 w-4" />, texto: 'Dono: acesso total ao workspace (equipe, configurações, tudo)' },
      { icon: <UserCheck className="h-4 w-4" />, texto: 'Coordenador: cria e edita provas, turmas e disciplinas' },
      { icon: <UserPlus className="h-4 w-4" />, texto: 'Corretor: corrige provas e visualiza estatísticas' },
    ],
  },
  {
    titulo: 'Novidades',
    descricao: 'Últimas atualizações do ProvaScan.',
    icon: <Sparkles className="h-10 w-10" />,
    cor: 'from-purple-500 to-pink-600',
    itens: [
      { icon: <Sparkles className="h-4 w-4" />, texto: 'Relatórios em PDF e Excel (por turma, por prova e boletim individual)' },
      { icon: <Sparkles className="h-4 w-4" />, texto: 'Correção manual agora registra a letra marcada pelo aluno (A-E)' },
      { icon: <Sparkles className="h-4 w-4" />, texto: 'Legenda visual para questões discursivas na correção' },
      { icon: <Sparkles className="h-4 w-4" />, texto: 'Presença agora mostra P (verde) em vez de asterisco' },
      { icon: <Sparkles className="h-4 w-4" />, texto: 'Página de Ajuda com perguntas frequentes e tutorial' },
      { icon: <Sparkles className="h-4 w-4" />, texto: 'Correções de texto e acentuação em toda a câmera' },
    ],
  },
]

export function TutorialModal() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const seen = localStorage.getItem(STORAGE_KEY)
      if (seen !== TUTORIAL_VERSION) {
        setVisible(true)
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, TUTORIAL_VERSION)
    setVisible(false)
  }

  function next() {
    if (step < slides.length - 1) {
      setStep(step + 1)
    } else {
      dismiss()
    }
  }

  function prev() {
    if (step > 0) setStep(step - 1)
  }

  if (!visible) return null

  const slide = slides[step]
  const isLast = step === slides.length - 1

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Close button */}
        <button
          onClick={dismiss}
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header com gradiente */}
        <div className={`bg-gradient-to-br ${slide.cor} px-6 py-8 text-white text-center`}>
          <div className="inline-flex items-center justify-center rounded-2xl bg-white/20 p-4 mb-4">
            {slide.icon}
          </div>
          <h2 className="text-2xl font-bold">{slide.titulo}</h2>
          <p className="mt-2 text-sm text-white/80">{slide.descricao}</p>
        </div>

        {/* Conteúdo */}
        <div className="px-6 py-5">
          <div className="space-y-3">
            {slide.itens.map((item, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
                <div className="mt-0.5 text-gray-500 shrink-0">{item.icon}</div>
                <p className="text-sm text-gray-700">{item.texto}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer com navegação */}
        <div className="flex items-center justify-between border-t px-6 py-4">
          {/* Dots */}
          <div className="flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-2 rounded-full transition-all ${
                  i === step ? 'w-6 bg-indigo-500' : 'w-2 bg-gray-200 hover:bg-gray-300'
                }`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={prev} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Voltar
              </Button>
            )}
            {step === 0 && (
              <Button variant="ghost" size="sm" onClick={dismiss} className="text-gray-400">
                Pular
              </Button>
            )}
            <Button size="sm" onClick={next} className="gap-1">
              {isLast ? 'Começar!' : 'Próximo'}
              {!isLast && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
