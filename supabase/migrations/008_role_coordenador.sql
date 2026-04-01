-- ── Adicionar papel 'coordenador' ao sistema ──

-- 1. Atualizar CHECK constraint em workspace_members
alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check
  check (role in ('dono', 'coordenador', 'corretor'));

-- 2. Adicionar coluna 'role' na tabela de convites
alter table public.convites add column if not exists role text not null default 'corretor';

-- 3. Atualizar função de workspaces gerenciados (dono + coordenador)
create or replace function public.user_managed_workspaces(uid uuid default auth.uid())
returns setof bigint as $$
  select workspace_id from public.workspace_members
  where user_id = uid and role in ('dono', 'coordenador')
$$ language sql security definer stable;

-- 4. Atualizar RLS para permitir coordenadores inserirem/atualizarem dados
-- Disciplinas
drop policy if exists "Donos inserem disciplinas" on public.disciplinas;
create policy "Gestores inserem disciplinas" on public.disciplinas
  for insert with check (workspace_id in (select user_managed_workspaces()));

drop policy if exists "Donos atualizam disciplinas" on public.disciplinas;
create policy "Gestores atualizam disciplinas" on public.disciplinas
  for update using (workspace_id in (select user_managed_workspaces()));

-- Turmas
drop policy if exists "Donos inserem turmas" on public.turmas;
create policy "Gestores inserem turmas" on public.turmas
  for insert with check (workspace_id in (select user_managed_workspaces()));

drop policy if exists "Donos atualizam turmas" on public.turmas;
create policy "Gestores atualizam turmas" on public.turmas
  for update using (workspace_id in (select user_managed_workspaces()));

-- Alunos
drop policy if exists "Donos inserem alunos" on public.alunos;
create policy "Gestores inserem alunos" on public.alunos
  for insert with check (workspace_id in (select user_managed_workspaces()));

drop policy if exists "Donos atualizam alunos" on public.alunos;
create policy "Gestores atualizam alunos" on public.alunos
  for update using (workspace_id in (select user_managed_workspaces()));

-- Provas
drop policy if exists "Donos inserem provas" on public.provas;
create policy "Gestores inserem provas" on public.provas
  for insert with check (workspace_id in (select user_managed_workspaces()));

drop policy if exists "Donos atualizam provas" on public.provas;
create policy "Gestores atualizam provas" on public.provas
  for update using (workspace_id in (select user_managed_workspaces()));

-- Nota: DELETE continua sendo apenas para donos (via user_owned_workspaces)
-- Convites: coordenadores NÃO gerenciam equipe, apenas donos
