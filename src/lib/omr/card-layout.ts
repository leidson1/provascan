// Layout do cartão em milímetros.
// Estas posições precisam ficar idênticas na geração do PDF e na leitura OMR.

export const CARTAO = {
  largura: 210,
  altura: 148.5,
  margem: 8,

  // Marcadores de canto para correção de perspectiva.
  marcador: 7.5,

  // QR Code do aluno.
  qrTamanho: 24,
  qrX: 18,
  qrY: 18,

  // Barra tecnica de orientacao: ajuda o OMR a escolher o lado correto rapido.
  orientadorX: 102,
  orientadorY: 34,
  orientadorW: 16,
  orientadorH: 2,

  // Cabeçalho compacto.
  tituloX: 48,
  tituloY: 12,
  alunoY: 39,
  alunoBoxX: 48,
  alunoBoxY: 38,
  alunoBoxW: 154,
  alunoBoxH: 9,
  alunoNumeroW: 24,

  // Grade de bolhas.
  gradeY: 55,
  bolhaRaio: 2,
  linhaAltura: 6,
  colunaLargura: 8.2,
  numLargura: 6.5,
  gradeX: 15,

  // Instruções e limites.
  instrY: 143,
  gradeRodapeGap: 4,
  maxQuestoes: 60,
} as const

export type CartaoLayout = typeof CARTAO

export interface BubblePosition {
  cx: number
  cy: number
}

export interface GridGeometry {
  numCols: number
  splitAt: number
  blocoW: number
  gapEntreCol: number
  linhaAltura: number
  gradeXStart: number
}

export function calcNumeroColunas(nq: number, nalts = 5): number {
  if (nq <= 15) return 1
  if (nq <= 40) return 2
  if (nalts <= 4 && nq > 45) return 4
  return 3
}

export function calcGapEntreColunas(numCols: number): number {
  if (numCols >= 4) return 6
  if (numCols >= 3) return 7
  if (numCols === 2) return 12
  return 0
}

export function calcLinhaAltura(nq: number, nalts = 5): number {
  const C = CARTAO
  const splitAt = Math.ceil(nq / calcNumeroColunas(nq, nalts))
  const espacoDisponivel = C.instrY - C.gradeY - C.gradeRodapeGap
  return Math.min(C.linhaAltura, espacoDisponivel / Math.max(1, splitAt))
}

export function calcGridGeometry(nq: number, nalts: number): GridGeometry {
  const C = CARTAO
  const numCols = calcNumeroColunas(nq, nalts)
  const splitAt = Math.ceil(nq / numCols)
  const blocoW = C.numLargura + nalts * C.colunaLargura
  const gapEntreCol = calcGapEntreColunas(numCols)
  const linhaAltura = calcLinhaAltura(nq, nalts)
  const totalW = numCols * blocoW + (numCols - 1) * gapEntreCol

  return {
    numCols,
    splitAt,
    blocoW,
    gapEntreCol,
    linhaAltura,
    gradeXStart: (C.largura - totalW) / 2,
  }
}

export function calcBolhaRaioVisual(nq: number, nalts = 5): number {
  const linhaAltura = calcLinhaAltura(nq, nalts)
  return Math.min(CARTAO.bolhaRaio, Math.max(1.45, linhaAltura * 0.34))
}

export function calcPosicoesBolhasMista(
  nq: number,
  nalts: number,
  tiposQuestoes?: string,
  criterioDiscursiva?: number
): BubblePosition[][] {
  const C = CARTAO
  const tipos = tiposQuestoes ? tiposQuestoes.split(',') : []
  const criterio = criterioDiscursiva || 3
  const { numCols, splitAt, blocoW, gapEntreCol, linhaAltura, gradeXStart } = calcGridGeometry(nq, nalts)

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
  return calcPosicoesBolhasMista(nq, nalts)
}
