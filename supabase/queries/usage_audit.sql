-- ProvaScan - Auditoria de uso
-- Rode os blocos separadamente no SQL Editor do Supabase.
-- Observacao importante:
-- Cada usuario novo cria automaticamente um workspace proprio.
-- Portanto, "total de workspaces" nao significa "total de escolas".

-- =========================================================
-- 1) RESUMO GLOBAL
-- =========================================================
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from auth.users where confirmed_at is not null) as auth_users_confirmed,
  (select count(*) from auth.users where last_sign_in_at is not null) as auth_users_with_login,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.profiles where accepted_terms_at is not null) as profiles_with_terms_acceptance,
  (select count(*) from public.workspaces) as workspaces,
  (select count(*) from public.workspace_members) as workspace_members,
  (select count(*) from public.workspace_members where role = 'dono') as donos,
  (select count(*) from public.workspace_members where role = 'coordenador') as coordenadores,
  (select count(*) from public.workspace_members where role = 'corretor') as corretores,
  (select count(*) from public.convites) as convites_total,
  (select count(*) from public.convites where usado = true) as convites_usados,
  (select count(*) from public.convites where usado = false) as convites_pendentes,
  (select count(*) from public.disciplinas) as disciplinas,
  (select count(*) from public.turmas) as turmas,
  (select count(*) from public.alunos) as alunos,
  (select count(*) from public.provas) as provas,
  (select count(*) from public.resultados) as resultados;


-- =========================================================
-- 2) RESUMO POR WORKSPACE
-- =========================================================
with owners as (
  select
    wm.workspace_id,
    p.nome as dono_nome,
    p.email as dono_email
  from public.workspace_members wm
  join public.profiles p on p.id = wm.user_id
  where wm.role = 'dono'
),
member_counts as (
  select
    workspace_id,
    count(*) as total_membros,
    count(*) filter (where role = 'dono') as donos,
    count(*) filter (where role = 'coordenador') as coordenadores,
    count(*) filter (where role = 'corretor') as corretores
  from public.workspace_members
  group by workspace_id
),
turma_counts as (
  select workspace_id, count(*) as total_turmas
  from public.turmas
  group by workspace_id
),
aluno_counts as (
  select workspace_id, count(*) as total_alunos
  from public.alunos
  group by workspace_id
),
prova_counts as (
  select workspace_id, count(*) as total_provas
  from public.provas
  group by workspace_id
),
resultado_counts as (
  select workspace_id, count(*) as total_resultados
  from public.resultados
  group by workspace_id
),
convite_counts as (
  select
    workspace_id,
    count(*) as total_convites,
    count(*) filter (where usado = true) as convites_usados,
    count(*) filter (where usado = false) as convites_pendentes
  from public.convites
  group by workspace_id
),
last_activity as (
  select
    activity.workspace_id,
    max(activity.activity_at) as ultima_atividade
  from (
    select id as workspace_id, created_at as activity_at from public.workspaces
    union all
    select workspace_id, created_at from public.workspace_members
    union all
    select workspace_id, created_at from public.turmas
    union all
    select workspace_id, created_at from public.alunos
    union all
    select workspace_id, created_at from public.provas
    union all
    select workspace_id, created_at from public.resultados
  ) activity
  group by activity.workspace_id
)
select
  w.id as workspace_id,
  coalesce(w.nome_instituicao, w.nome) as workspace,
  w.nome_instituicao,
  w.nome as workspace_nome_interno,
  o.dono_nome,
  o.dono_email,
  w.created_at as workspace_created_at,
  coalesce(mc.total_membros, 0) as membros,
  coalesce(mc.donos, 0) as donos,
  coalesce(mc.coordenadores, 0) as coordenadores,
  coalesce(mc.corretores, 0) as corretores,
  coalesce(tc.total_turmas, 0) as turmas,
  coalesce(ac.total_alunos, 0) as alunos,
  coalesce(pc.total_provas, 0) as provas,
  coalesce(rc.total_resultados, 0) as resultados,
  coalesce(cc.total_convites, 0) as convites_total,
  coalesce(cc.convites_usados, 0) as convites_usados,
  coalesce(cc.convites_pendentes, 0) as convites_pendentes,
  la.ultima_atividade
from public.workspaces w
left join owners o on o.workspace_id = w.id
left join member_counts mc on mc.workspace_id = w.id
left join turma_counts tc on tc.workspace_id = w.id
left join aluno_counts ac on ac.workspace_id = w.id
left join prova_counts pc on pc.workspace_id = w.id
left join resultado_counts rc on rc.workspace_id = w.id
left join convite_counts cc on cc.workspace_id = w.id
left join last_activity la on la.workspace_id = w.id
order by resultados desc, provas desc, alunos desc, w.id;


