export interface Profile {
  id: string
  nome: string
  email: string
  accepted_terms_at: string | null
  created_at: string
}

export interface Disciplina {
  id: number
  user_id: string
  nome: string
  ativo: boolean
  created_at: string
}

export interface Turma {
  id: number
  user_id: string
  serie: string
  turma: string
  turno: string | null
  ativo: boolean
  created_at: string
}

export interface Aluno {
  id: number
  user_id: string
  turma_id: number
  nome: string
  numero: number | null
  ativo: boolean
  created_at: string
}

export interface Prova {
  id: number
  user_id: string
  data: string | null
  disciplina_id: number | null
  turma_id: number | null
  num_questoes: number
  num_alternativas: number
  bloco: string
  status: 'aberta' | 'corrigida' | 'excluida'
  gabarito: string | null
  gabarito_grupo: string | null
  modo_avaliacao: 'acertos' | 'nota'
  nota_total: number | null
  pesos_questoes: string | null
  prazo_correcao: string | null
  created_at: string
  // Joined fields
  disciplina?: Disciplina
  turma?: Turma
}

export interface Resultado {
  id: number
  user_id: string
  prova_id: number
  aluno_id: number
  presenca: string | null
  respostas: Record<string, number> | null
  acertos: number | null
  percentual: number | null
  nota: number | null
  created_at: string
  updated_at: string
  // Joined
  aluno?: Aluno
}
