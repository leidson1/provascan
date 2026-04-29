/**
 * Gerador de Cartões-Resposta em PDF
 * Portado fielmente de App.html (funções gerarCartoes, desenharCapa, desenharCartao, desenharQR)
 */

import jsPDF from 'jspdf'
import qrcode from 'qrcode-generator'
import { CARTAO, calcLinhaAltura } from '@/lib/omr/card-layout'

// ── Types ──────────────────────────────────────────────────

export interface CardGenProva {
  id: number
  numQuestoes: number
  numAlternativas: number
  disciplina: string
  turma: string
  serie: string
  bloco: string
  data?: string | null
}

export interface CardGenAluno {
  id: number | string
  nome: string
  numero: number | string | null
}

export interface CardGenParams {
  prova: CardGenProva
  alunos: CardGenAluno[]
  baseUrl: string // for QR code URL on cover page
  tipoProva?: 'objetiva' | 'mista' | 'discursiva'
  tiposQuestoes?: string   // "O,O,D,D,O,..."
  criterioDiscursiva?: number  // 2, 3, 4
  pesosQuestoes?: string   // "1,1,2,1,3,..."
  nomeInstituicao?: string // nome da escola/instituição
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u2014'
  return new Date(dateStr).toLocaleDateString('pt-BR')
}

// ── QR Code Drawing ────────────────────────────────────────

function desenharQR(doc: jsPDF, texto: string, x: number, y: number, tamanho: number): void {
  const qr = qrcode(0, 'H')
  qr.addData(texto)
  qr.make()
  const modulos = qr.getModuleCount()
  const celula = tamanho / modulos

  // Fundo branco com quiet zone generosa (2mm)
  doc.setFillColor(255, 255, 255)
  doc.rect(x - 2, y - 2, tamanho + 4, tamanho + 4, 'F')

  // Módulos do QR
  doc.setFillColor(0, 0, 0)
  for (let r = 0; r < modulos; r++) {
    for (let c = 0; c < modulos; c++) {
      if (qr.isDark(r, c)) {
        doc.rect(x + c * celula, y + r * celula, celula + 0.1, celula + 0.1, 'F')
      }
    }
  }

  // Borda ao redor do QR
  doc.setDrawColor(180)
  doc.setLineWidth(0.2)
  doc.rect(x - 2, y - 2, tamanho + 4, tamanho + 4, 'S')
}

// ── Cover Page ─────────────────────────────────────────────

