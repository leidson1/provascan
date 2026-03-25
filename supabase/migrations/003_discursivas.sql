-- ═══════════════════════════════════════════════════════════
--  MIGRATION 003: Suporte a Questões Discursivas e Mistas
-- ═══════════════════════════════════════════════════════════

-- Tipo de prova: objetiva (padrão), mista ou discursiva
ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS tipo_prova text DEFAULT 'objetiva'
  CHECK (tipo_prova IN ('objetiva', 'mista', 'discursiva'));

-- Tipos de questões: comma-separated "O,O,D,D,O,..."
-- O = Objetiva, D = Discursiva
ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS tipos_questoes text;

-- Critério para questões discursivas: 2, 3 ou 4 níveis
-- 2 = Certo/Errado
-- 3 = Certo/Parcial/Errado
-- 4 = Excelente/Bom/Parcial/Insuficiente
ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS criterio_discursiva int DEFAULT 3;
