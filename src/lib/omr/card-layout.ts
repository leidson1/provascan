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

export const CARTAO_LEGADO = {
  largura: 210,
  altura: 148.5,
  margem: 10,
  marcador: 7,
  qrTamanho: 24,
  qrX: 12,
  qrY: 22,
  tituloX: 40,
  tituloY: 14,
  alunoY: 52,
  alunoBoxX: 10,
  alunoBoxY: 52,
  alunoBoxW: 190,
  alunoBoxH: 11,
  alunoNumeroW: 24,
  gradeY: 66,
  bolhaRaio: 3,
  linhaAltura: 7,
  colunaLargura: 12,
  numLargura: 12,
  gradeX: 15,
  instrY: 140,
  gradeRodapeGap: 8,
  maxQuestoes: 50,
} as const

export type CartaoLayout = typeof CARTAO
export type CartaoOMRLayout = typeof CARTAO | typeof CARTAO_LEGADO
export type OMRLayoutId = 'atual' | 'legado'

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

export interface OMRLayoutVariant {
  id: OMRLayoutId
  cartao: CartaoOMRLayout
  posicoes: BubblePosition[][]
  bolhaRaioVisual: number
}

export function calcNumeroColunas(nq: number, nalts = 5): number {
  if (nq <= 15) return 1
  if (nq <= 40) return 2
  if (nalts <= 4 && nq > 45) return 4
  return 3
}

function isLayoutLegado(layout: CartaoOMRLayout): boolean {
  return layout === CARTAO_LEGADO
}

function calcNumeroColunasForLayout(layout: CartaoOMRLayout, nq: number, nalts = 5): number {
  if (isLayoutLegado(layout)) return nq > 10 ? 2 : 1
  return calcNumeroColunas(nq, nalts)
}

export function calcGapEntreColunas(numCols: number): number {
  if (numCols >= 4) return 6
  if (numCols >= 3) return 7
  if (numCols === 2) return 12
  return 0
}

function calcGapEntreColunasForLayout(layout: CartaoOMRLayout, numCols: number): number {
  if (isLayoutLegado(layout)) return numCols > 1 ? 10 : 0
  return calcGapEntreColunas(numCols)
}

export function calcLinhaAltura(nq: number, nalts = 5): number {
  return calcLinhaAlturaForLayout(CARTAO, nq, nalts)
}

function calcLinhaAlturaForLayout(layout: CartaoOMRLayout, nq: number, nalts = 5): number {
  const C = layout
  const splitAt = Math.ceil(nq / calcNumeroColunasForLayout(layout, nq, nalts))
  const espacoDisponivel = C.instrY - C.gradeY - C.gradeRodapeGap
  return Math.min(C.linhaAltura, espacoDisponivel / Math.max(1, splitAt))
}

export function calcGridGeometry(nq: number, nalts: number): GridGeometry {
  return calcGridGeometryForLayout(CARTAO, nq, nalts)
}

function calcGridGeometryForLayout(layout: CartaoOMRLayout, nq: number, nalts: number): GridGeometry {
  const C = layout
  const numCols = calcNumeroColunasForLayout(layout, nq, nalts)
  const splitAt = Math.ceil(nq / numCols)
  const blocoW = C.numLargura + nalts * C.colunaLargura
  const gapEntreCol = calcGapEntreColunasForLayout(layout, numCols)
  const linhaAltura = calcLinhaAlturaForLayout(layout, nq, nalts)
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
  return calcBolhaRaioVisualForLayout(CARTAO, nq, nalts)
}

export function calcBolhaRaioVisualForLayout(layout: CartaoOMRLayout, nq: number, nalts = 5): number {
  if (isLayoutLegado(layout)) return layout.bolhaRaio

  const linhaAltura = calcLinhaAlturaForLayout(layout, nq, nalts)
  return Math.min(layout.bolhaRaio, Math.max(1.45, linhaAltura * 0.34))
}

export function calcPosicoesBolhasMista(
  nq: number,
  nalts: number,
  tiposQuestoes?: string,
  criterioDiscursiva?: number
): BubblePosition[][] {
  return calcPosicoesBolhasMistaForLayout(CARTAO, nq, nalts, tiposQuestoes, criterioDiscursiva)
}

export function calcPosicoesBolhasMistaForLayout(
  layout: CartaoOMRLayout,
  nq: number,
  nalts: number,
  tiposQuestoes?: string,
  criterioDiscursiva?: number
): BubblePosition[][] {
  const C = layout
  const tipos = tiposQuestoes ? tiposQuestoes.split(',') : []
  const criterio = criterioDiscursiva || 3
  const { numCols, splitAt, blocoW, gapEntreCol, linhaAltura, gradeXStart } = calcGridGeometryForLayout(layout, nq, nalts)

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

export function getOMRLayoutVariants(
  nq: number,
  nalts: number,
  tiposQuestoes?: string,
  criterioDiscursiva?: number
): OMRLayoutVariant[] {
  return [
    {
      id: 'atual',
      cartao: CARTAO,
      posicoes: calcPosicoesBolhasMistaForLayout(CARTAO, nq, nalts, tiposQuestoes, criterioDiscursiva),
      bolhaRaioVisual: calcBolhaRaioVisualForLayout(CARTAO, nq, nalts),
    },
    {
      id: 'legado',
      cartao: CARTAO_LEGADO,
      posicoes: calcPosicoesBolhasMistaForLayout(CARTAO_LEGADO, nq, nalts, tiposQuestoes, criterioDiscursiva),
      bolhaRaioVisual: calcBolhaRaioVisualForLayout(CARTAO_LEGADO, nq, nalts),
    },
  ]
}
