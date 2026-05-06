export type NormalizedPoint = {
  x: number
  y: number
}

export type ScenarioShadow = {
  x: number
  y: number
  radius: number
  opacity: number
  blurPx: number
}

export type ScenarioPerspective = {
  tl: NormalizedPoint
  tr: NormalizedPoint
  bl: NormalizedPoint
  br: NormalizedPoint
}

export type OMRLabScenario = {
  id: string
  name: string
  note: string
  rotationDeg?: number
  perspective?: ScenarioPerspective
  brightness?: number
  contrast?: number
  blurPx?: number
  shadow?: ScenarioShadow
}

export const DEFAULT_OMR_LAB_SCENARIOS: OMRLabScenario[] = [
  {
    id: 'base',
    name: 'Base',
    note: 'Imagem original sem alteracoes.',
  },
  {
    id: 'rotate-left-8',
    name: 'Rotacao -8',
    note: 'Inclina levemente para a esquerda.',
    rotationDeg: -8,
  },
  {
    id: 'rotate-right-8',
    name: 'Rotacao +8',
    note: 'Inclina levemente para a direita.',
    rotationDeg: 8,
  },
  {
    id: 'landscape-90',
    name: 'Rotacao 90',
    note: 'Simula captura com celular deitado.',
    rotationDeg: 90,
  },
  {
    id: 'landscape-270',
    name: 'Rotacao 270',
    note: 'Simula captura deitada no sentido inverso.',
    rotationDeg: 270,
  },
  {
    id: 'perspective-left',
    name: 'Perspectiva esquerda',
    note: 'Leve trapezio puxando a folha para a esquerda.',
    perspective: {
      tl: { x: 0.08, y: 0.04 },
      tr: { x: -0.03, y: 0.07 },
      bl: { x: 0.06, y: -0.03 },
      br: { x: -0.02, y: -0.01 },
    },
  },
  {
    id: 'perspective-right',
    name: 'Perspectiva direita',
    note: 'Leve trapezio puxando a folha para a direita.',
    perspective: {
      tl: { x: 0.02, y: 0.06 },
      tr: { x: -0.08, y: 0.04 },
      bl: { x: 0.03, y: -0.01 },
      br: { x: -0.06, y: -0.03 },
    },
  },
  {
    id: 'top-away',
    name: 'Topo afastado',
    note: 'Simula foto com a parte de cima mais distante.',
    perspective: {
      tl: { x: 0.1, y: 0.06 },
      tr: { x: -0.1, y: 0.06 },
      bl: { x: 0.02, y: -0.02 },
      br: { x: -0.02, y: -0.02 },
    },
  },
  {
    id: 'shadow-dark',
    name: 'Sombra lateral',
    note: 'Abaixa a luz e adiciona sombra na area das respostas.',
    brightness: 0.88,
    contrast: 0.96,
    shadow: {
      x: 0.72,
      y: 0.6,
      radius: 0.24,
      opacity: 0.3,
      blurPx: 36,
    },
  },
  {
    id: 'combo-hard',
    name: 'Combo dificil',
    note: 'Mistura leve rotacao, perspectiva e sombra.',
    rotationDeg: 11,
    perspective: {
      tl: { x: 0.05, y: 0.03 },
      tr: { x: -0.07, y: 0.08 },
      bl: { x: 0.08, y: -0.02 },
      br: { x: -0.03, y: -0.04 },
    },
    brightness: 0.9,
    contrast: 0.97,
    blurPx: 0.8,
    shadow: {
      x: 0.63,
      y: 0.68,
      radius: 0.2,
      opacity: 0.22,
      blurPx: 30,
    },
  },
]

export function answersToCompactString(values: string[]): string {
  return values.map((value) => (value || '-').trim().toUpperCase() || '-').join('')
}

export function parseCompactAnswers(raw: string): string[] {
  return raw
    .replace(/[^A-Za-z\-]/g, '')
    .toUpperCase()
    .split('')
    .map((char) => (char === '-' ? '' : char))
}

export function compareAnswers(reference: string[], candidate: string[]): {
  matches: number
  mismatches: number[]
} {
  const size = Math.max(reference.length, candidate.length)
  let matches = 0
  const mismatches: number[] = []

  for (let index = 0; index < size; index++) {
    const expected = reference[index] || ''
    const actual = candidate[index] || ''
    if (expected === actual) {
      matches += 1
      continue
    }
    mismatches.push(index)
  }

  return { matches, mismatches }
}
