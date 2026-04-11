-- Recuperação e diferenciação de tipo de vínculo (2ª chamada vs recuperação)
ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS tipo_vinculo text DEFAULT NULL;
ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS alunos_selecionados jsonb DEFAULT NULL;
