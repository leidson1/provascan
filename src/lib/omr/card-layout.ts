// ── LAYOUT DO CARTÃO (em mm) ─────────────────────────────────
// Estas posições DEVEM ser idênticas na geração (PDF) e na leitura (OMR)
// Portado de OMR.html - NÃO alterar valores sem atualizar ambos os lados

export const CARTAO = {
  largura: 210,          // A4 width (cartão ocupa largura total)
  altura: 148.5,         // A5 height (metade do A4)
  margem: 10,            // Margem de todas as bordas

  // Marcadores de canto (quadrados pretos para correção de perspectiva)
  marcador: 7,           // Tamanho do marcador

  // QR Code
  qrTamanho: 24,
  qrX: 12,
  qrY: 22,

  // Título
  tituloX: 40,
  tituloY: 14,

  // Info do aluno
  alunoY: 52,

  // Grade de bolhas
  gradeY: 66,
  bolhaRaio: 3,          // Raio de cada bolha
  linhaAltura: 7,        // Altura entre linhas
  colunaLargura: 12,     // Largura da coluna de cada alternativa
  numLargura: 12,        // Largura da coluna do número da questão
  gradeX: 15,            // X inicial da grade

  // Instruções
  instrY: 140,
} as const

export type CartaoLayout = typeof CARTAO

export interface BubblePosition {
  cx: number
  cy: number
}

/**
 * Calcula a altura dinâmica de cada linha da grade.
 * Reduz automaticamente quando há muitas questões para caber no cartão.
 */
export function calcLinhaAltura(nq: number): number {
  const C = CARTAO
  const splitAt = nq > 10 ? Math.ceil(nq / 2) : nq
  const espacoDisponivel = C.instrY - C.gradeY - 8
  return Math.min(C.linhaAltura, espacoDisponivel / splitAt)
}

/**
 * Calcula posições de bolhas com suporte a questões mistas (objetiva + discursiva).
 * Questões discursivas têm menos bolhas e são centralizadas no espaço de nalts colunas.
 * Escalona automaticamente quando há muitas questões.
 */
export function calcPosicoesBolhasMista(
  nq: number,
  nalts: number,
  tiposQuestoes?: string,
  criterioDiscursiva?: number
): BubblePosition[][] {
  const C = CARTAO
  const tipos = tiposQuestoes ? tiposQuestoes.split(',') : []
  const criterio = criterioDiscursiva || 3
  const splitAt = nq > 10 ? Math.ceil(nq / 2) : nq
  const numCols = nq > 10 ? 2 : 1
  const blocoW = C.numLargura + nalts * C.colunaLargura
  const gapEntreCol = 10
  const linhaAltura = calcLinhaAltura(nq)

  let gradeXStart: number
  if (numCols === 1) {
    gradeXStart = (C.largura - blocoW) / 2
  } else {
    gradeXStart = (C.largura - (blocoW * 2 + gapEntreCol)) / 2
  }

  const pos: BubblePosition[][] = []
  for (let q = 0; q < nq; q++) {
    const col = numCols > 1 ? Math.floor(q / splitAt) : 0
    const row = numCols > 1 ? q - col * splitAt : q
    const baseX = gradeXStart + col * (blocoW + gapEntreCol)
    const isDiscursiva = tipos[q]?.trim() === 'D'

    const alts: BubblePosition[] = []
    if (isDiscursiva) {
      const numBolhas = criterio
      const totalBolhasWidth = numBolhas * C.colunaLargura
      const availableWidth = nalts * C.colunaLargura
      const offsetX = (availableWidth - totalBolhasWidth) / 2

      for (let a = 0; a < numBolhas; a++) {
        alts.push({
          cx: baseX + C.numLargura + offsetX + a * C.colunaLargura + C.colunaLargura / 2,
          cy: C.gradeY + row * linhaAltura + linhaAltura / 2,
        })
      }
    } else {
      for (let a = 0; a < nalts; a++) {
        alts.push({
          cx: baseX + C.numLargura + a * C.colunaLargura + C.colunaLargura / 2,
          cy: C.gradeY + row * linhaAltura + linhaAltura / 2,
        })
      }
    }
    pos.push(alts)
  }
  return pos
}

export function calcPosicoesBolhas(nq: number, nalts: number): BubblePosition[][] {
  const C = CARTAO
  const splitAt = nq > 10 ? Math.ceil(nq / 2) : nq
  const numCols = nq > 10 ? 2 : 1
  const blocoW = C.numLargura + nalts * C.colunaLargura
  const gapEntreCol = 10
  const linhaAltura = calcLinhaAltura(nq)

  let gradeXStart: number
  if (numCols === 1) {
    gradeXStart = (C.largura - blocoW) / 2
  } else {
    gradeXStart = (C.largura - (blocoW * 2 + gapEntreCol)) / 2
  }

  const pos: BubblePosition[][] = []
  for (let q = 0; q < nq; q++) {
    const col = numCols > 1 ? Math.floor(q / splitAt) : 0
    const row = numCols > 1 ? q - col * splitAt : q
    const baseX = gradeXStart + col * (blocoW + gapEntreCol)

    const alts: BubblePosition[] = []
    for (let a = 0; a < nalts; a++) {
      alts.push({
        cx: baseX + C.numLargura + a * C.colunaLargura + C.colunaLargura / 2,
        cy: C.gradeY + row * linhaAltura + linhaAltura / 2,
      })
    }
    pos.push(alts)
  }
  return pos
}