-- =========================================================
-- 3) WORKSPACES COM MAIOR USO REAL
-- =========================================================
with workspace_usage as (
  select
    w.id as workspace_id,
    coalesce(w.nome_instituicao, w.nome) as workspace,
    coalesce((select count(*) from public.alunos a where a.workspace_id = w.id), 0) as alunos,
    coalesce((select count(*) from public.provas p where p.workspace_id = w.id), 0) as provas,
    coalesce((select count(*) from public.resultados r where r.workspace_id = w.id), 0) as resultados
  from public.workspaces w
)
select *
from workspace_usage
where alunos > 0 or provas > 0 or resultados > 0
order by resultados desc, provas desc, alunos desc
limit 20;


-- =========================================================
-- 4) WORKSPACES VAZIOS OU QUASE VAZIOS
-- =========================================================
with workspace_usage as (
  select
    w.id as workspace_id,
    coalesce(w.nome_instituicao, w.nome) as workspace,
    coalesce((select count(*) from public.workspace_members wm where wm.workspace_id = w.id), 0) as membros,
    coalesce((select count(*) from public.turmas t where t.workspace_id = w.id), 0) as turmas,
    coalesce((select count(*) from public.alunos a where a.workspace_id = w.id), 0) as alunos,
    coalesce((select count(*) from public.provas p where p.workspace_id = w.id), 0) as provas,
    coalesce((select count(*) from public.resultados r where r.workspace_id = w.id), 0) as resultados
  from public.workspaces w
)
select *
from workspace_usage
where turmas = 0 and alunos = 0 and provas = 0 and resultados = 0
order by workspace_id;


-- =========================================================
-- 5) PROVAS - STATUS, TIPO E COBERTURA
-- =========================================================
select status, count(*) as total
from public.provas
group by status
order by total desc;

select coalesce(tipo_prova, 'sem_tipo') as tipo_prova, count(*) as total
from public.provas
group by coalesce(tipo_prova, 'sem_tipo')
order by total desc;

select modo_avaliacao, count(*) as total
from public.provas
group by modo_avaliacao
order by total desc;

with resultados_por_prova as (
  select prova_id, count(*) as total_resultados
  from public.resultados
  group by prova_id
)
select
  count(*) as total_provas,
  count(*) filter (where rpp.prova_id is not null) as provas_com_resultados,
  count(*) filter (where rpp.prova_id is null) as provas_sem_resultados,
  round(avg(coalesce(rpp.total_resultados, 0))::numeric, 2) as media_resultados_por_prova
from public.provas p
left join resultados_por_prova rpp on rpp.prova_id = p.id;


-- =========================================================
-- 6) TOP PROVAS POR VOLUME DE CORRECAO
-- =========================================================
select
  p.id as prova_id,
  coalesce(w.nome_instituicao, w.nome) as workspace,
  d.nome as disciplina,
  concat_ws(' ', t.serie, t.turma) as turma,
  p.data,
  p.status,
  p.tipo_prova,
  count(r.id) as total_resultados,
  max(r.created_at) as ultima_correcao
from public.provas p
left join public.workspaces w on w.id = p.workspace_id
left join public.disciplinas d on d.id = p.disciplina_id
left join public.turmas t on t.id = p.turma_id
left join public.resultados r on r.prova_id = p.id
group by p.id, w.nome_instituicao, w.nome, d.nome, t.serie, t.turma, p.data, p.status, p.tipo_prova
order by total_resultados desc, p.id desc
limit 30;


-- =========================================================
-- 7) CONVITES - FUNIL E PENDENCIAS
-- =========================================================
select
  count(*) as total_convites,
  count(*) filter (where usado = true) as convites_usados,
  count(*) filter (where usado = false) as convites_pendentes,
  round(
    100.0 * count(*) filter (where usado = true) / nullif(count(*), 0),
    2
  ) as taxa_aproveitamento_percentual
from public.convites;

select
  coalesce(w.nome_instituicao, w.nome) as workspace,
  count(*) as total_convites,
  count(*) filter (where c.usado = true) as usados,
  count(*) filter (where c.usado = false) as pendentes,
  max(c.created_at) as ultimo_convite
from public.convites c
join public.workspaces w on w.id = c.workspace_id
group by coalesce(w.nome_instituicao, w.nome)
order by pendentes desc, total_convites desc;

