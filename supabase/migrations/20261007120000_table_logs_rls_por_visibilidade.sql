-- =====================================================================
-- table_logs: RLS passa a filtrar por visibilidade (TOK-02).
--
-- ── Por que ──────────────────────────────────────────────────────────
--
-- `table_logs_member_select` (0043) liberava QUALQUER linha da campanha
-- para qualquer membro. O filtro "jogador nunca vê gm, só vê o próprio
-- private" existia apenas em `listLogsForViewer` (app), depois de ler
-- tudo. E a tabela está em `supabase_realtime`: o INSERT de um log `gm`
-- chegava inteiro ao navegador do jogador pelo `postgres_changes`.
--
-- Isso fura o TOK-02: ação de/contra token oculto vira log `gm`
-- (`read_vtt_action_context`, 0149) justamente para não vazar o token —
-- e vazava pelo payload do realtime.
--
-- ── Regra ────────────────────────────────────────────────────────────
--
--   · dono da mesa: tudo (policy `table_logs_owner_select`, intocada);
--   · membro: `public` + o que ele mesmo criou (`private` próprio).
--     Nunca `gm` de outra pessoa.
--
-- Realtime avalia RLS por assinante, então o mesmo filtro vale ao vivo.
-- =====================================================================

begin;

drop policy if exists table_logs_member_select on public.table_logs;

create policy table_logs_member_select on public.table_logs
  for select
  to authenticated
  using (
    is_campaign_member(campaign_id)
    and (
      visibility = 'public'
      or created_by_user_id = (select auth.uid())
    )
  );

commit;
