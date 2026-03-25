-- ═══════════════════════════════════════════════════════════
--  MIGRATION 002: Workspaces + Equipe + Roles
--  Transforma tenancy de user_id para workspace_id
-- ═══════════════════════════════════════════════════════════

-- ── FASE A: Novas tabelas ────────────────────────────────

create table if not exists public.workspaces (
  id bigint generated always as identity primary key,
  nome text not null,
  nome_instituicao text,
  logo_url text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

alter table public.workspaces enable row level security;

create table if not exists public.workspace_members (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('dono', 'corretor')),
  created_at timestamptz default now(),
  unique(workspace_id, user_id)
);

create index idx_wm_user on workspace_members(user_id);
create index idx_wm_workspace on workspace_members(workspace_id);
alter table public.workspace_members enable row level security;

-- ── FASE B: Adicionar workspace_id nas tabelas existentes ─

alter table public.disciplinas add column if not exists workspace_id bigint references workspaces(id) on delete cascade;
alter table public.turmas add column if not exists workspace_id bigint references workspaces(id) on delete cascade;
alter table public.alunos add column if not exists workspace_id bigint references workspaces(id) on delete cascade;
alter table public.provas add column if not exists workspace_id bigint references workspaces(id) on delete cascade;
alter table public.resultados add column if not exists workspace_id bigint references workspaces(id) on delete cascade;

-- ── FASE C: Backfill - criar workspaces para usuários existentes ─

-- Criar um workspace para cada perfil existente
insert into public.workspaces (nome, created_by)
select p.nome, p.id
from public.profiles p
where not exists (
  select 1 from public.workspaces w where w.created_by = p.id
);

-- Adicionar como dono
insert into public.workspace_members (workspace_id, user_id, role)
select w.id, w.created_by, 'dono'
from public.workspaces w
where not exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id = w.id and wm.user_id = w.created_by
);

-- Atualizar workspace_id nos dados existentes
update public.disciplinas d
set workspace_id = (select w.id from workspaces w where w.created_by = d.user_id limit 1)
where d.workspace_id is null;

update public.turmas t
set workspace_id = (select w.id from workspaces w where w.created_by = t.user_id limit 1)
where t.workspace_id is null;

update public.alunos a
set workspace_id = (select w.id from workspaces w where w.created_by = a.user_id limit 1)
where a.workspace_id is null;

update public.provas p
set workspace_id = (select w.id from workspaces w where w.created_by = p.user_id limit 1)
where p.workspace_id is null;

update public.resultados r
set workspace_id = (select w.id from workspaces w where w.created_by = r.user_id limit 1)
where r.workspace_id is null;

-- ── FASE D: Indexes ──────────────────────────────────────

create index if not exists idx_disciplinas_workspace on disciplinas(workspace_id);
create index if not exists idx_turmas_workspace on turmas(workspace_id);
create index if not exists idx_alunos_workspace on alunos(workspace_id);
create index if not exists idx_provas_workspace on provas(workspace_id);
create index if not exists idx_resultados_workspace on resultados(workspace_id);

-- ── FASE E: Funções helper de RLS ────────────────────────

create or replace function public.user_workspaces(uid uuid)
returns setof bigint as $$
  select workspace_id from public.workspace_members where user_id = uid
$$ language sql security definer stable;

create or replace function public.user_owned_workspaces(uid uuid)
returns setof bigint as $$
  select workspace_id from public.workspace_members where user_id = uid and role = 'dono'
$$ language sql security definer stable;

-- ── FASE F: Novas RLS policies ───────────────────────────

-- Workspaces
create policy "members_can_view" on workspaces for select
  using (id in (select user_workspaces(auth.uid())));
create policy "owner_can_update" on workspaces for update
  using (id in (select user_owned_workspaces(auth.uid())));
create policy "authenticated_can_insert" on workspaces for insert
  with check (auth.uid() = created_by);

-- Workspace Members
create policy "members_can_view" on workspace_members for select
  using (workspace_id in (select user_workspaces(auth.uid())));
create policy "owner_can_insert" on workspace_members for insert
  with check (workspace_id in (select user_owned_workspaces(auth.uid())));
create policy "owner_can_delete" on workspace_members for delete
  using (workspace_id in (select user_owned_workspaces(auth.uid())));

-- Disciplinas: substituir policies antigas
drop policy if exists "Own data select" on disciplinas;
drop policy if exists "Own data insert" on disciplinas;
drop policy if exists "Own data update" on disciplinas;
drop policy if exists "Own data delete" on disciplinas;