function desenharCapa(
  doc: jsPDF,
  prova: CardGenProva,
  totalAlunos: number,
  baseUrl: string,
  isMista: boolean = false,
  nomeInstituicao?: string
): void {
  const camUrl = `${baseUrl}/camera?p=${prova.id}`

  const w = 210
  const h = 297 // A4
  const cx = w / 2

  // Fundo branco
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, w, h, 'F')

  // Borda decorativa
  doc.setDrawColor(67, 56, 202)
  doc.setLineWidth(2)
  doc.rect(10, 10, w - 20, h - 20, 'S')
  doc.setLineWidth(0.5)
  doc.rect(13, 13, w - 26, h - 26, 'S')

  // Título: nome da instituição ou PROVASCAN
  const tituloY = 40
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(67, 56, 202)
  if (nomeInstituicao) {
    doc.setFontSize(18)
    doc.text(nomeInstituicao.toUpperCase(), cx, tituloY, { align: 'center' })
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.setFont('helvetica', 'normal')
    doc.text('Cartões de Resposta — ProvaScan', cx, tituloY + 8, { align: 'center' })
  } else {
    doc.setFontSize(22)
    doc.text('PROVASCAN', cx, tituloY, { align: 'center' })
    doc.setFontSize(12)
    doc.setTextColor(100)
    doc.setFont('helvetica', 'normal')
    doc.text('Cartões de Resposta', cx, tituloY + 10, { align: 'center' })
  }

  // Info da prova
  doc.setFillColor(245, 245, 250)
  doc.setDrawColor(200)
  doc.setLineWidth(0.3)
  doc.roundedRect(30, 60, w - 60, 40, 3, 3, 'FD')

  doc.setTextColor(0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(prova.disciplina, cx, 74, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(prova.turma, cx, 82, { align: 'center' })
  doc.text(
    `${prova.bloco}  |  ${formatDate(prova.data)}  |  ${prova.numQuestoes} questões  |  ${totalAlunos} alunos`,
    cx,
    90,
    { align: 'center' }
  )

  // Badge prova mista
  if (isMista) {
    doc.setFillColor(219, 234, 254)
    doc.setDrawColor(59, 130, 246)
    doc.setLineWidth(0.3)
    doc.roundedRect(30, 103, w - 60, 8, 2, 2, 'FD')
    doc.setTextColor(30, 64, 175)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('PROVA MISTA - Contém questões objetivas e discursivas', cx, 108.5, { align: 'center' })
  }

  // QR Code grande
  doc.setTextColor(67, 56, 202)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('Escaneie com o celular para iniciar:', cx, isMista ? 120 : 115, { align: 'center' })

  const qrSize = 60
  const qrX = cx - qrSize / 2
  const qrY = 122
  desenharQR(doc, camUrl, qrX, qrY, qrSize)

  // Instruções
  doc.setTextColor(60)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const instrY = 195
  const instrucoes = [
    '1.  Abra a câmera do celular e aponte para o QR Code acima',
    '2.  Toque no link que aparecer para abrir o ProvaScan',
    '3.  Digite seu nome e toque em "Iniciar Correção"',
    '4.  Fotografe cada cartão de resposta - o sistema identifica o aluno',
    '5.  Confira o resultado e confirme. Próximo cartão automaticamente!',
  ]
  for (let i = 0; i < instrucoes.length; i++) {
    doc.text(instrucoes[i], 30, instrY + i * 8)
  }

  // Dica
  doc.setFillColor(255, 251, 235)
  doc.setDrawColor(251, 191, 36)
  doc.setLineWidth(0.3)
  doc.roundedRect(30, 245, w - 60, 20, 2, 2, 'FD')
  doc.setTextColor(120, 80, 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('DICA:', 35, 255)
  doc.setFont('helvetica', 'normal')
  doc.text(
    'Salve o link nos favoritos do celular para não precisar escanear novamente!',
    50,
    255
  )
  doc.text(
    'Após o primeiro cartão, basta ir fotografando os próximos em sequência.',
    35,
    261
  )

  // Rodapé
  doc.setTextColor(180)
  doc.setFontSize(8)
  doc.text('ProvaScan  |  Sistema de Correção de Provas', cx, h - 18, { align: 'center' })
}

// ── Answer Card Drawing ────────────────────────────────────

function desenharCartao(
  doc: jsPDF,
  yOff: number,
  prova: CardGenProva,
  aluno: CardGenAluno,
  tiposQuestoes?: string,
  criterioDiscursiva?: number,
  pesosQuestoes?: string,
  nomeInstituicao?: string
): void {
  const C = CARTAO
  const nq = prova.numQuestoes
  const nalts = prova.numAlternativas || 5
  const letras = ['A', 'B', 'C', 'D', 'E'].slice(0, nalts)

  // ── Fundo branco limpo ──
  doc.setFillColor(255, 255, 255)
  doc.rect(0, yOff, C.largura, C.altura, 'F')

  // ── Borda do cartão ──
  doc.setDrawColor(210)
  doc.setLineWidth(0.2)
  doc.rect(3, yOff + 3, C.largura - 6, C.altura - 6, 'S')

  // ── 1. Marcadores de canto (quadrados pretos com quiet zone branca) ──
  const mB = 2 // quiet zone branca ao redor dos marcadores (mm)
  doc.setFillColor(255, 255, 255)
  doc.rect(C.margem - mB, yOff + C.margem - mB, C.marcador + mB * 2, C.marcador + mB * 2, 'F')
  doc.rect(C.largura - C.margem - C.marcador - mB, yOff + C.margem - mB, C.marcador + mB * 2, C.marcador + mB * 2, 'F')
  doc.rect(C.margem - mB, yOff + C.altura - C.margem - C.marcador - mB, C.marcador + mB * 2, C.marcador + mB * 2, 'F')
  doc.rect(C.largura - C.margem - C.marcador - mB, yOff + C.altura - C.margem - C.marcador - mB, C.marcador + mB * 2, C.marcador + mB * 2, 'F')

  doc.setFillColor(0, 0, 0)
  doc.rect(C.margem, yOff + C.margem, C.marcador, C.marcador, 'F')
  doc.rect(C.largura - C.margem - C.marcador, yOff + C.margem, C.marcador, C.marcador, 'F')
  doc.rect(C.margem, yOff + C.altura - C.margem - C.marcador, C.marcador, C.marcador, 'F')
  doc.rect(C.largura - C.margem - C.marcador, yOff + C.altura - C.margem - C.marcador, C.marcador, C.marcador, 'F')

  // ── 2. QR Code ──
  const qrData = `${prova.id}:${aluno.id}`
  desenharQR(doc, qrData, C.qrX, yOff + C.qrY, C.qrTamanho)

  // Legenda abaixo do QR
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(180)
  doc.text('ID: ' + qrData, C.qrX, yOff + C.qrY + C.qrTamanho + 3)

  // ── 3. Título e info da prova ──
  doc.setTextColor(50)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(nomeInstituicao ? 11 : 13)
  doc.text((nomeInstituicao || 'PROVASCAN').toUpperCase(), C.tituloX, yOff + C.tituloY + 2)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(80)
  doc.text(`${prova.disciplina}  |  ${prova.turma}  |  ${prova.bloco}`, C.tituloX, yOff + C.tituloY + 8)
  doc.text(`${formatDate(prova.data)}  |  ${nq} questões  |  ${nalts} alternativas`, C.tituloX, yOff + C.tituloY + 13)

  // ── 4. Dados do aluno ──
  const isReserva = String(aluno.id).charAt(0) === 'R'
  doc.setDrawColor(180)
  doc.setLineWidth(0.3)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(C.margem + 2, yOff + C.alunoY - 5, C.largura - C.margem * 2 - 4, 13, 2, 2, 'FD')

  if (isReserva) {
    // Cartão reserva: badge + linha para escrever nome
    doc.setFillColor(239, 68, 68)
    doc.roundedRect(C.margem + 4, yOff + C.alunoY - 3.5, 24, 8, 1.5, 1.5, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text('RESERVA', C.margem + 6, yOff + C.alunoY + 2)
    // Linha pontilhada para nome
    doc.setDrawColor(150)
    doc.setLineWidth(0.3)
    const lineStart = C.margem + 32
    const lineEnd = C.largura - C.margem - 6
    for (let lx = lineStart; lx < lineEnd; lx += 3) {
      doc.line(lx, yOff + C.alunoY + 3, lx + 1.5, yOff + C.alunoY + 3)
    }
    doc.setTextColor(150)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text('Nome:', C.margem + 31, yOff + C.alunoY - 0.5)
  } else {
    doc.setTextColor(0)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(aluno.nome, C.margem + 6, yOff + C.alunoY + 1)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(80)
    doc.text(`N\u00BA ${aluno.numero || '-'}`, C.largura - C.margem - 20, yOff + C.alunoY + 1)
  }

  // ── 5. Grade de bolhas ──
  const tipos = tiposQuestoes?.split(',') || []
  const criterio = criterioDiscursiva || 3
  const pesos = pesosQuestoes ? pesosQuestoes.split(',').map(Number) : []

  // Mapeamento de letras e valores de critério por nível
  const criterioLetras: Record<number, string[]> = {
    2: ['C', 'E'],
    3: ['C', 'P', 'E'],
    4: ['E', 'B', 'P', 'I'],
  }
  const criterioValores: Record<number, number[]> = {
    2: [1.0, 0],
    3: [1.0, 0.5, 0],
    4: [1.0, 0.75, 0.5, 0],
  }

  const splitAt = nq > 10 ? Math.ceil(nq / 2) : nq
  const numCols = nq > 10 ? 2 : 1
  const blocoW = C.numLargura + nalts * C.colunaLargura
  const gapEntreCol = 10

  // Escalonamento dinâmico: reduzir tamanhos quando há muitas questões
  const linhaAltura = calcLinhaAltura(nq)
  const escala = linhaAltura / C.linhaAltura // fator de escala (1.0 = normal, <1 = compacto)
  const bolhaRaio = C.bolhaRaio * Math.max(escala, 0.7) // bolha reduz mas não menos que 70%

  let gradeXStart: number
  if (numCols === 1) {
    gradeXStart = (C.largura - blocoW) / 2
  } else {
    gradeXStart = (C.largura - (blocoW * 2 + gapEntreCol)) / 2
  }

  for (let col = 0; col < numCols; col++) {
    const startQ = col * splitAt
    const endQ = Math.min(startQ + splitAt, nq)
    const baseX = gradeXStart + col * (blocoW + gapEntreCol)
    const baseY = yOff + C.gradeY

    // Fundo branco puro da área da grade
    const gridH = (endQ - startQ) * linhaAltura
    doc.setFillColor(255, 255, 255)
    doc.rect(baseX, baseY - 6, blocoW, gridH + 6, 'F')

    // Cabeçalho: letras das alternativas
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(160)
    doc.text('Q', baseX + 3, baseY - 1.5)
    for (let a = 0; a < nalts; a++) {
      const lx = baseX + C.numLargura + a * C.colunaLargura + C.colunaLargura / 2
      doc.text(letras[a], lx - 1.2, baseY - 1.5)
    }

    // Linha separando cabeçalho
    doc.setDrawColor(200)
    doc.setLineWidth(0.15)
    doc.line(baseX, baseY, baseX + blocoW, baseY)

    // Tamanhos de fonte escalados
    const fontNumero = Math.max(5, 7 * escala)
    const fontPeso = Math.max(3.5, 4.5 * escala)
    const fontLetra = Math.max(4, 5.5 * escala)
    const fontValor = Math.max(3, 4 * escala)

    // Linhas de questões
    for (let q = startQ; q < endQ; q++) {
      const row = q - startQ
      const rowY = baseY + row * linhaAltura
      const isDiscursiva = tipos[q]?.trim() === 'D'

      // Número da questão + peso (se disponível)
      const qNum = ('0' + (q + 1)).slice(-2)
      const peso = pesos[q]
      const pesoStr = peso != null && peso > 0 ? ` (${peso % 1 === 0 ? peso.toFixed(0) : peso.toFixed(1)})` : ''
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(fontNumero)
      doc.setTextColor(isDiscursiva ? 59 : 140, isDiscursiva ? 130 : 140, isDiscursiva ? 246 : 140)
      doc.text(qNum, baseX + 1.5, rowY + linhaAltura / 2 + 1)
      if (pesoStr) {
        doc.setFontSize(fontPeso)
        doc.setTextColor(170)
        doc.text(pesoStr, baseX + 7, rowY + linhaAltura / 2 + 1)
      }

      if (isDiscursiva) {
        // Bolhas de critério discursivo (azuis, centralizadas)
        const critLetras = criterioLetras[criterio] || criterioLetras[3]
        const critValores = criterioValores[criterio] || criterioValores[3]
        const numBolhas = critLetras.length
        const totalBolhasWidth = numBolhas * C.colunaLargura
        const availableWidth = nalts * C.colunaLargura
        const offsetX = (availableWidth - totalBolhasWidth) / 2

        for (let a = 0; a < numBolhas; a++) {
          const bcx = baseX + C.numLargura + offsetX + a * C.colunaLargura + C.colunaLargura / 2
          const bcy = rowY + linhaAltura / 2

          // Bolha: borda azul, fundo branco
          doc.setDrawColor(59, 130, 246)
          doc.setLineWidth(0.5)
          doc.setFillColor(255, 255, 255)
          doc.circle(bcx, bcy, bolhaRaio, 'FD')

          // Letra de critério dentro da bolha (centralizada)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(fontLetra)
          doc.setTextColor(147, 197, 253)
          const letraW = doc.getTextWidth(critLetras[a])
          doc.text(critLetras[a], bcx - letraW / 2, bcy + fontLetra * 0.18)

          // Valor real abaixo da bolha (valor do critério × peso da questão)
          const pesoQ = pesos[q] || 1
          const valorReal = critValores[a] * pesoQ
          const valorStr = valorReal % 1 === 0 ? valorReal.toFixed(0) : valorReal.toFixed(1)
          doc.setFontSize(fontValor)
          doc.setTextColor(147, 197, 253)
          const valorW = doc.getTextWidth(valorStr)
          doc.text(valorStr, bcx - valorW / 2, bcy + bolhaRaio + 2 * escala + 1)
        }
      } else {
        // Bolhas objetivas normais (A/B/C/D/E)
        for (let a = 0; a < nalts; a++) {
          const bcx = baseX + C.numLargura + a * C.colunaLargura + C.colunaLargura / 2
          const bcy = rowY + linhaAltura / 2

          // Bolha: borda preta, fundo branco
          doc.setDrawColor(0)
          doc.setLineWidth(0.5)
          doc.setFillColor(255, 255, 255)
          doc.circle(bcx, bcy, bolhaRaio, 'FD')

          // Letra guia dentro da bolha (centralizada)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(fontLetra)
          doc.setTextColor(210)
          const letraW = doc.getTextWidth(letras[a])
          doc.text(letras[a], bcx - letraW / 2, bcy + fontLetra * 0.18)
        }
      }
    }

    // Borda da grade
    doc.setDrawColor(200)
    doc.setLineWidth(0.2)
    doc.rect(baseX, baseY - 6, blocoW, gridH + 6, 'S')
  }

  // ── 6. Instruções ──
  const hasDiscursivas = tipos.some(t => t?.trim() === 'D')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(60)
  doc.text('USE CANETA PRETA', C.margem + 5, yOff + C.instrY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(120)
  doc.text(
    'Preencha a bolha completamente.  Marque apenas UMA alternativa.  Não use corretivo.',
    C.margem + 42,
    yOff + C.instrY
  )
  if (hasDiscursivas) {
    doc.setTextColor(59, 130, 246)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.text(
      'Questões com bolhas azuis são discursivas. Marque o critério de avaliação.',
      C.margem + 5,
      yOff + C.instrY + 4
    )
  }
}

// ── Cut Line ───────────────────────────────────────────────

function desenharLinhaCorte(doc: jsPDF): void {
  const C = CARTAO
  doc.setDrawColor(200)
  doc.setLineWidth(0.2)
  for (let dx = 8; dx < C.largura - 5; dx += 5) {
    doc.line(dx, C.altura, dx + 2.5, C.altura)
  }
  doc.setFontSize(7)
  doc.setTextColor(200)
  doc.text('\u2702 recortar', 2, C.altura - 1)
}

// ── Main Export ────────────────────────────────────────────

/**
 * Gera o PDF com cartões-resposta para todos os alunos.
 * Retorna o documento jsPDF (caller pode .save() ou .output()).
 */
export function gerarCartoesPDF(params: CardGenParams): jsPDF | null {
  const { prova, alunos, baseUrl, tipoProva, criterioDiscursiva, pesosQuestoes, nomeInstituicao } = params
  let tiposQuestoes = params.tiposQuestoes

  // Discursiva pura agora gera cartão com bolhas de critério
  // Se discursiva, tratar todas questões como D
  if (tipoProva === 'discursiva' && !tiposQuestoes) {
    tiposQuestoes = Array(params.prova.numQuestoes).fill('D').join(',')
  }

  const C = CARTAO
  const isMista = tipoProva === 'mista'

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  // ── CAPA COM QR DE SESSÃO ──
  if (baseUrl) {
    desenharCapa(doc, prova, alunos.length, baseUrl, isMista, nomeInstituicao)
    doc.addPage()
  }

  // ── CARTÕES DOS ALUNOS ──
  for (let i = 0; i < alunos.length; i++) {
    const pos = i % 2 // 0 = topo, 1 = baixo
    if (i > 0 && pos === 0) doc.addPage()

    const yOff = pos * C.altura
    desenharCartao(doc, yOff, prova, alunos[i], tiposQuestoes, criterioDiscursiva, pesosQuestoes, nomeInstituicao)

    // Linha de corte entre os dois cartões
    if (pos === 0) {
      desenharLinhaCorte(doc)
    }
  }

  // ── CARTÕES RESERVA (3 extras sem nome) ──
  const numReservas = 3
  let totalCartoes = alunos.length
  for (let r = 0; r < numReservas; r++) {
    const pos = totalCartoes % 2
    if (pos === 0) doc.addPage()
    const yOff = pos * C.altura
    const reservaAluno: CardGenAluno = {
      id: 'R' + (r + 1),
      nome: 'RESERVA',
      numero: 'R' + (r + 1),
    }
    desenharCartao(doc, yOff, prova, reservaAluno, tiposQuestoes, criterioDiscursiva, pesosQuestoes, nomeInstituicao)
    // Linha de corte
    if (pos === 0) {
      desenharLinhaCorte(doc)
    }
    totalCartoes++
  }

  return doc
}
