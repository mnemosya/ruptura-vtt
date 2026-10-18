-- =====================================================================
-- Mensagem/rolagem "Privada" passa a ser SÓ de quem criou
--
-- Até aqui o dono da mesa via tudo (`table_logs_owner_select`, 0006),
-- inclusive o `private` dos jogadores — "Privada" era, na prática, "só
-- você e o narrador". O chat já chamava a opção de "Só eu", e a mesa
-- pediu que fosse isso mesmo: nem o narrador vê o `private` de outra
-- pessoa. O narrador continua vendo `public`, `gm` e o próprio
-- `private`.
--
-- Membro (`table_logs_member_select`, 20261007120000) já seguia essa
-- regra; só a policy do dono muda. Realtime avalia RLS por assinante,
-- então o filtro vale ao vivo também.
-- =====================================================================

begin;

drop policy if exists table_logs_owner_select on public.table_logs;

create policy table_logs_owner_select on public.table_logs
  for select
  to authenticated
  using (
    campaign_id in (select id from public.campaigns where owner_id = (select auth.uid()))
    and (
      visibility <> 'private'
      or created_by_user_id = (select auth.uid())
    )
  );

commit;
