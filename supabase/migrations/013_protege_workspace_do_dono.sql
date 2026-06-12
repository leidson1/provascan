-- ════════════════════════════════════════════════════════════════
-- Migration 013: protege o workspace contra exclusão em cascata
-- ════════════════════════════════════════════════════════════════
-- workspaces.created_by referenciava auth.users com ON DELETE CASCADE:
-- excluir a conta auth do dono apagava o workspace inteiro em cascata —
-- membros, disciplinas, turmas, alunos, provas e resultados de toda a
-- equipe. Com RESTRICT, a exclusão da conta do dono passa a ser bloqueada
-- enquanto o workspace existir (o workspace precisa ser excluído ou
-- transferido explicitamente antes).

alter table public.workspaces
  drop constraint if exists workspaces_created_by_fkey;

alter table public.workspaces
  add constraint workspaces_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete restrict;