select
  c.id,
  c.workspace_id,
  coalesce(w.nome_instituicao, w.nome) as workspace,
  c.email,
  c.role,
  c.created_at
from public.convites c
join public.workspaces w on w.id = c.workspace_id
where c.usado = false
order by c.created_at desc;


-- =========================================================
-- 8) USUARIOS - CADASTRO E ULTIMO ACESSO
-- =========================================================
select
  u.id,
  u.email,
  u.created_at,
  u.confirmed_at,
  u.last_sign_in_at,
  p.nome,
  p.accepted_terms_at
from auth.users u
left join public.profiles p on p.id = u.id
order by u.last_sign_in_at desc nulls last, u.created_at desc
limit 200;

select
  u.id,
  u.email,
  u.created_at,
  p.nome
from auth.users u
left join public.profiles p on p.id = u.id
where u.last_sign_in_at is null
order by u.created_at desc;


-- =========================================================
-- 9) LINHA DO TEMPO - ULTIMOS 30 DIAS
-- Observacao:
-- last_sign_in_at guarda apenas o ULTIMO login de cada usuario.
-- Portanto, "usuarios_com_ultimo_login_no_dia" nao e historico completo
-- de sessoes; e apenas uma foto do ultimo acesso conhecido.
-- =========================================================
with dias as (
  select generate_series(
    current_date - interval '29 days',
    current_date,
    interval '1 day'
  )::date as dia
),
signups as (
  select created_at::date as dia, count(*) as total
  from auth.users
  group by created_at::date
),
ultimos_logins as (
  select last_sign_in_at::date as dia, count(*) as total
  from auth.users
  where last_sign_in_at is not null
  group by last_sign_in_at::date
),
provas_criadas as (
  select created_at::date as dia, count(*) as total
  from public.provas
  group by created_at::date
),
resultados_criados as (
  select created_at::date as dia, count(*) as total
  from public.resultados
  group by created_at::date
),
convites_criados as (
  select created_at::date as dia, count(*) as total
  from public.convites
  group by created_at::date
)
select
  d.dia,
  coalesce(s.total, 0) as signups,
  coalesce(l.total, 0) as usuarios_com_ultimo_login_no_dia,
  coalesce(p.total, 0) as provas_criadas,
  coalesce(r.total, 0) as resultados_criados,
  coalesce(c.total, 0) as convites_criados
from dias d
left join signups s on s.dia = d.dia
left join ultimos_logins l on l.dia = d.dia
left join provas_criadas p on p.dia = d.dia
left join resultados_criados r on r.dia = d.dia
left join convites_criados c on c.dia = d.dia
order by d.dia desc;


-- =========================================================
-- 10) DETALHE DE UM WORKSPACE ESPECIFICO
-- Troque o numero 87 pelo workspace desejado.
-- =========================================================
with alvo as (
  select 87::bigint as workspace_id
)
select
  w.id as workspace_id,
  coalesce(w.nome_instituicao, w.nome) as workspace,
  w.nome_instituicao,
  w.nome,
  w.created_at,
  (select count(*) from public.workspace_members wm where wm.workspace_id = w.id) as membros,
  (select count(*) from public.turmas t where t.workspace_id = w.id) as turmas,
  (select count(*) from public.alunos a where a.workspace_id = w.id) as alunos,
  (select count(*) from public.provas p where p.workspace_id = w.id) as provas,
  (select count(*) from public.resultados r where r.workspace_id = w.id) as resultados,
  (select count(*) from public.convites c where c.workspace_id = w.id and c.usado = false) as convites_pendentes
from public.workspaces w
join alvo a on a.workspace_id = w.id;

select
  wm.id,
  wm.role,
  wm.created_at,
  p.nome,
  p.email
from public.workspace_members wm
join public.profiles p on p.id = wm.user_id
where wm.workspace_id = 87
order by
  case wm.role
    when 'dono' then 1
    when 'coordenador' then 2
    else 3
  end,
  p.nome;

select
  p.id as prova_id,
  d.nome as disciplina,
  concat_ws(' ', t.serie, t.turma) as turma,
  p.data,
  p.status,
  p.tipo_prova,
  count(r.id) as resultados
from public.provas p
left join public.disciplinas d on d.id = p.disciplina_id
left join public.turmas t on t.id = p.turma_id
left join public.resultados r on r.prova_id = p.id
where p.workspace_id = 87
group by p.id, d.nome, t.serie, t.turma, p.data, p.status, p.tipo_prova
order by p.id desc;
