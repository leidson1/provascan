export interface Profile {
  id: string
  nome: string
  email: string
  accepted_terms_at: string | null
  created_at: string
}

export interface Workspace {
  id: number
  nome: string
  nome_instituicao: string | null
  logo_url: string | null
  created_by: string
  created_at: string
}

export interface WorkspaceMember {
  id: number
  workspace_id: number
  user_id: string
  role: 'dono' | 'coordenador' | 'corretor'
  created_at: string
  // Joined
  workspace?: Workspace
  profile?: Profile
}

export interface Disciplina {
  id: number
  user_id: string
  workspace_id: number
  nome: string
  ativo: boolean
  created_at: string
}

export interface Turma {
  id: number
  user_id: string
  workspace_id: number
  serie: string
  turma: string
  turno: string | null
  ativo: boolean
  created_at: string
}

export interface Aluno {
  id: number
  user_id: string
  workspace_id: number
  turma_id: number
  nome: string
  numero: number | null
  ativo: boolean
  created_at: string
}

export interface Prova {
  id: number
  user_id: string
  workspace_id: number
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
  tipo_prova: 'objetiva' | 'mista' | 'discursiva'
  tipos_questoes: string | null
  criterio_discursiva: number
  modo_anulacao: 'contar_certa' | 'redistribuir'
  created_at: string
  // Joined fields
  disciplina?: Disciplina
  turma?: Turma
}

export type TipoQuestao = 'O' | 'D'

// Critérios de avaliação para questões discursivas
export const CRITERIOS_DISCURSIVA = {
  2: [
    { label: 'C', nome: 'Certo', valor: 1.0, cor: 'green' },
    { label: 'E', nome: 'Errado', valor: 0, cor: 'red' },
  ],
  3: [
    { label: 'C', nome: 'Certo', valor: 1.0, cor: 'green' },
    { label: 'P', nome: 'Parcial', valor: 0.5, cor: 'yellow' },
    { label: 'E', nome: 'Errado', valor: 0, cor: 'red' },
  ],
  4: [
    { label: 'E', nome: 'Excelente', valor: 1.0, cor: 'green' },
    { label: 'B', nome: 'Bom', valor: 0.75, cor: 'emerald' },
    { label: 'P', nome: 'Parcial', valor: 0.5, cor: 'yellow' },
    { label: 'I', nome: 'Insuficiente', valor: 0, cor: 'red' },
  ],
} as const

export interface Resultado {
  id: number
  user_id: string
  workspace_id: number
  prova_id: number
  aluno_id: number
  presenca: string | null
  respostas: Record<string, number | string> | null
  acertos: number | null
  percentual: number | null
  nota: number | null
  created_at: string
  updated_at: string
  // Joined
  aluno?: Aluno
}
