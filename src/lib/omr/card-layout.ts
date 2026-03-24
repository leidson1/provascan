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
 * Calcula as posições (em mm) do centro de cada bolha na grade.
 * Retorna array [questão][alternativa] com {cx, cy}.
 * Usado tanto na geração do PDF quanto na leitura OMR.
 */
export function calcPosicoesBolhas(nq: number, nalts: number): BubblePosition[][] {
  const C = CARTAO
  const splitAt = nq > 10 ? Math.ceil(nq / 2) : nq
  const numCols = nq > 10 ? 2 : 1
  const blocoW = C.numLargura + nalts * C.colunaLargura
  const gapEntreCol = 10

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
        cy: C.gradeY + row * C.linhaAltura + C.linhaAltura / 2,
      })
    }
    pos.push(alts)
  }
  return pos
}