create policy "ws_select" on disciplinas for select
  using (workspace_id in (select user_workspaces(auth.uid())));
create policy "ws_insert" on disciplinas for insert
  with check (workspace_id in (select user_owned_workspaces(auth.uid())));
create policy "ws_update" on disciplinas for update
  using (workspace_id in (select user_owned_workspaces(auth.uid())));
create policy "ws_delete" on disciplinas for delete
  using (workspace_id in (select user_owned_workspaces(auth.uid())));

-- Turmas
drop policy if exists "Own data select" on turmas;
drop policy if exists "Own data insert" on turmas;
drop policy if exists "Own data update" on turmas;
drop policy if exists "Own data delete" on turmas;

create policy "ws_select" on turmas for select
  using (workspace_id in (select user_workspaces(auth.uid())));
create policy "ws_insert" on turmas for insert
  with check (workspace_id in (select user_owned_workspaces(auth.uid())));
create policy "ws_update" on turmas for update
  using (workspace_id in (select user_owned_workspaces(auth.uid())));
create policy "ws_delete" on turmas for delete
  using (workspace_id in (select user_owned_workspaces(auth.uid())));

-- Alunos
drop policy if exists "Own data select" on alunos;
drop policy if exists "Own data insert" on alunos;
drop policy if exists "Own data update" on alunos;
drop policy if exists "Own data delete" on alunos;

create policy "ws_select" on alunos for select
  using (workspace_id in (select user_workspaces(auth.uid())));
create policy "ws_insert" on alunos for insert
  with check (workspace_id in (select user_owned_workspaces(auth.uid())));
create policy "ws_update" on alunos for update
  using (workspace_id in (select user_owned_workspaces(auth.uid())));
create policy "ws_delete" on alunos for delete
  using (workspace_id in (select user_owned_workspaces(auth.uid())));

-- Provas
drop policy if exists "Own data select" on provas;
drop policy if exists "Own data insert" on provas;
drop policy if exists "Own data update" on provas;
drop policy if exists "Own data delete" on provas;

create policy "ws_select" on provas for select
  using (workspace_id in (select user_workspaces(auth.uid())));
create policy "ws_insert" on provas for insert
  with check (workspace_id in (select user_owned_workspaces(auth.uid())));
create policy "ws_update" on provas for update
  using (workspace_id in (select user_owned_workspaces(auth.uid())));
create policy "ws_delete" on provas for delete
  using (workspace_id in (select user_owned_workspaces(auth.uid())));

-- Resultados: corretores PODEM inserir e atualizar (corrigir provas)
drop policy if exists "Own data select" on resultados;
drop policy if exists "Own data insert" on resultados;
drop policy if exists "Own data update" on resultados;
drop policy if exists "Own data delete" on resultados;

create policy "ws_select" on resultados for select
  using (workspace_id in (select user_workspaces(auth.uid())));
create policy "ws_insert" on resultados for insert
  with check (workspace_id in (select user_workspaces(auth.uid())));
create policy "ws_update" on resultados for update
  using (workspace_id in (select user_workspaces(auth.uid())));
create policy "ws_delete" on resultados for delete
  using (workspace_id in (select user_owned_workspaces(auth.uid())));

-- ── FASE G: Atualizar trigger de signup ──────────────────

create or replace function public.handle_new_profile()
returns trigger as $$
declare
  ws_id bigint;
begin
  -- Criar workspace
  insert into public.workspaces (nome, created_by)
  values (new.nome, new.id)
  returning id into ws_id;

  -- Adicionar como dono
  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, new.id, 'dono');

  -- Disciplinas padrão com workspace_id
  insert into public.disciplinas (user_id, workspace_id, nome) values
    (new.id, ws_id, 'Português'),
    (new.id, ws_id, 'Matemática'),
    (new.id, ws_id, 'Ciências'),
    (new.id, ws_id, 'História'),
    (new.id, ws_id, 'Geografia'),
    (new.id, ws_id, 'Física'),
    (new.id, ws_id, 'Química'),
    (new.id, ws_id, 'Biologia'),
    (new.id, ws_id, 'Inglês'),
    (new.id, ws_id, 'Educação Física'),
    (new.id, ws_id, 'Artes');

  return new;
end;
$$ language plpgsql security definer;

-- Substituir trigger antigo
drop trigger if exists on_profile_created_seed_disciplinas on public.profiles;
drop trigger if exists on_profile_created_setup_workspace on public.profiles;

create trigger on_profile_created_setup_workspace
  after insert on public.profiles
  for each row execute function public.handle_new_profile();
