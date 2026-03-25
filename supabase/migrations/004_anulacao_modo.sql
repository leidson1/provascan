-- ═══════════════════════════════════════════════════════════
--  MIGRATION 004: Modo de Anulação de Questões
--  contar_certa = todos ganham ponto
--  redistribuir = peso redistribuído entre as demais
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS modo_anulacao text DEFAULT 'contar_certa'
  CHECK (modo_anulacao IN ('contar_certa', 'redistribuir'));
