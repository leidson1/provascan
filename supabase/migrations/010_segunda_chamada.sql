-- Segunda chamada: referência à prova original
ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS prova_origem_id bigint REFERENCES provas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_provas_origem ON provas(prova_origem_id);
