-- ═══════════════════════════════════════════════════════════
--  MIGRATION 012: Fixes de seguranca
--  Apenas SQL aditivo e idempotente
-- ═══════════════════════════════════════════════════════════

-- ── A. Permitir que membros saiam do workspace ─────────────
-- Hoje apenas o dono pode deletar em workspace_members ("owner_can_delete"),
-- entao "Sair do workspace" afeta 0 linhas em silencio.
drop policy if exists "member_can_leave" on public.workspace_members;
create policy "member_can_leave" on public.workspace_members
  for delete using (user_id = auth.uid());

-- ── B. Indice ausente em resultados(aluno_id) ───────────────
create index if not exists idx_resultados_aluno on public.resultados(aluno_id);

-- ── C. CHECK em convites.role ───────────────────────────────
-- Normalizar valores fora da whitelist antes de criar a constraint.
update public.convites
set role = 'corretor'
where role not in ('coordenador', 'corretor');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'convites_role_check'
      and conrelid = 'public.convites'::regclass
  ) then
    alter table public.convites
      add constraint convites_role_check
      check (role in ('coordenador', 'corretor')) not valid;
  end if;
end $$;

alter table public.convites validate constraint convites_role_check;

-- ── D. Fixar search_path nas funcoes SECURITY DEFINER ───────
-- Evita hijack de search_path em funcoes que rodam com privilegios elevados.
-- Assinaturas conforme migrations 001, 002 e 008.
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.seed_default_disciplinas() set search_path = public, pg_temp;
alter function public.handle_new_profile() set search_path = public, pg_temp;
alter function public.user_workspaces(uuid) set search_path = public, pg_temp;
alter function public.user_owned_workspaces(uuid) set search_path = public, pg_temp;
alter function public.user_managed_workspaces(uuid) set search_path = public, pg_temp;
