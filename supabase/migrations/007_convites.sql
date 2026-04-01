-- ── Tabela de convites para workspace ──
create table if not exists public.convites (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  email text not null,
  token text unique not null,
  criado_por uuid not null references auth.users(id) on delete cascade,
  usado boolean not null default false,
  created_at timestamptz not null default now()
);

-- Índice para busca por token
create index if not exists idx_convites_token on public.convites(token);

-- Índice para busca por email (pendentes)
create index if not exists idx_convites_email on public.convites(email) where usado = false;

-- RLS
alter table public.convites enable row level security;

-- Membros do workspace podem ver convites
create policy "Membros veem convites do workspace" on public.convites
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

-- Apenas donos podem criar convites
create policy "Donos criam convites" on public.convites
  for insert with check (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid() and role = 'dono'
    )
  );

-- Donos podem deletar convites (cancelar)
create policy "Donos deletam convites" on public.convites
  for delete using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid() and role = 'dono'
    )
  );

-- Service role pode atualizar (marcar como usado)
-- Nota: o update via service role (API aceitar-convite) bypassa RLS
