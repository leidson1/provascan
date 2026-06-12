// Cálculo de acertos e nota compartilhado entre a grade de correção e a câmera.
// Regras:
// - Questão objetiva: 1 ponto se a letra marcada é igual ao gabarito.
// - Questão discursiva: valor fracionário (0, 0.5, 0.75, 1.0) conforme o critério.
// - Questão anulada ('X' no gabarito):
//   - modo 'contar_certa' (padrão): conta como acerto para todos.
//   - modo 'redistribuir': é desconsiderada e o valor é redistribuído entre as válidas.
// - Pesos: cada peso inválido, vazio ou não positivo vale 1 — peso 0 não é permitido
//   (uma questão de peso 0 sumiria da nota em silêncio; para anular use o 'X').

export interface ProvaScoring {
  modo_avaliacao: string | null
  nota_total: number | null
  gabarito: string | null
  tipos_questoes: string | null
  pesos_questoes: string | null
  modo_anulacao: string | null
  num_questoes: number
}

export type Questoes = Record<string, number | string>

export function resolveScore(
  val: number | string | undefined,
  gabLetra: string,
  tipo: string
): number {
  if (val === undefined) return 0
  // Discursiva: sempre número (0, 0.5, 0.75, 1.0)
  if (tipo === 'D' && typeof val === 'number') return val
  // Objetiva: formato novo — letra da resposta como string
  if (typeof val === 'string') return val === gabLetra ? 1 : 0
  // Formato legado: 0/1
  return val
}

export function parsePesos(pesosQuestoes: string | null, numQuestoes: number): number[] {
  const pesosRaw = pesosQuestoes ? pesosQuestoes.split(',') : []
  return Array.from({ length: numQuestoes }, (_, index) => {
    const raw = pesosRaw[index]?.trim()
    const parsed = Number(raw)
    return raw !== undefined && raw !== '' && Number.isFinite(parsed) && parsed > 0 ? parsed : 1
  })
}

export function calcularAcertos(
  questoes: Questoes,
  gabaritoArr: string[],
  modoAnulacao?: string | null,
  tiposArr?: string[]
): number {
  let acertos = 0
  const numAnuladas = gabaritoArr.filter(g => g === 'X').length
  const numValidas = gabaritoArr.length - numAnuladas

  if (modoAnulacao === 'redistribuir') {
    for (let i = 0; i < gabaritoArr.length; i++) {
      const key = `q${i + 1}`
      if (gabaritoArr[i] === 'X') continue
      const tipo = tiposArr?.[i] || 'O'
      acertos += resolveScore(questoes[key], gabaritoArr[i], tipo)
    }
    if (numValidas > 0 && numValidas < gabaritoArr.length) {
      acertos = (acertos / numValidas) * gabaritoArr.length
    }
  } else {
    for (let i = 0; i < gabaritoArr.length; i++) {
      const key = `q${i + 1}`
      if (gabaritoArr[i] === 'X') {
        acertos++
      } else {
        const tipo = tiposArr?.[i] || 'O'
        acertos += resolveScore(questoes[key], gabaritoArr[i], tipo)
      }
    }
  }
  return Math.round(acertos * 100) / 100
}

export function calcularPercentual(acertos: number, numQuestoes: number): number {
  if (numQuestoes <= 0) return 0
  return Math.round((acertos / numQuestoes) * 10000) / 100
}

export function calcularNota(
  acertos: number,
  prova: ProvaScoring,
  questoes: Questoes
): number | null {
  if (prova.modo_avaliacao !== 'nota' || !prova.nota_total) return null

  const numQuestoes = prova.num_questoes
  const gabArr = prova.gabarito ? prova.gabarito.split(',') : []
  const tiposArr = prova.tipos_questoes ? prova.tipos_questoes.split(',') : []
  const modoAnulacao = prova.modo_anulacao || 'contar_certa'

  if (prova.pesos_questoes) {
    const pesos = parsePesos(prova.pesos_questoes, numQuestoes)
    let nota = 0
    const pesoTotal = pesos.reduce((s, p) => s + p, 0)
    if (pesoTotal <= 0) return 0

    if (modoAnulacao === 'redistribuir') {
      let notaValidas = 0
      let pesoValidas = 0
      for (let i = 0; i < numQuestoes; i++) {
        const key = `q${i + 1}`
        const peso = pesos[i] ?? 1
        if (gabArr[i] === 'X') continue
        pesoValidas += peso
        const tipo = tiposArr[i] || 'O'
        notaValidas += resolveScore(questoes[key], gabArr[i], tipo) * peso
      }
      nota = pesoValidas > 0 ? (notaValidas / pesoValidas) * pesoTotal : 0
    } else {
      for (let i = 0; i < numQuestoes; i++) {
        const key = `q${i + 1}`
        const peso = pesos[i] ?? 1
        if (gabArr[i] === 'X') {
          nota += peso
        } else {
          const tipo = tiposArr[i] || 'O'
          nota += resolveScore(questoes[key], gabArr[i], tipo) * peso
        }
      }
    }
    return Math.round((nota / pesoTotal) * prova.nota_total * 100) / 100
  }

  // Sem pesos: usa acertos (já escalado se redistribuir)
  if (numQuestoes <= 0) return 0
  return Math.round((acertos / numQuestoes) * prova.nota_total * 100) / 100
}
