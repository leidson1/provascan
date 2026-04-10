-- ProvaScan 2.0 - Schema Inicial
-- Rodar no SQL Editor do Supabase Dashboard

-- ═══════════════════════════════════════════
--  PROFILES (estende auth.users)
-- ═══════════════════════════════════════════
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  accepted_terms_at timestamptz,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles
  for insert with check (auth.uid() = id);

-- Trigger: criar profile automaticamente no signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'nome',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════
--  DISCIPLINAS (matérias)
-- ═══════════════════════════════════════════
create table if not exists public.disciplinas (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  ativo boolean default true,
  created_at timestamptz default now()
);

create index idx_disciplinas_user on disciplinas(user_id);
alter table public.disciplinas enable row level security;

create policy "Own data select" on disciplinas for select using (auth.uid() = user_id);
create policy "Own data insert" on disciplinas for insert with check (auth.uid() = user_id);
create policy "Own data update" on disciplinas for update using (auth.uid() = user_id);
create policy "Own data delete" on disciplinas for delete using (auth.uid() = user_id);

-- ═══════════════════════════════════════════
--  TURMAS
-- ═══════════════════════════════════════════
create table if not exists public.turmas (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  serie text not null,
  turma text not null,
  turno text,
  ativo boolean default true,
  created_at timestamptz default now()
);

create index idx_turmas_user on turmas(user_id);
alter table public.turmas enable row level security;

create policy "Own data select" on turmas for select using (auth.uid() = user_id);
create policy "Own data insert" on turmas for insert with check (auth.uid() = user_id);
create policy "Own data update" on turmas for update using (auth.uid() = user_id);
create policy "Own data delete" on turmas for delete using (auth.uid() = user_id);

-- ═══════════════════════════════════════════
--  ALUNOS
-- ═══════════════════════════════════════════
create table if not exists public.alunos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  turma_id bigint not null references turmas(id) on delete cascade,
  nome text not null,
  numero int,
  ativo boolean default true,
  created_at timestamptz default now()
);

create index idx_alunos_user on alunos(user_id);
create index idx_alunos_turma on alunos(turma_id);
alter table public.alunos enable row level security;

create policy "Own data select" on alunos for select using (auth.uid() = user_id);
create policy "Own data insert" on alunos for insert with check (auth.uid() = user_id);
create policy "Own data update" on alunos for update using (auth.uid() = user_id);
create policy "Own data delete" on alunos for delete using (auth.uid() = user_id);

-- ═══════════════════════════════════════════
--  PROVAS
-- ═══════════════════════════════════════════
create table if not exists public.provas (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data date,
  disciplina_id bigint references disciplinas(id) on delete set null,
  turma_id bigint references turmas(id) on delete set null,
  num_questoes int not null default 10,
  num_alternativas int not null default 5,
  bloco text default 'B1',
  status text not null default 'aberta'
    check (status in ('aberta', 'corrigida', 'excluida')),
  gabarito text,
  gabarito_grupo text,
  modo_avaliacao text default 'acertos'
    check (modo_avaliacao in ('acertos', 'nota')),
  nota_total numeric(6,2),
  pesos_questoes text,
  prazo_correcao date,
  created_at timestamptz default now()
);

create index idx_provas_user on provas(user_id);
create index idx_provas_turma on provas(turma_id);
alter table public.provas enable row level security;

create policy "Own data select" on provas for select using (auth.uid() = user_id);
create policy "Own data insert" on provas for insert with check (auth.uid() = user_id);
create policy "Own data update" on provas for update using (auth.uid() = user_id);
create policy "Own data delete" on provas for delete using (auth.uid() = user_id);

-- ═══════════════════════════════════════════
--  RESULTADOS
-- ═══════════════════════════════════════════
create table if not exists public.resultados (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  prova_id bigint not null references provas(id) on delete cascade,
  aluno_id bigint not null references alunos(id) on delete cascade,
  presenca text,
  respostas jsonb,
  acertos numeric(6,2),
  percentual numeric(5,2),
  nota numeric(6,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(prova_id, aluno_id)
);

create index idx_resultados_user on resultados(user_id);
create index idx_resultados_prova on resultados(prova_id);
alter table public.resultados enable row level security;

create policy "Own data select" on resultados for select using (auth.uid() = user_id);
create policy "Own data insert" on resultados for insert with check (auth.uid() = user_id);
create policy "Own data update" on resultados for update using (auth.uid() = user_id);
create policy "Own data delete" on resultados for delete using (auth.uid() = user_id);

-- ═══════════════════════════════════════════
--  FUNÇÃO: Seed disciplinas padrão no cadastro
-- ═══════════════════════════════════════════
create or replace function public.seed_default_disciplinas()
returns trigger as $$
begin
  insert into public.disciplinas (user_id, nome) values
    (new.id, 'Português'),
    (new.id, 'Matemática'),
    (new.id, 'Ciências'),
    (new.id, 'História'),
    (new.id, 'Geografia'),
    (new.id, 'Física'),
    (new.id, 'Química'),
    (new.id, 'Biologia'),
    (new.id, 'Inglês'),
    (new.id, 'Educação Física'),
    (new.id, 'Artes');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_profile_created_seed_disciplinas
  after insert on public.profiles
  for each row execute function public.seed_default_disciplinas();
