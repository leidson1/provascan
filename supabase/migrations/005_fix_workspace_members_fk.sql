-- Adicionar FK de workspace_members.user_id para profiles.id
-- Isso permite o PostgREST fazer join entre workspace_members e profiles
ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_profile_fk
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
