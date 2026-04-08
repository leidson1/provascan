'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import {
  HelpCircle,
  BookOpen,
  ChevronDown,
  Camera,
  FileText,
  Users,
  BarChart3,
  Printer,
  ScanLine,
  ClipboardCheck,
  Settings,
  UserPlus,
  FileBarChart,
  Smartphone,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const TUTORIAL_STORAGE_KEY = 'provascan_tutorial_seen'

interface FaqItem {
  pergunta: string
  resposta: string
  icon: typeof Camera
  categoria: string
}

const FAQ_ITEMS: FaqItem[] = [
  // Primeiros passos
  {
    categoria: 'Primeiros Passos',
    icon: ScanLine,
    pergunta: 'Como começo a usar o ProvaScan?',
    resposta: 'Primeiro, cadastre suas turmas e disciplinas no menu lateral. Depois, crie uma prova informando o gabarito. Imprima os cartões-resposta em PDF e distribua aos alunos. Após a prova, use a câmera do celular para corrigir automaticamente.',
  },
  {
    categoria: 'Primeiros Passos',
    icon: Printer,
    pergunta: 'Como imprimo os cartões-resposta?',
    resposta: 'Acesse a prova desejada, clique em "Gerar Cartões" e o sistema criará um PDF com cartões individuais para cada aluno. Cada cartão tem um QR Code único para identificação automática. Imprima em folha A4 e recorte na linha pontilhada.',
  },
  // Correção
  {
    categoria: 'Correção',
    icon: Camera,
    pergunta: 'Como funciona a correção pela câmera?',
    resposta: 'Abra o menu "Câmera" no sidebar, selecione a prova e clique em "Iniciar Correção". Fotografe cada cartão-resposta preenchido pelo aluno. O sistema lê o QR Code para identificar o aluno e as marcações para calcular a nota automaticamente.',
  },
  {
    categoria: 'Correção',
    icon: ClipboardCheck,
    pergunta: 'E se a câmera não conseguir ler o cartão?',
    resposta: 'O sistema oferece a opção de correção manual. Você pode selecionar o aluno e marcar as respostas clicando nas letras (A, B, C, D, E). Também é possível usar a página de "Correção" da prova para preencher manualmente todo o gabarito.',
  },
  {
    categoria: 'Correção',
    icon: ClipboardCheck,
    pergunta: 'Como funciona a correção manual no grid?',
    resposta: 'Na página de correção, clique em "P" para marcar presença e "F" para falta. Para cada questão, clique na célula e ela ciclará pelas letras A, B, C, D, E. A letra fica verde se acertou e vermelha se errou, comparando com o gabarito.',
  },
  // Provas
  {
    categoria: 'Provas',
    icon: FileText,
    pergunta: 'Quais tipos de prova o sistema suporta?',
    resposta: 'Três tipos: Objetiva (múltipla escolha com 4 ou 5 alternativas, até 50 questões), Discursiva (com critérios como Certo/Parcial/Errado) e Mista (objetivas e discursivas na mesma prova).',
  },
  {
    categoria: 'Provas',
    icon: FileText,
    pergunta: 'Posso anular uma questão depois de corrigir?',
    resposta: 'Sim! Edite o gabarito da prova e marque a questão como "X" (anulada). Existem dois modos de anulação: "Contar como certa" (todos ganham o ponto) ou "Redistribuir" (a nota é recalculada proporcionalmente sem aquela questão).',
  },
  {
    categoria: 'Provas',
    icon: FileText,
    pergunta: 'Como funciona o peso das questões?',
    resposta: 'Ao criar ou editar a prova, ative o modo de avaliação "Por Nota" e defina o peso de cada questão. O sistema calcula a nota final ponderada automaticamente. Os pesos aparecem no cartão-resposta impresso.',
  },
  // Turmas e Alunos
  {
    categoria: 'Turmas e Alunos',
    icon: Users,
    pergunta: 'Como cadastro meus alunos?',
    resposta: 'Vá em Turmas, selecione a turma desejada e clique em "Gerenciar Alunos". Você pode adicionar alunos um a um ou em lote (informando a quantidade). O sistema atribui números automaticamente.',
  },
  // Estatísticas
  {
    categoria: 'Estatísticas e Relatórios',
    icon: BarChart3,
    pergunta: 'Quais estatísticas estão disponíveis?',
    resposta: 'Cada prova tem uma página de estatísticas com: média de acertos, percentual geral, ranking de alunos, análise de dificuldade por questão (quais foram fáceis e difíceis), e contagem de presença/faltas.',
  },
  {
    categoria: 'Estatísticas e Relatórios',
    icon: FileBarChart,
    pergunta: 'Como gero relatórios em PDF ou Excel?',
    resposta: 'Acesse a página "Relatórios" no menu lateral. Escolha o tipo (por Turma, por Prova ou Boletim Individual), aplique os filtros desejados e clique em "Baixar PDF" ou "Baixar Excel".',
  },
  // Equipe
  {
    categoria: 'Equipe',
    icon: UserPlus,
    pergunta: 'Como convido outros professores?',
    resposta: 'O dono do workspace pode acessar "Equipe" no menu lateral e enviar convites por link (compartilhável via WhatsApp). Existem três papéis: Dono (acesso total), Coordenador (gerencia provas, turmas e disciplinas) e Corretor (só corrige provas).',
  },
  {
    categoria: 'Equipe',
    icon: Settings,
    pergunta: 'Posso participar de mais de um workspace?',
    resposta: 'Sim! Cada professor pode ser convidado para vários workspaces de diferentes escolas. Use o seletor no topo do menu lateral para alternar entre eles. Ao criar sua conta, um workspace é criado automaticamente para você. Para participar de outros, peça ao dono que envie um convite.',
  },
  // Problemas comuns
  {
    categoria: 'Problemas Comuns',
    icon: AlertTriangle,
    pergunta: 'A câmera não está reconhecendo o cartão, o que faço?',
    resposta: 'Verifique se: (1) o cartão está bem iluminado e sem sombras, (2) todos os 4 cantos do cartão aparecem na foto, (3) o QR Code está visível e sem dobras, (4) as marcações estão preenchidas com caneta escura. Se não funcionar, use a correção manual.',
  },
  {
    categoria: 'Problemas Comuns',
    icon: AlertTriangle,
    pergunta: 'As notas estão erradas, como corrijo?',
    resposta: 'Acesse a página de correção da prova e ajuste as respostas manualmente. Clique na célula da questão para trocar a resposta. Ao salvar, as notas e percentuais são recalculados automaticamente.',
  },
]

