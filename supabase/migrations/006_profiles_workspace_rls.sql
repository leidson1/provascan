-- Permitir que membros do mesmo workspace vejam os perfis uns dos outros
CREATE POLICY "workspace_members_can_view_profiles" ON profiles
  FOR SELECT USING (
    id IN (
      SELECT wm.user_id FROM workspace_members wm
      WHERE wm.workspace_id IN (
        SELECT user_workspaces(auth.uid())
      )
    )
  );