function FaqAccordion({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false)
  const Icon = item.icon

  return (
    <button
      onClick={() => setOpen(!open)}
      className="w-full text-left rounded-lg border border-gray-200 bg-white transition-all hover:border-gray-300 hover:shadow-sm"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
          <Icon className="h-4 w-4" />
        </div>
        <span className="flex-1 text-sm font-medium text-gray-800">{item.pergunta}</span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <div className="border-t border-gray-100 px-4 py-3 pl-15">
          <p className="text-sm text-gray-600 leading-relaxed">{item.resposta}</p>
        </div>
      )}
    </button>
  )
}

export default function AjudaPage() {
  const [filtro, setFiltro] = useState('')

  const categorias = [...new Set(FAQ_ITEMS.map(f => f.categoria))]

  const itensFiltrados = filtro
    ? FAQ_ITEMS.filter(f => f.categoria === filtro)
    : FAQ_ITEMS

  function handleReverTutorial() {
    localStorage.removeItem(TUTORIAL_STORAGE_KEY)
    toast.success('Tutorial reativado! Recarregue a página para ver.')
    setTimeout(() => window.location.reload(), 1000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
            <HelpCircle className="h-5 w-5 text-indigo-600" />
          </div>
          Ajuda
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Tire suas dúvidas e aprenda a usar o ProvaScan
        </p>
      </div>

      {/* Tutorial card */}
      <Card className="border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50">
        <CardContent className="py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">Tutorial Interativo</h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Reveja o passo a passo de como usar o sistema, os tipos de prova, papéis da equipe e novidades.
              </p>
            </div>
            <Button onClick={handleReverTutorial} className="gap-2 shrink-0">
              <ScanLine className="h-4 w-4" />
              Rever Tutorial
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFiltro('')}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            !filtro
              ? 'bg-indigo-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Todas ({FAQ_ITEMS.length})
        </button>
        {categorias.map(cat => {
          const count = FAQ_ITEMS.filter(f => f.categoria === cat).length
          return (
            <button
              key={cat}
              onClick={() => setFiltro(filtro === cat ? '' : cat)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filtro === cat
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat} ({count})
            </button>
          )
        })}
      </div>

      {/* FAQ list */}
      <div className="space-y-2">
        {itensFiltrados.map((item, idx) => (
          <FaqAccordion key={idx} item={item} />
        ))}
      </div>

      {/* Footer */}
      <Card>
        <CardContent className="py-4 text-center">
          <p className="text-sm text-gray-500">
            Ainda tem dúvidas? Entre em contato pelo WhatsApp do administrador do seu workspace.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
